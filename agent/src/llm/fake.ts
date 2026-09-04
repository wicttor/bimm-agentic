// Offline fake provider (task 2026-09-04-001-T03).
//
// Implements the exact same `LlmProvider` interface as the HTTP adapters, driven by scripted
// replies instead of a socket. This is what lets the rest of the pipeline (planner, generator,
// repair loop, replay) be developed and tested with no API key and zero network calls; `--dry-run`
// uses the same path.

import {
  EMPTY_USAGE,
  LlmError,
  type Completion,
  type CompleteRequest,
  type LlmProvider,
  type StopReason,
  type ToolCall,
  type Usage,
} from "./provider.ts";

/** A scripted tool call. `id` is optional because authors rarely care which call id the fake mints. */
export interface FakeToolCall {
  name: string;
  args?: Record<string, unknown>;
  id?: string;
}

/** A scripted reply, or a scripted failure. Only `error` needs to be exhaustive. */
export interface FakeReply {
  text?: string;
  toolCalls?: FakeToolCall[];
  /** Defaults to `tool_use` when the reply carries tool calls, otherwise `stop`. */
  stopReason?: StopReason;
  /** Partial: unspecified counters default to 0, so accounting never reads `undefined`. */
  usage?: Partial<Usage>;
  /** When present, this scripted turn throws instead of returning. */
  error?: LlmError;
}

export interface FakeProviderOptions {
  /** Consumed in order. Once exhausted, further calls fail loudly rather than repeating. */
  responses: FakeReply[];
  model?: string;
}

function replyToCompletion(reply: FakeReply): Completion {
  const toolCalls: ToolCall[] = (reply.toolCalls ?? []).map((call, index) => ({
    id: call.id ?? `fake_call_${index}`,
    name: call.name,
    args: call.args ?? {},
  }));
  return {
    ...(reply.text !== undefined ? { text: reply.text } : {}),
    toolCalls,
    usage: { ...EMPTY_USAGE, ...reply.usage },
    stopReason: reply.stopReason ?? (toolCalls.length > 0 ? "tool_use" : "stop"),
  };
}

export class FakeProvider implements LlmProvider {
  readonly name = "fake" as const;
  readonly model: string;

  /** Every request the loop made, in order — downstream tests assert on prompts and tool defs. */
  readonly requests: CompleteRequest[] = [];

  private readonly responses: FakeReply[];

  constructor(options: FakeProviderOptions) {
    this.responses = [...options.responses];
    this.model = options.model ?? "fake-model";
  }

  async complete(request: CompleteRequest): Promise<Completion> {
    this.requests.push(request);
    const reply = this.responses[this.requests.length - 1];
    if (reply === undefined) {
      throw new LlmError(
        "invalid_response",
        `FakeProvider exhausted its ${this.responses.length} scripted response(s) on call ${this.requests.length}`,
        { details: { provider: "fake", call: this.requests.length } },
      );
    }
    if (reply.error !== undefined) throw reply.error;
    return replyToCompletion(reply);
  }
}
