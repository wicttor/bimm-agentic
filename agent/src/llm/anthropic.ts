// Anthropic Messages adapter (task 2026-09-04-001-T03).
//
// Translates the internal message/tool vocabulary to and from the Anthropic wire format using
// global `fetch` — no SDK dependency. Everything provider-specific is confined to this file:
// `system` is a top-level field, tool schemas are `input_schema`, tool calls are `tool_use`
// content blocks, and token counts arrive as `input_tokens` / `output_tokens` (+ cache fields).

import {
  asJsonObjectArray,
  asJsonNumber,
  asJsonString,
  EMPTY_USAGE,
  isJsonObject,
  LlmError,
  parseToolArguments,
  postJson,
  type Completion,
  type CompleteRequest,
  type LlmProvider,
  type Message,
  type ProviderOptions,
  type StopReason,
  type ToolCall,
  type ToolDefinition,
  type WireJson,
  type Usage,
} from "./provider.ts";

/** Anthropic Messages API. The version is sent explicitly on every request. */
const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/** Anthropic rejects requests without `max_tokens`; the loop overrides it per call. */
const ANTHROPIC_DEFAULT_max_tokens = 8_000;

// ---------------------------------------------------------------------------
// Internal -> wire
// ---------------------------------------------------------------------------

function toAnthropicTools(tools: ToolDefinition[] | undefined): WireJson[] {
  if (tools === undefined || tools.length === 0) return [];
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    // Anthropic's field name for the JSON Schema; the internal `parameters` maps straight onto it.
    input_schema: tool.parameters,
  }));
}

function toAnthropicAssistantBlocks(message: {
  text?: string;
  toolCalls?: ToolCall[];
}): WireJson[] {
  const blocks: WireJson[] = [];
  if (message.text !== undefined && message.text.length > 0) {
    blocks.push({ type: "text", text: message.text });
  }
  for (const call of message.toolCalls ?? []) {
    blocks.push({
      type: "tool_use",
      id: call.id,
      name: call.name,
      input: call.args,
    });
  }
  return blocks;
}

/**
 * Anthropic's message list carries only `user` and `assistant` turns: tool results ride back in a
 * `user` message as `tool_result` blocks. The hoisted system prompt never appears here.
 */
function toAnthropicMessages(messages: Message[]): WireJson[] {
  const out: WireJson[] = [];
  for (const message of messages) {
    switch (message.role) {
      case "user":
        out.push({
          role: "user",
          content: [{ type: "text", text: message.text }],
        });
        break;
      case "assistant":
        out.push({
          role: "assistant",
          content: toAnthropicAssistantBlocks(message),
        });
        break;
      case "tool":
        out.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: message.toolCallId,
              content: message.content,
              is_error: message.isError ?? false,
            },
          ],
        });
        break;
    }
  }
  return out;
}

function toAnthropicRequestBody(
  request: CompleteRequest,
  model: string,
): WireJson {
  const body: WireJson = {
    model,
    max_tokens: request.maxTokens ?? ANTHROPIC_DEFAULT_max_tokens,
    messages: toAnthropicMessages(request.messages),
  };
  if (request.system !== undefined) body["system"] = request.system;
  const tools = toAnthropicTools(request.tools);
  if (tools.length > 0) body["tools"] = tools;
  if (request.temperature !== undefined)
    body["temperature"] = request.temperature;
  return body;
}

// ---------------------------------------------------------------------------
// Wire -> internal
// ---------------------------------------------------------------------------

function fromAnthropicStopReason(
  reason: unknown,
  hasToolCalls: boolean,
): StopReason {
  switch (asJsonString(reason)) {
    case "max_tokens":
      return "max_tokens";
    case "tool_use":
      return "tool_use";
    case "end_turn":
    case "stop_sequence":
    case "pause_turn":
    case "refusal":
      return "stop";
    default:
      // A tool call with an unrecognized reason is still a tool call; anything else ended.
      return hasToolCalls ? "tool_use" : "stop";
  }
}

function fromAnthropicUsage(payload: WireJson): Usage {
  const usage = payload["usage"];
  if (!isJsonObject(usage)) return { ...EMPTY_USAGE };
  return {
    inputTokens: asJsonNumber(usage["input_tokens"]),
    outputTokens: asJsonNumber(usage["output_tokens"]),
    cacheReadTokens: asJsonNumber(usage["cache_read_input_tokens"]),
    cacheWriteTokens: asJsonNumber(usage["cache_creation_input_tokens"]),
  };
}

function fromAnthropicToolCall(block: WireJson, index: number): ToolCall {
  const name = asJsonString(block["name"]);
  if (name.length === 0) {
    throw new LlmError(
      "invalid_response",
      "anthropic: tool_use block has no name",
      {
        details: { provider: "anthropic", block: index },
      },
    );
  }
  const rawId = block["id"];
  return {
    id:
      typeof rawId === "string" && rawId.length > 0 ? rawId : `toolu_${index}`,
    name,
    args: parseToolArguments(block["input"], name, "anthropic"),
  };
}

function fromAnthropicResponse(payload: WireJson): Completion {
  const blocks = asJsonObjectArray(payload["content"]);
  const texts: string[] = [];
  const toolCalls: ToolCall[] = [];
  for (const block of blocks) {
    const type = block["type"];
    if (type === "text") {
      const text = asJsonString(block["text"]);
      if (text.length > 0) texts.push(text);
    } else if (type === "tool_use") {
      toolCalls.push(fromAnthropicToolCall(block, toolCalls.length));
    }
  }
  const text = texts.join("\n");
  return {
    ...(text.length > 0 ? { text } : {}),
    toolCalls,
    usage: fromAnthropicUsage(payload),
    stopReason: fromAnthropicStopReason(
      payload["stop_reason"],
      toolCalls.length > 0,
    ),
  };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic" as const;
  readonly model: string;

  private readonly options: ProviderOptions;

  constructor(options: ProviderOptions) {
    this.options = options;
    this.model = options.model;
  }

  async complete(request: CompleteRequest): Promise<Completion> {
    const payload = await postJson(
      {
        url: ANTHROPIC_MESSAGES_URL,
        provider: "anthropic",
        headers: {
          "x-api-key": this.options.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          ...this.options.headers,
        },
        body: toAnthropicRequestBody(request, this.model),
      },
      this.options,
      request.signal,
    );
    return fromAnthropicResponse(payload);
  }
}
