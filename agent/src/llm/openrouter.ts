// OpenRouter adapter (task 2026-09-04-001-T03).
//
// OpenRouter is an API-compatible wrapper around multiple model providers.
// It uses the same Chat Completions API as OpenAI with a different endpoint and requires
// an HTTP-Referer header. This adapter is a thin wrapper around the OpenAI format with
// OpenRouter-specific headers.

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

/** OpenRouter Chat Completions API (OpenAI-compatible). */
const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Fallback completion cap when the caller does not specify one. */
const OPENROUTER_DEFAULT_max_tokens = 8_000;

// ---------------------------------------------------------------------------
// Internal -> wire
// ---------------------------------------------------------------------------

function toOpenRouterTools(tools: ToolDefinition[] | undefined): WireJson[] {
  if (tools === undefined || tools.length === 0) return [];
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

function toOpenRouterMessage(message: Message): WireJson {
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
                function: {
                  name: call.name,
                  arguments: JSON.stringify(call.args),
                },
              })),
            }
          : {}),
      };
    case "tool":
      return {
        role: "tool",
        tool_call_id: message.toolCallId,
        content: message.content,
      };
  }
}

/** OpenRouter has no top-level system field, so the system prompt becomes the first message. */
function toOpenRouterMessages(
  system: string | undefined,
  messages: Message[],
): WireJson[] {
  const out: WireJson[] = [];
  if (system !== undefined) out.push({ role: "system", content: system });
  for (const message of messages) out.push(toOpenRouterMessage(message));
  return out;
}

function toOpenRouterRequestBody(
  request: CompleteRequest,
  model: string,
): WireJson {
  const body: WireJson = {
    model,
    messages: toOpenRouterMessages(request.system, request.messages),
  };

  const maxTokensValue = request.maxTokens ?? OPENROUTER_DEFAULT_max_tokens;
  body["max_tokens"] = maxTokensValue;

  const tools = toOpenRouterTools(request.tools);
  if (tools.length > 0) {
    body["tools"] = tools;
    body["tool_choice"] = "auto";
  }
  if (request.temperature !== undefined)
    body["temperature"] = request.temperature;
  return body;
}

// ---------------------------------------------------------------------------
// Wire -> internal
// ---------------------------------------------------------------------------

function fromOpenRouterFinishReason(
  reason: unknown,
  hasToolCalls: boolean,
): StopReason {
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

function fromOpenRouterUsage(payload: WireJson): Usage {
  const usage = payload["usage"];
  if (!isJsonObject(usage)) return { ...EMPTY_USAGE };
  return {
    inputTokens: asJsonNumber(usage["prompt_tokens"]),
    outputTokens: asJsonNumber(usage["completion_tokens"]),
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
}

function fromOpenRouterToolCall(call: WireJson, index: number): ToolCall {
  const fn = call["function"];
  const name = isJsonObject(fn) ? asJsonString(fn["name"]) : "";
  if (name.length === 0) {
    throw new LlmError(
      "invalid_response",
      "openrouter: tool_call has no function name",
      {
        details: { provider: "openrouter", call: index },
      },
    );
  }
  return {
    id: asJsonString(call["id"], `call_${index}`),
    name,
    args: parseToolArguments(
      isJsonObject(fn) ? fn["arguments"] : undefined,
      name,
      "openrouter",
    ),
  };
}

function fromOpenRouterResponse(payload: WireJson): Completion {
  const choices = asJsonObjectArray(payload["choices"]);
  const choice = choices[0];
  if (choice === undefined) {
    throw new LlmError(
      "invalid_response",
      "openrouter: response contained no choices",
      {
        details: { provider: "openrouter", response: payload },
      },
    );
  }
  const message = isJsonObject(choice["message"]) ? choice["message"] : {};
  const toolCalls = asJsonObjectArray(message["tool_calls"]).map(
    fromOpenRouterToolCall,
  );
  const text = asJsonString(message["content"]);
  return {
    ...(text.length > 0 ? { text } : {}),
    toolCalls,
    usage: fromOpenRouterUsage(payload),
    stopReason: fromOpenRouterFinishReason(
      choice["finish_reason"],
      toolCalls.length > 0,
    ),
  };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class OpenRouterProvider implements LlmProvider {
  readonly name = "openrouter" as const;
  readonly model: string;

  private readonly options: ProviderOptions;

  constructor(options: ProviderOptions) {
    this.options = options;
    this.model = options.model;
  }

  async complete(request: CompleteRequest): Promise<Completion> {
    const payload = await postJson(
      {
        url: OPENROUTER_CHAT_URL,
        provider: "openrouter",
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          "http-referer": "https://github.com/earendil-works/bimm-agentic",
          "x-title": "bimm-agentic",
          ...this.options.headers,
        },
        body: toOpenRouterRequestBody(request, this.model),
      },
      this.options,
      request.signal,
    );
    return fromOpenRouterResponse(payload);
  }
}
