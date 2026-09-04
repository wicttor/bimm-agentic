// OpenAI Chat Completions adapter (task 2026-09-04-001-T03).
//
// Translates the same internal vocabulary to and from OpenAI's wire format using global `fetch` —
// no SDK dependency. Everything provider-specific is confined to this file: the system prompt is a
// leading `role: "system"` message, tool schemas nest under `tools[].function.parameters`, tool
// calls arrive on `choices[].message.tool_calls` with **stringified** arguments, and token counts
// arrive as `prompt_tokens` / `completion_tokens`.

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

/** OpenAI Chat Completions API. */
export const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

/** Fallback completion cap when the caller does not specify one. */
export const OPENAI_DEFAULT_MAX_TOKENS = 8_000;

// ---------------------------------------------------------------------------
// Internal -> wire
// ---------------------------------------------------------------------------

function toOpenAITools(tools: ToolDefinition[] | undefined): WireJson[] {
  if (tools === undefined || tools.length === 0) return [];
  return tools.map((tool) => ({
    type: "function",
    // OpenAI's field name for the JSON Schema is `parameters`, nested under `function`.
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

function toOpenAIMessage(message: Message): WireJson {
  switch (message.role) {
    case "user":
      return { role: "user", content: message.text };
    case "assistant":
      return {
        role: "assistant",
        content: message.text ?? null,
        ...(message.toolCalls && message.toolCalls.length > 0
          ? {
              tool_calls: message.toolCalls.map((call) => ({
                id: call.id,
                type: "function",
                function: { name: call.name, arguments: JSON.stringify(call.args) },
              })),
            }
          : {}),
      };
    case "tool":
      return { role: "tool", tool_call_id: message.toolCallId, content: message.content };
  }
}

/** OpenAI has no top-level system field, so the system prompt becomes the first message. */
function toOpenAIMessages(system: string | undefined, messages: Message[]): WireJson[] {
  const out: WireJson[] = [];
  if (system !== undefined) out.push({ role: "system", content: system });
  for (const message of messages) out.push(toOpenAIMessage(message));
  return out;
}

function toOpenAIRequestBody(request: CompleteRequest, model: string): WireJson {
  const body: WireJson = {
    model,
    max_tokens: request.maxTokens ?? OPENAI_DEFAULT_MAX_TOKENS,
    messages: toOpenAIMessages(request.system, request.messages),
  };
  const tools = toOpenAITools(request.tools);
  if (tools.length > 0) {
    body["tools"] = tools;
    // Let the model choose; the loop's own forcing strategy is T10's concern.
    body["tool_choice"] = "auto";
  }
  if (request.temperature !== undefined) body["temperature"] = request.temperature;
  return body;
}

// ---------------------------------------------------------------------------
// Wire -> internal
// ---------------------------------------------------------------------------

function fromOpenAIFinishReason(reason: unknown, hasToolCalls: boolean): StopReason {
  switch (asJsonString(reason)) {
    case "length":
      return "max_tokens";
    case "tool_calls":
      return "tool_use";
    case "stop":
    case "content_filter":
      return "stop";
    default:
      return hasToolCalls ? "tool_use" : "stop";
  }
}

function fromOpenAIUsage(payload: WireJson): Usage {
  const usage = payload["usage"];
  if (!isJsonObject(usage)) return { ...EMPTY_USAGE };
  const details = usage["prompt_tokens_details"];
  return {
    inputTokens: asJsonNumber(usage["prompt_tokens"]),
    outputTokens: asJsonNumber(usage["completion_tokens"]),
    // OpenAI reports cached input tokens only on the prompt side; nothing is cache-written.
    cacheReadTokens: isJsonObject(details) ? asJsonNumber(details["cached_tokens"]) : 0,
    cacheWriteTokens: 0,
  };
}

function fromOpenAIToolCall(call: WireJson, index: number): ToolCall {
  const fn = call["function"];
  const name = isJsonObject(fn) ? asJsonString(fn["name"]) : "";
  if (name.length === 0) {
    throw new LlmError("invalid_response", "openai: tool_call has no function name", {
      details: { provider: "openai", call: index },
    });
  }
  return {
    id: asJsonString(call["id"], `call_${index}`),
    name,
    // The wire payload is a JSON string; malformed content becomes a typed adapter error here
    // rather than an `undefined` read downstream.
    args: parseToolArguments(isJsonObject(fn) ? fn["arguments"] : undefined, name, "openai"),
  };
}

function fromOpenAIResponse(payload: WireJson): Completion {
  const choices = asJsonObjectArray(payload["choices"]);
  const choice = choices[0];
  if (choice === undefined) {
    throw new LlmError("invalid_response", "openai: response contained no choices", {
      details: { provider: "openai", response: payload },
    });
  }
  const message = isJsonObject(choice["message"]) ? choice["message"] : {};
  const toolCalls = asJsonObjectArray(message["tool_calls"]).map(fromOpenAIToolCall);
  const text = asJsonString(message["content"]);
  return {
    ...(text.length > 0 ? { text } : {}),
    toolCalls,
    usage: fromOpenAIUsage(payload),
    stopReason: fromOpenAIFinishReason(choice["finish_reason"], toolCalls.length > 0),
  };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class OpenAIProvider implements LlmProvider {
  readonly name = "openai" as const;
  readonly model: string;

  private readonly options: ProviderOptions;

  constructor(options: ProviderOptions) {
    this.options = options;
    this.model = options.model;
  }

  async complete(request: CompleteRequest): Promise<Completion> {
    const payload = await postJson(
      {
        url: OPENAI_CHAT_URL,
        provider: "openai",
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          ...this.options.headers,
        },
        body: toOpenAIRequestBody(request, this.model),
      },
      this.options,
      request.signal,
    );
    return fromOpenAIResponse(payload);
  }
}
