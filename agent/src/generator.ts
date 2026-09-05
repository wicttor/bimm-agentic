// Generator: per-task orchestration (task 2026-09-04-001-T10).
//
// For each task in a plan, assembles context via context builder, runs the agent loop,
// and collects results. Dependency outputs flow into later tasks' contexts automatically.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { agentLoop } from "./agent-loop.ts";
import { buildContext, type DependencyOutput } from "./context.ts";
import type { DerivedRules } from "./prompts/exemplars.ts";
import type { LlmProvider, ToolDefinition } from "./llm/provider.ts";
import type { Task } from "./plan.ts";
import { TOOL_DEFINITIONS, type ToolContext } from "./tools/registry.ts";

/** Result for a single generated task. */
export interface TaskResult {
  /** The task that was executed. */
  task: Task;
  /** Did the task succeed? */
  ok: boolean;
  /** If ok, the generated file content. */
  generatedContent?: string;
  /** If not ok, the failure reason ('max_iterations', 'error', etc). */
  failureReason?: string;
  /** Detailed error if present. */
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  /** Log of the agent loop's steps (for debugging). */
  log: string[];
}

/** Full generator result: all tasks and a summary. */
export interface GeneratorResult {
  /** Results for each task, in plan order. */
  taskResults: TaskResult[];
  /** How many tasks succeeded. */
  successCount: number;
  /** How many tasks failed. */
  failureCount: number;
  /** Which tasks failed (task.file of each). */
  failedTasks: string[];
}

/** Options for the generator. */
export interface GeneratorOptions {
  /** Maximum iterations per task (default 5). */
  maxIterations?: number;
  /** Token budget per task (default 16000). */
  contextBudgetTokens?: number;
}

/**
 * Generate all files in a plan, respecting dependencies.
 *
 * For each task:
 * 1. Assemble context (spec, rules, dependency outputs) via context builder
 * 2. Run agent loop to generate the file
 * 3. Extract and record the generated content
 * 4. Feed it into the next task's context
 *
 * @param spec - The specification text.
 * @param rules - Derived rules from boilerplate.
 * @param provider - LLM provider (could be FakeProvider in tests).
 * @param toolContext - Sandbox settings for file operations.
 * @param plan - The ordered list of tasks from the planner.
 * @param options - Generator options.
 * @returns Generator result with per-task outcomes.
 */
export async function generate(
  spec: string,
  rules: DerivedRules,
  provider: LlmProvider,
  toolContext: ToolContext,
  plan: Task[],
  options: GeneratorOptions = {},
): Promise<GeneratorResult> {
  const maxIterations = options.maxIterations ?? 5;
  const contextBudgetTokens = options.contextBudgetTokens ?? 16000;
  const taskResults: TaskResult[] = [];
  const generatedFiles = new Map<string, string>(); // file -> content

  for (const task of plan) {
    // Assemble dependency outputs
    const dependencyOutputs: DependencyOutput[] = [];
    for (const depFile of task.dependsOn) {
      const content = generatedFiles.get(depFile);
      if (content !== undefined) {
        dependencyOutputs.push({ file: depFile, content });
      }
    }

    // Build context for this task
    let contextText: string;
    let contextLog: string[] = [];
    try {
      const contextResult = buildContext(spec, task, rules, dependencyOutputs, contextBudgetTokens);
      contextText = contextResult.contextText;
      if (contextResult.report.omitted.length > 0) {
        contextLog.push(`Context builder omitted ${contextResult.report.omitted.length} items due to token budget`);
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      taskResults.push({
        task,
        ok: false,
        failureReason: "context_error",
        error: {
          code: "context_builder_error",
          message,
        },
        log: contextLog.concat([`Failed to build context: ${message}`]),
      });
      continue;
    }

    // Build the task prompt
    const taskPrompt = `
Task: ${task.purpose}
File: ${task.file}

Context:
${contextText}

Generate the file ${task.file} with all necessary implementation.
Use write_file to write the complete file content.
Do not stop until you have successfully written the file using the write_file tool.
`.trim();

    // Run the agent loop
    contextLog.push(`Running agent loop for ${task.file}...`);
    const loopResult = await agentLoop(
      "You are a code generation assistant. Generate files according to the specification and context.",
      taskPrompt,
      provider,
      TOOL_DEFINITIONS as ToolDefinition[],
      toolContext,
      { maxIterations },
    );

    // Extract generated content from messages
    let generatedContent: string | undefined;
    if (loopResult.ok) {
      // Task succeeded - try to read the file from disk
      try {
        const filePath = join(toolContext.outDir, task.file);
        generatedContent = readFileSync(filePath, "utf8");
      } catch {
        // If file doesn't exist, that's ok - we tried
        generatedContent = undefined;
      }
    }

    // Record the result
    const taskResult: TaskResult = {
      task,
      ok: loopResult.ok,
      generatedContent,
      log: contextLog.concat(loopResult.log),
    };

    if (!loopResult.ok) {
      taskResult.failureReason = loopResult.reason;
      taskResult.error = loopResult.error;
    }

    taskResults.push(taskResult);

    // If this task succeeded and wrote a file, record it for later tasks
    if (loopResult.ok && generatedContent) {
      generatedFiles.set(task.file, generatedContent);
    }
  }

  // Summarize
  const successCount = taskResults.filter((r) => r.ok).length;
  const failureCount = taskResults.filter((r) => !r.ok).length;
  const failedTasks = taskResults.filter((r) => !r.ok).map((r) => r.task.file);

  return {
    taskResults,
    successCount,
    failureCount,
    failedTasks,
  };
}
