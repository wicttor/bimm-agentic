// Shared LLM types and transport for the agent (task 2026-09-04-001-T03).
//
// One narrow internal vocabulary — messages + tool definitions in, text-or-tool-calls out — that
// every adapter (Anthropic, OpenAI, and the offline FakeProvider) implements. Provider wire-format
// knowledge lives only in the adapters; what is shared here is the contract, the typed error
// taxonomy, and the bounded-retry HTTP plumbing (so retry semantics cannot drift per provider).

import type { ProviderName } from "../config.ts";

/** A JSON object as parsed off the wire: every field is unknown until narrowed. */
export type WireJson = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

/** A request to the model to invoke a tool, with arguments already parsed from JSON. */
export interface ToolCall {
  /** Provider call id (OpenAI supplies one; Anthropic ids arrive with the tool_use block). */
  id: string;
  name: string;
  /** Parsed tool arguments. Adapters never hand raw JSON text back to the loop. */
  args: Record<string, unknown>;
}

/** Internal conversation turn. Adapters map these onto their own message shapes. */
export type Message =
  | { role: "user"; text: string }
  | { role: "assistant"; text?: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; content: string; isError?: boolean };

/** A tool the model may call. `parameters` is a JSON Schema object passed through verbatim. */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** Terminal reason a response stopped, normalized across providers. */
/** Terminal reasons a *successful* call can report; failures leave as `LlmError`. */
export type StopReason = "stop" | "tool_use" | "max_tokens";

/** Normalized token accounting; every provider reports the same four fields. */
export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export const EMPTY_USAGE: Usage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

/** What a provider call produces: text, tool calls, or both, plus accounting. */
export interface Completion {
  text?: string;
  toolCalls: ToolCall[];
  usage: Usage;
  stopReason: StopReason;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type LlmErrorKind =
  | "auth"
  | "rate_limit"
  | "server_error"
  | "network"
  | "invalid_response"
  | "malformed_arguments"
  | "timeout";

/** Whether a failure of this kind can plausibly succeed if the request is resent. */
const RETRYABLE_ERROR_KINDS: readonly LlmErrorKind[] = [
  "rate_limit",
  "server_error",
  "network",
  "timeout",
];

/**
 * Every failure surfaced by a provider adapter. `kind` is the classification the repair loop
 * branches on; `retryable` is derived from it, never supplied by callers.
 */
export class LlmError extends Error {
  readonly kind: LlmErrorKind;
  readonly retryable: boolean;
  readonly status?: number;
  readonly details: Record<string, unknown>;

  constructor(
    kind: LlmErrorKind,
    message: string,
    options: { status?: number; details?: Record<string, unknown> } = {},
  ) {
    super(message);
    this.name = "LlmError";
    this.kind = kind;
    this.retryable = RETRYABLE_ERROR_KINDS.includes(kind);
    this.status = options.status;
    this.details = options.details ?? {};
  }
}

/** Type guard for callers and tests — avoids loose casts when narrowing thrown values. */
export function isLlmError(err: unknown): err is LlmError {
  return err instanceof LlmError;
}

/**
 * Parse tool arguments into an object. Malformed or non-object payloads are a typed adapter
 * error: the loop must never read `undefined` off a half-parsed call. Anthropic delivers an
 * object, OpenAI a JSON string — both funnel through here so the failure mode is identical.
 */
export function parseToolArguments(
  raw: unknown,
  toolName: string,
  provider: string,
): Record<string, unknown> {
  const details = { provider, tool: toolName };
  const isPlainObject = typeof raw === "object" && raw !== null && !Array.isArray(raw);
  if (isPlainObject) return raw as Record<string, unknown>;
  if (typeof raw !== "string") {
    throw new LlmError(
      "malformed_arguments",
      `${provider}: tool "${toolName}" arguments were not a JSON object`,
      { details: { ...details, received: raw === null ? "null" : typeof raw } },
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new LlmError(
      "malformed_arguments",
      `${provider}: tool "${toolName}" arguments are not valid JSON`,
      { details: { ...details, raw } },
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new LlmError(
      "malformed_arguments",
      `${provider}: tool "${toolName}" arguments are not a JSON object`,
      { details: { ...details, raw } },
    );
  }
  return parsed as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Options, retry policy, transport
// ---------------------------------------------------------------------------

/** Anything that can wait; injectable so backoff tests never block on real timers. */
export type Sleep = (ms: number) => Promise<void>;

const defaultSleep: Sleep = (ms) =>
  new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });

export interface ProviderOptions {
  /** Model id sent on the wire (resolved upstream by agent/src/config.ts). */
  model: string;
  apiKey: string;
  /** Max total attempts including the first. Default 4. */
  maxAttempts?: number;
  /** Backoff delay before the next attempt (0 = after the first failure), in ms. */
  backoffMs?: (attempt: number) => number;
  /** Ceiling applied to `backoffMs` so the wait stays bounded. Default 30000. */
  maxBackoffMs?: number;
  /** Injectable wait — tests pass a recorder so no real time elapses. */
  sleep?: Sleep;
  /** Injectable transport; defaults to global `fetch`. */
  fetch?: typeof globalThis.fetch;
  /** Extra request headers. */
  headers?: Record<string, string>;
}

/** Retry/backoff defaults, bounded on both ends so a 429 storm cannot run unbounded. */
const RETRY_DEFAULTS = {
  maxAttempts: 4,
  baseBackoffMs: 500,
  maxBackoffMs: 30_000,
} as const;

interface RetryPolicy {
  maxAttempts: number;
  backoffMs: (attempt: number) => number;
  sleep: Sleep;
}

function resolveRetry(options: ProviderOptions): RetryPolicy {
  const maxAttempts = Math.max(1, options.maxAttempts ?? RETRY_DEFAULTS.maxAttempts);
  const maxBackoffMs = options.maxBackoffMs ?? RETRY_DEFAULTS.maxBackoffMs;
  const backoff = options.backoffMs ?? ((attempt: number) => RETRY_DEFAULTS.baseBackoffMs * 2 ** attempt);
  return {
    maxAttempts,
    backoffMs: (attempt: number) => Math.min(backoff(attempt), maxBackoffMs),
    sleep: options.sleep ?? defaultSleep,
  };
}

/** Map an HTTP status onto a classified, retry-flagged adapter error. */
function classifyHttpError(provider: string, status: number, payload: WireJson): LlmError {
  const kind: LlmErrorKind =
    status === 401 || status === 403
      ? "auth"
      : status === 429
        ? "rate_limit"
        : status >= 500
          ? "server_error"
          : "invalid_response";
  return new LlmError(kind, `${provider}: HTTP ${status} — ${providerMessage(payload)}`, {
    status,
    details: { provider, status, response: payload },
  });
}

function providerMessage(payload: WireJson): string {
  const err = payload["error"];
  if (typeof err === "string") return err;
  if (typeof err === "object" && err !== null) {
    const nested = (err as WireJson)["message"];
    if (typeof nested === "string") return nested;
  }
  const top = payload["message"];
  return typeof top === "string" ? top : "no message from provider";
}

async function readJsonBody(res: Response): Promise<WireJson> {
  try {
    const parsed = (await res.json()) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as WireJson) : {};
  } catch {
    return {};
  }
}

export interface HttpRequestSpec {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  /** Provider label used in error messages and `details`. */
  provider: string;
}

/**
 * POST a JSON payload with bounded exponential backoff, shared by both HTTP adapters. Transport
 * and HTTP failures leave as typed `LlmError`s; retryable ones are re-sent until the attempt cap,
 * and exactly one bounded wait happens per resend (never after the final attempt).
 */
export async function postJson(
  spec: HttpRequestSpec,
  options: ProviderOptions,
  signal?: AbortSignal,
): Promise<WireJson> {
  const policy = resolveRetry(options);
  const fetchImpl = options.fetch ?? globalThis.fetch;

  for (let attempt = 0; attempt < policy.maxAttempts; attempt += 1) {
    let outcome: { ok: true; payload: WireJson } | { ok: false; error: LlmError };
    try {
      const res = await fetchImpl(spec.url, {
        method: "POST",
        headers: { "content-type": "application/json", ...spec.headers },
        body: JSON.stringify(spec.body),
        signal,
      });
      const payload = await readJsonBody(res);
      outcome = res.ok
        ? { ok: true, payload }
        : { ok: false, error: classifyHttpError(spec.provider, res.status, payload) };
    } catch (cause) {
      const aborted = cause instanceof Error && cause.name === "AbortError";
      outcome = {
        ok: false,
        error: new LlmError(aborted ? "timeout" : "network", `${spec.provider}: ${String(cause)}`, {
          details: { provider: spec.provider, cause: String(cause) },
        }),
      };
    }

    if (outcome.ok) return outcome.payload;
    if (!outcome.error.retryable || attempt + 1 >= policy.maxAttempts) throw outcome.error;
    await policy.sleep(policy.backoffMs(attempt));
  }

  // Unreachable: every iteration returns, throws, or waits-and-loops, and maxAttempts >= 1.
  throw new LlmError("network", `${spec.provider}: no attempt completed`, {
    details: { provider: spec.provider, maxAttempts: policy.maxAttempts },
  });
}

// ---------------------------------------------------------------------------
// Wire JSON narrowing
// ---------------------------------------------------------------------------
// Both adapters parse untrusted provider payloads into these same coercions. They live here so a
// missing or mistyped field degrades to a default identically in every adapter instead of
// diverging per provider (and so no call site needs a cast).

export function isJsonObject(value: unknown): value is WireJson {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asJsonObjectArray(value: unknown): WireJson[] {
  return Array.isArray(value) ? value.filter(isJsonObject) : [];
}

export function asJsonString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function asJsonNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

// ---------------------------------------------------------------------------
// The provider interface
// ---------------------------------------------------------------------------

export interface CompleteRequest {
  /** Hoisted system prompt (Anthropic) or leading system message (OpenAI) — adapters decide. */
  system?: string;
  messages: Message[];
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

/**
 * The one interface the agentic loop is written against. AnthropicProvider, OpenAIProvider and
 * FakeProvider are interchangeable implementations of it — that substitutability is the AC.
 */
export interface LlmProvider {
  readonly name: ProviderName | "fake";
  readonly model: string;
  complete(request: CompleteRequest): Promise<Completion>;
}
