// Agent loop — bounded per-task tool-calling cycle (task 2026-09-04-001-T10).
//
// Given an initial prompt, an LLM provider, and a tool registry, loop:
// 1. Send messages (prompt + prior tool results) to the provider
// 2. Parse any tool calls from the response
// 3. Execute each via the registry, collecting results
// 4. Feed results back into messages as tool-result roles
// 5. Repeat until the provider stops or iteration cap is reached
//
// Never throws: tool errors and iteration cap are typed failures, never exceptions.

import type { LlmProvider, Message, Completion } from "./llm/provider.ts";
import { executeTool, toToolMessage, type ToolContext } from "./tools/registry.ts";
import type { ToolDefinition } from "./llm/provider.ts";

/** Result of running one task through the agent loop. */
export interface AgentLoopResult {
  /** Was the task successful? */
  ok: boolean;
  /** Why did the loop terminate? 'stop' = model said done, 'max_iterations' = cap reached, 'error' = tool or LLM error. */
  reason: "stop" | "max_iterations" | "error";
  /** If reason is 'error', the classified error code and message. */
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  /** All messages exchanged: user, assistant, and tool. */
  messages: Message[];
  /** Total iterations (model calls + tool execution rounds). */
  iterations: number;
  /** Log of what happened at each step (for debugging). */
  log: string[];
}

export interface AgentLoopOptions {
  /** Maximum iterations (default 5). */
  maxIterations?: number;
}

/**
 * Run the agent loop: send initial prompt, execute tool calls, feed back results,
 * repeat until stop or cap. Returns a typed result structure — never throws.
 *
 * @param system - System prompt.
 * @param initialMessage - Initial user message (the task prompt).
 * @param provider - LLM provider (could be OpenAI, Anthropic, or FakeProvider).
 * @param tools - Sandboxed tool definitions (read_file, write_file, list_files, run_command).
 * @param toolContext - Sandbox settings (output directory, file size cap, etc).
 * @param options - Loop options (max iterations).
 * @returns Typed result: success, max_iterations failure, or tool/LLM error.
 */
export async function agentLoop(
  system: string,
  initialMessage: string,
  provider: LlmProvider,
  tools: ToolDefinition[],
  toolContext: ToolContext,
  options: AgentLoopOptions = {},
): Promise<AgentLoopResult> {
  const maxIterations = options.maxIterations ?? 5;
  const messages: Message[] = [{ role: "user", text: initialMessage }];
  const log: string[] = [];

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    log.push(`Iteration ${iteration + 1}/${maxIterations}`);

    // Call the provider
    let completion: Completion;
    try {
      completion = await provider.complete({
        system,
        messages,
        tools,
        maxTokens: 8192,
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      log.push(`Provider error: ${message}`);
      return {
        ok: false,
        reason: "error",
        error: {
          code: "provider_error",
          message,
        },
        messages,
        iterations: iteration + 1,
        log,
      };
    }

    // Add assistant's response to messages
    if (completion.text) {
      log.push(`Assistant text: ${completion.text.substring(0, 100)}${completion.text.length > 100 ? "..." : ""}`);
    }
    const assistantMessage: Message = {
      role: "assistant",
      text: completion.text,
      toolCalls: completion.toolCalls.length > 0 ? completion.toolCalls : undefined,
    };
    messages.push(assistantMessage);

    // If no tool calls and stop reason is "stop", we're done
    if (completion.toolCalls.length === 0 && completion.stopReason === "stop") {
      log.push("Model finished (no tool calls, stop reason is 'stop')");
      return {
        ok: true,
        reason: "stop",
        messages,
        iterations: iteration + 1,
        log,
      };
    }

    // Execute tool calls
    if (completion.toolCalls.length > 0) {
      log.push(`Executing ${completion.toolCalls.length} tool call(s)...`);
      for (const toolCall of completion.toolCalls) {
        log.push(`  Tool: ${toolCall.name} (id: ${toolCall.id})`);
        const result = await executeTool(toolCall, toolContext);
        const toolMessage = toToolMessage(result);
        messages.push(toolMessage);
        if (!result.ok) {
          log.push(`    Error: ${result.error.code} — ${result.error.message}`);
        } else {
          log.push(`    Success: ${result.content.substring(0, 50)}${result.content.length > 50 ? "..." : ""}`);
        }
      }
    }

    // If we're at the last iteration, and the model didn't stop, that's a max_iterations failure
    if (iteration === maxIterations - 1 && completion.toolCalls.length > 0) {
      log.push(`Max iterations (${maxIterations}) reached; model still requesting tools`);
      return {
        ok: false,
        reason: "max_iterations",
        messages,
        iterations: maxIterations,
        log,
      };
    }
  }

  // Unreachable: loop always returns within its bound
  return {
    ok: false,
    reason: "error",
    error: {
      code: "internal_error",
      message: "Agent loop exited unexpectedly",
    },
    messages,
    iterations: maxIterations,
    log,
  };
}
