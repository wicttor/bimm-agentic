// Acceptance-Criterion test for task 2026-09-04-001-T03 (provider-agnostic LLM adapter).
//
// AC under test:
//   `AnthropicProvider` and `OpenAIProvider` each translate internal request/response types to
//   and from their wire format against a stubbed `fetch` (no network), and both satisfy the same
//   interface as `FakeProvider`, including normalized `usage` token counts and a terminal
//   `stopReason`.
//
// Every scenario asserts on the body actually handed to the stubbed global `fetch` (observed
// behavior), never on source text. No real network and no real timers: `fetch` is replaced for
// the whole file and backoff waits are injected as a recorder.

import { afterEach, describe, expect, it, vi } from "vitest";

import { AnthropicProvider } from "../src/llm/anthropic.ts";
import { FakeProvider } from "../src/llm/fake.ts";
import { OpenAIProvider } from "../src/llm/openai.ts";
import {
  LlmError,
  isLlmError,
  type Completion,
  type CompleteRequest,
  type LlmProvider,
  type Message,
  type ToolDefinition,
} from "../src/llm/provider.ts";

// ---------------------------------------------------------------------------
// Fixture input: one system prompt, one tool, one user turn.
// ---------------------------------------------------------------------------

const SYSTEM = "You build React components. Never redefine shared types.";

const TOOLS: ToolDefinition[] = [
  {
    name: "write_file",
    description: "Write a file inside the output directory",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
      },
      required: ["path", "content"],
    },
  },
];

const MESSAGES: Message[] = [{ role: "user", text: "Create src/types.ts" }];

const REQUEST: CompleteRequest = {
  system: SYSTEM,
  messages: MESSAGES,
  tools: TOOLS,
};

// ---------------------------------------------------------------------------
// fetch stub (no network, ever)
// ---------------------------------------------------------------------------

interface RecordedRequest {
  url: string;
  /** Parsed JSON body of the request. */
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

type Json = Record<string, unknown>;

const originalFetch = globalThis.fetch;

function normalizeHeaders(
  init: RequestInit | undefined,
): Record<string, string> {
  const raw = init?.headers;
  const out: Record<string, string> = {};
  if (raw === undefined) return out;
  if (raw instanceof Headers) {
    for (const [key, value] of raw.entries()) out[key.toLowerCase()] = value;
    return out;
  }
  if (Array.isArray(raw)) {
    for (const [key, value] of raw)
      out[String(key).toLowerCase()] = String(value);
    return out;
  }
  for (const [key, value] of Object.entries(raw)) {
    out[key.toLowerCase()] = String(value);
  }
  return out;
}

/**
 * Install a `globalThis.fetch` stub. Each queued responder is either a JSON payload (200) or an
 * `{ status, body }` shape; a function may read the recorded request. Calls beyond the queue
 * reuse the last responder so repeated retry attempts are observable.
 */
function stubFetch(
  ...responders: Array<
    | Json
    | { status: number; body: Json }
    | ((req: RecordedRequest) => Json | { status: number; body: Json })
  >
): { requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = typeof input === "string" ? input : String(input);
    const body =
      typeof init?.body === "string" ? (JSON.parse(init.body) as Json) : {};
    const req: RecordedRequest = { url, body, headers: normalizeHeaders(init) };
    requests.push(req);
    const responder =
      responders[Math.min(requests.length - 1, responders.length - 1)];
    const resolved =
      typeof responder === "function" ? responder(req) : responder;
    const isError =
      typeof resolved === "object" &&
      "status" in resolved &&
      typeof resolved["status"] === "number";
    const status = isError ? (resolved as { status: number }).status : 200;
    const payload = isError ? (resolved as { body: Json }).body : resolved;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => payload,
    } as unknown as Response;
  }) as unknown as typeof globalThis.fetch;
  return { requests };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

const anthropicTextResponse: Json = {
  id: "msg_test",
  role: "assistant",
  content: [{ type: "text", text: "hello" }],
  stop_reason: "end_turn",
  usage: {
    input_tokens: 11,
    output_tokens: 7,
    cache_read_input_tokens: 3,
    cache_creation_input_tokens: 2,
  },
};

const openaiTextResponse: Json = {
  id: "chatcmpl_test",
  choices: [
    {
      index: 0,
      message: { role: "assistant", content: "hello" },
      finish_reason: "stop",
    },
  ],
  usage: {
    prompt_tokens: 21,
    completion_tokens: 5,
    prompt_tokens_details: { cached_tokens: 4 },
  },
};

/** Backoff recorder: captures delays and resolves immediately, so no test waits on real time. */
function makeSleepSpy() {
  const delays: number[] = [];
  const sleep = async (ms: number) => {
    delays.push(ms);
  };
  return { delays, sleep };
}

// ---------------------------------------------------------------------------
// Scenario 1 — Anthropic request mapping
// ---------------------------------------------------------------------------

describe("AnthropicProvider request mapping", () => {
  it("maps internal tool defs to tools[].input_schema and hoists system to the top level", async () => {
    const { requests } = stubFetch(anthropicTextResponse);
    const provider = new AnthropicProvider({
      model: "claude-sonnet-4-5",
      apiKey: "k-test",
    });

    await provider.complete(REQUEST);

    const sent = requests[0];
    expect(sent).toBeDefined();
    expect(sent?.url).toContain("/v1/messages");

    // `system` is a top-level Anthropic field, never a message in the array.
    expect(sent?.body["system"]).toBe(SYSTEM);
    const messages = sent?.body["messages"] as Array<Json>;
    expect(messages.map((m) => m["role"])).toEqual(["user"]);
    expect(JSON.stringify(messages)).not.toContain("system");

    // Anthropic names the JSON Schema `input_schema`.
    const tools = sent?.body["tools"] as Array<Json>;
    expect(tools).toHaveLength(1);
    expect(tools[0]?.["name"]).toBe("write_file");
    expect(tools[0]?.["description"]).toBe(
      "Write a file inside the output directory",
    );
    expect(tools[0]?.["input_schema"]).toEqual(TOOLS[0]?.["parameters"]);
    expect(tools[0]?.["parameters"]).toBeUndefined();

    // Model and API version are sent explicitly; the key rides in a header, not the body.
    expect(sent?.body["model"]).toBe("claude-sonnet-4-5");
    expect(sent?.headers["anthropic-version"]).toBeTruthy();
    expect(sent?.headers["x-api-key"]).toBe("k-test");
    expect(sent?.body["api_key"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Scenario 2 — OpenAI request mapping
// ---------------------------------------------------------------------------

describe("OpenAIProvider request mapping", () => {
  it("maps the same internal input to tools[].function.parameters and a role:system message", async () => {
    const { requests } = stubFetch(openaiTextResponse);
    const provider = new OpenAIProvider({
      model: "gpt-5-nano",
      apiKey: "k-test",
    });

    await provider.complete(REQUEST);

    const sent = requests[0];
    expect(sent).toBeDefined();
    expect(sent?.url).toContain("/v1/chat/completions");

    // OpenAI has no top-level system field: it is the first message with role "system".
    expect(sent?.body["system"]).toBeUndefined();
    const messages = sent?.body["messages"] as Array<Json>;
    expect(messages[0]).toEqual({ role: "system", content: SYSTEM });
    expect(messages[1]).toEqual({
      role: "user",
      content: "Create src/types.ts",
    });

    // OpenAI nests the schema under function.parameters.
    const tools = sent?.body["tools"] as Array<Json>;
    expect(tools).toHaveLength(1);
    expect(tools[0]?.["type"]).toBe("function");
    const fn = tools[0]?.["function"] as Json;
    expect(fn["name"]).toBe("write_file");
    expect(fn["description"]).toBe("Write a file inside the output directory");
    expect(fn["parameters"]).toEqual(TOOLS[0]?.["parameters"]);
    expect(fn["input_schema"]).toBeUndefined();

    expect(sent?.body["model"]).toBe("gpt-5-nano");
    expect(sent?.headers["authorization"]).toBe("Bearer k-test");
    expect(sent?.body["api_key"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 — tool-call response parsing, one internal toolCall per wire shape
// ---------------------------------------------------------------------------

describe("tool call response normalization", () => {
  it("parses Anthropic content[].tool_use into an internal toolCall with object args", async () => {
    stubFetch({
      id: "msg_test",
      role: "assistant",
      content: [
        { type: "text", text: "Writing the file now." },
        {
          type: "tool_use",
          id: "toolu_test",
          name: "write_file",
          input: { path: "src/types.ts", content: "export interface Car {}" },
        },
      ],
      stop_reason: "tool_use",
      usage: { input_tokens: 30, output_tokens: 12 },
    });
    const provider = new AnthropicProvider({
      model: "claude-sonnet-4-5",
      apiKey: "k-test",
    });

    const result = await provider.complete(REQUEST);

    expect(result.toolCalls).toHaveLength(1);
    const call = result.toolCalls[0];
    expect(call?.name).toBe("write_file");
    expect(call?.args).toEqual({
      path: "src/types.ts",
      content: "export interface Car {}",
    });
    expect(typeof call?.id).toBe("string");
    expect(call?.id?.length).toBeGreaterThan(0);
    // Prose alongside the tool call survives.
    expect(result.text).toBe("Writing the file now.");
    expect(result.stopReason).toBe("tool_use");
  });

  it("parses OpenAI choices[].message.tool_calls into an internal toolCall with parsed JSON args", async () => {
    stubFetch({
      id: "chatcmpl_test",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_test",
                type: "function",
                function: {
                  name: "write_file",
                  arguments:
                    '{"path":"src/types.ts","content":"export interface Car {}"}',
                },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
      usage: { prompt_tokens: 40, completion_tokens: 15 },
    });
    const provider = new OpenAIProvider({
      model: "gpt-5-nano",
      apiKey: "k-test",
    });

    const result = await provider.complete(REQUEST);

    expect(result.toolCalls).toHaveLength(1);
    const call = result.toolCalls[0];
    expect(call?.name).toBe("write_file");
    // Wire args are a JSON **string**; internal args are a parsed object.
    expect(call?.args).toEqual({
      path: "src/types.ts",
      content: "export interface Car {}",
    });
    expect(call?.id).toBe("call_test");
    expect(result.stopReason).toBe("tool_use");
  });
});

// ---------------------------------------------------------------------------
// Scenario 4 — malformed arguments produce a typed adapter error
// ---------------------------------------------------------------------------

describe("malformed tool arguments", () => {
  it("OpenAI: unparsable arguments string yields a typed LlmError, not an undefined read", async () => {
    stubFetch({
      id: "chatcmpl_test",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_bad",
                type: "function",
                function: { name: "write_file", arguments: "{bad json" },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 3 },
    });
    const provider = new OpenAIProvider({
      model: "gpt-5-nano",
      apiKey: "k-test",
    });

    const err = await provider.complete(REQUEST).then(
      () => null,
      (e: unknown) => e,
    );

    expect(err).not.toBeNull();
    expect(isLlmError(err)).toBe(true);
    if (!isLlmError(err)) throw new Error("unreachable: narrowed above");
    expect(err.kind).toBe("malformed_arguments");
    expect(err.retryable).toBe(false);
    expect(err.details["tool"]).toBe("write_file");
    expect(err.message).toContain("write_file");
  });

  it("Anthropic: non-object tool input yields a typed LlmError rather than undefined fields", async () => {
    stubFetch({
      id: "msg_test",
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "toolu_bad",
          name: "write_file",
          input: "{bad json",
        },
      ],
      stop_reason: "tool_use",
      usage: { input_tokens: 10, output_tokens: 3 },
    });
    const provider = new AnthropicProvider({
      model: "claude-sonnet-4-5",
      apiKey: "k-test",
    });

    const err = await provider.complete(REQUEST).then(
      () => null,
      (e: unknown) => e,
    );

    expect(isLlmError(err)).toBe(true);
    if (!isLlmError(err)) throw new Error("unreachable: narrowed above");
    expect(err.kind).toBe("malformed_arguments");
    expect(err.details["tool"]).toBe("write_file");
  });
});

// ---------------------------------------------------------------------------
// Scenario 5 — non-2xx 429 is retryable, backed off with a bound, then fails typed
// ---------------------------------------------------------------------------

describe("429 handling", () => {
  it("retries a 429 with bounded backoff, succeeds if a later attempt does, and reports attempts", async () => {
    const { requests } = stubFetch(
      {
        status: 429,
        body: {
          type: "error",
          error: { type: "rate_limit_error", message: "overloaded" },
        },
      },
      anthropicTextResponse,
    );
    const { delays, sleep } = makeSleepSpy();
    const provider = new AnthropicProvider({
      model: "claude-sonnet-4-5",
      apiKey: "k-test",
      maxAttempts: 3,
      sleep,
    });

    const result = await provider.complete(REQUEST);

    expect(requests).toHaveLength(2);
    expect(delays).toHaveLength(1);
    expect(result.text).toBe("hello");
  });

  it("gives up after the attempt cap with a typed, retryable LlmError and never exceeds the cap", async () => {
    const { requests } = stubFetch({
      status: 429,
      body: {
        type: "error",
        error: { type: "rate_limit_error", message: "overloaded" },
      },
    });
    const { delays, sleep } = makeSleepSpy();
    const provider = new OpenAIProvider({
      model: "gpt-5-nano",
      apiKey: "k-test",
      maxAttempts: 3,
      backoffMs: (attempt) => 100 * 2 ** attempt,
      maxBackoffMs: 150,
      sleep,
    });

    const err = await provider.complete(REQUEST).then(
      () => null,
      (e: unknown) => e,
    );

    expect(requests).toHaveLength(3);
    // 100, 200 capped to 150, and no sleep after the final failed attempt.
    expect(delays).toEqual([100, 150]);
    expect(isLlmError(err)).toBe(true);
    if (!isLlmError(err)) throw new Error("unreachable: narrowed above");
    expect(err.kind).toBe("rate_limit");
    expect(err.retryable).toBe(true);
    expect(err.status).toBe(429);
  });

  it("a 401 fails fast as a non-retryable typed error with exactly one request", async () => {
    const { requests } = stubFetch({
      status: 401,
      body: {
        type: "error",
        error: { type: "authentication_error", message: "bad key" },
      },
    });
    const { delays, sleep } = makeSleepSpy();
    const provider = new AnthropicProvider({
      model: "claude-sonnet-4-5",
      apiKey: "bad",
      maxAttempts: 4,
      sleep,
    });

    const err = await provider.complete(REQUEST).then(
      () => null,
      (e: unknown) => e,
    );

    expect(requests).toHaveLength(1);
    expect(delays).toEqual([]);
    expect(isLlmError(err)).toBe(true);
    if (!isLlmError(err)) throw new Error("unreachable: narrowed above");
    expect(err.kind).toBe("auth");
    expect(err.retryable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AC clause: normalized usage + terminal stopReason across all three providers
// ---------------------------------------------------------------------------

describe("normalized usage and stopReason", () => {
  it("both HTTP adapters normalize provider usage field names to the same shape", async () => {
    stubFetch((req) =>
      req.url.includes("anthropic")
        ? anthropicTextResponse
        : openaiTextResponse,
    );
    const anthropic = new AnthropicProvider({
      model: "claude-sonnet-4-5",
      apiKey: "k-test",
    });
    const anthropicResult = await anthropic.complete(REQUEST);

    const openai = new OpenAIProvider({
      model: "gpt-5-nano",
      apiKey: "k-test",
    });
    const openaiResult = await openai.complete(REQUEST);

    expect(anthropicResult.usage).toEqual({
      inputTokens: 11,
      outputTokens: 7,
      cacheReadTokens: 3,
      cacheWriteTokens: 2,
    });
    expect(openaiResult.usage).toEqual({
      inputTokens: 21,
      outputTokens: 5,
      cacheReadTokens: 4,
      cacheWriteTokens: 0,
    });
    // Same keys, same order-independent shape: the cost accounting (T12) can sum them blindly.
    expect(Object.keys(anthropicResult.usage).sort()).toEqual(
      Object.keys(openaiResult.usage).sort(),
    );
    expect(anthropicResult.stopReason).toBe("stop");
    expect(openaiResult.stopReason).toBe("stop");
  });

  it("truncation is normalized to max_tokens from each provider's own vocabulary", async () => {
    stubFetch({
      ...anthropicTextResponse,
      stop_reason: "max_tokens",
      usage: { input_tokens: 1, output_tokens: 2 },
    });
    const anthropic = new AnthropicProvider({
      model: "claude-sonnet-4-5",
      apiKey: "k-test",
    });
    expect((await anthropic.complete(REQUEST)).stopReason).toBe("max_tokens");

    stubFetch({
      id: "chatcmpl_test",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "partial" },
          finish_reason: "length",
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 2 },
    });
    const openai = new OpenAIProvider({
      model: "gpt-5-nano",
      apiKey: "k-test",
    });
    const truncated = await openai.complete(REQUEST);
    expect(truncated.stopReason).toBe("max_tokens");
    expect(truncated.text).toBe("partial");
  });
});

// ---------------------------------------------------------------------------
// AC clause: "to **and from** their wire format" — an in-flight tool exchange
// must round-trip back out in each provider's own message vocabulary.
// ---------------------------------------------------------------------------

describe("conversation history serialization", () => {
  const history: CompleteRequest = {
    system: SYSTEM,
    tools: TOOLS,
    messages: [
      { role: "user", text: "Create src/types.ts" },
      {
        role: "assistant",
        text: "Writing it.",
        toolCalls: [
          {
            id: "call_1",
            name: "write_file",
            args: { path: "src/types.ts", content: "export const x = 1;" },
          },
        ],
      },
      {
        role: "tool",
        toolCallId: "call_1",
        content: "wrote 1 file",
        isError: false,
      },
    ],
  };

  it("Anthropic: assistant tool_use blocks plus a user tool_result block", async () => {
    const { requests } = stubFetch(anthropicTextResponse);
    const provider = new AnthropicProvider({
      model: "claude-sonnet-4-5",
      apiKey: "k-test",
    });

    await provider.complete(history);

    expect(requests).toHaveLength(1);
    const messages = requests[0]?.body["messages"] as Array<Json>;
    expect(messages.map((m) => m["role"])).toEqual([
      "user",
      "assistant",
      "user",
    ]);
    const assistantBlocks = messages[1]?.["content"] as Array<Json>;
    expect(assistantBlocks.map((b) => b["type"])).toEqual(["text", "tool_use"]);
    expect(assistantBlocks[1]?.["id"]).toBe("call_1");
    expect(assistantBlocks[1]?.["name"]).toBe("write_file");
    // Anthropic sends tool arguments as an object under `input`.
    expect(assistantBlocks[1]?.["input"]).toEqual({
      path: "src/types.ts",
      content: "export const x = 1;",
    });
    const resultBlocks = messages[2]?.["content"] as Array<Json>;
    expect(resultBlocks[0]?.["type"]).toBe("tool_result");
    expect(resultBlocks[0]?.["tool_use_id"]).toBe("call_1");
    expect(resultBlocks[0]?.["is_error"]).toBe(false);
  });

  it("OpenAI: assistant tool_calls array plus a role:tool result message", async () => {
    const { requests } = stubFetch(openaiTextResponse);
    const provider = new OpenAIProvider({
      model: "gpt-5-nano",
      apiKey: "k-test",
    });

    await provider.complete(history);

    expect(requests).toHaveLength(1);
    const messages = requests[0]?.body["messages"] as Array<Json>;
    expect(messages.map((m) => m["role"])).toEqual([
      "system",
      "user",
      "assistant",
      "tool",
    ]);
    const assistant = messages[2];
    const toolCalls = assistant?.["tool_calls"] as Array<Json>;
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]?.["id"]).toBe("call_1");
    const fn = toolCalls[0]?.["function"] as Json;
    expect(fn["name"]).toBe("write_file");
    // OpenAI sends tool arguments as a JSON **string** under `arguments`.
    expect(typeof fn["arguments"]).toBe("string");
    expect(JSON.parse(String(fn["arguments"]))).toEqual({
      path: "src/types.ts",
      content: "export const x = 1;",
    });
    const toolMsg = messages[3];
    expect(toolMsg?.["tool_call_id"]).toBe("call_1");
    expect(toolMsg?.["content"]).toBe("wrote 1 file");
  });
});

// ---------------------------------------------------------------------------
// AC clause: FakeProvider satisfies the same interface
// ---------------------------------------------------------------------------

describe("FakeProvider interface parity", () => {
  it("all three providers are assignable to the same LlmProvider binding", async () => {
    // One stub, dispatching on URL: installing a second stub would replace the first.
    stubFetch((req) =>
      req.url.includes("anthropic")
        ? anthropicTextResponse
        : openaiTextResponse,
    );
    // Three bindings of one type: a signature mismatch in any class fails agent:typecheck here.
    const providers: LlmProvider[] = [
      new AnthropicProvider({ model: "claude-sonnet-4-5", apiKey: "k-test" }),
      new OpenAIProvider({ model: "gpt-5-nano", apiKey: "k-test" }),
      new FakeProvider({
        responses: [
          {
            text: "fake reply",
            stopReason: "stop",
            usage: { inputTokens: 1, outputTokens: 2 },
          },
        ],
      }),
    ];

    const results: Completion[] = [];
    for (const provider of providers) {
      expect(typeof provider.complete).toBe("function");
      expect(typeof provider.name).toBe("string");
      expect(typeof provider.model).toBe("string");
      results.push(await provider.complete(REQUEST));
    }

    // Every implementation returns the same normalized core shape (text is optional).
    for (const result of results) {
      expect(Array.isArray(result.toolCalls)).toBe(true);
      expect(typeof result.stopReason).toBe("string");
      expect(Object.keys(result.usage).sort()).toEqual([
        "cacheReadTokens",
        "cacheWriteTokens",
        "inputTokens",
        "outputTokens",
      ]);
    }
    expect(results[2]?.text).toBe("fake reply");
    expect(results[0]?.text).toBe("hello");
    expect(results[1]?.text).toBe("hello");
  });

  it("FakeProvider needs no fetch at all and can drive tool calls offline", async () => {
    const { requests } = stubFetch();
    const fake = new FakeProvider({
      responses: [
        {
          toolCalls: [
            {
              name: "write_file",
              args: { path: "src/types.ts", content: "export const x = 1;" },
            },
          ],
          stopReason: "tool_use",
        },
      ],
    });

    const result = await fake.complete(REQUEST);

    expect(requests).toHaveLength(0);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]?.name).toBe("write_file");
    expect(result.toolCalls[0]?.args).toEqual({
      path: "src/types.ts",
      content: "export const x = 1;",
    });
    expect(result.stopReason).toBe("tool_use");
    // Usage is always present so cost accounting never reads undefined.
    expect(result.usage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
  });

  it("FakeProvider records the requests it was given, for downstream loop tests", async () => {
    const fake = new FakeProvider({
      responses: [
        { text: "ok", stopReason: "stop" },
        { text: "again", stopReason: "stop" },
      ],
    });

    await fake.complete(REQUEST);
    await fake.complete({
      ...REQUEST,
      messages: [{ role: "user", text: "next" }],
    });

    expect(fake.requests).toHaveLength(2);
    expect(fake.requests[0]?.system).toBe(SYSTEM);
    expect(fake.requests[1]?.messages).toEqual([
      { role: "user", text: "next" },
    ]);
  });

  it("FakeProvider can script a typed error so the repair loop is testable offline", async () => {
    const fake = new FakeProvider({
      responses: [{ error: new LlmError("rate_limit", "scripted rate limit") }],
    });

    const err = await fake.complete(REQUEST).then(
      () => null,
      (e: unknown) => e,
    );

    expect(isLlmError(err)).toBe(true);
    if (!isLlmError(err)) throw new Error("unreachable: narrowed above");
    expect(err.kind).toBe("rate_limit");
    expect(err.retryable).toBe(true);
  });

  it("FakeProvider fails loudly when the loop asks for more responses than were scripted", async () => {
    const fake = new FakeProvider({
      responses: [{ text: "only one", stopReason: "stop" }],
    });

    await fake.complete(REQUEST);
    const err = await fake.complete(REQUEST).then(
      () => null,
      (e: unknown) => e,
    );

    expect(isLlmError(err)).toBe(true);
    if (!isLlmError(err)) throw new Error("unreachable: narrowed above");
    expect(err.kind).toBe("invalid_response");
    expect(err.message).toContain("exhausted");
  });
});
