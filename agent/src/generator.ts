// Generator: per-task orchestration (task 2026-09-04-001-T10).
//
// For each task in a plan, assembles context via context builder, runs the agent loop,
// and collects results. Dependency outputs flow into later tasks' contexts automatically.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { agentLoop } from "./agent-loop.ts";
import { buildContext, type DependencyOutput } from "./context.ts";
import type { DerivedRules } from "./prompts/exemplars.ts";
import { buildGeneratorPrompt } from "./prompts/generator.ts";
import type { LlmProvider, Message, ToolDefinition } from "./llm/provider.ts";
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
  /** Contents of every file this task wrote (its own file plus its test), for trace/debug. */
  writtenFiles?: string[];
  /** Repository-relative path of the task artifact this run executed, when one was written. */
  taskArtifact?: string;
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
  /**
   * Skills directory carrying the `work` skill, executed per task (default `.agents/skills`).
   * An empty string disables injection.
   */
  skillsDir?: string;
  /**
   * Task artifacts from the plan skill's Tasks phase, keyed by the production file each task owns.
   * When present the executor's ask is prefixed with that task artifact's id, so the plan, the
   * artifact and the executed call are traceable to each other. Optional: library callers and tests
   * may drive the loop with a bare task list.
   */
  taskArtifacts?: Map<string, { taskId: string; path: string }>;
}

/** Paths the model wrote through `write_file`, in call order (test first, then implementation). */
function writtenPathsFrom(messages: Message[]): string[] {
  const paths: string[] = [];
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const call of message.toolCalls ?? []) {
      if (call.name !== "write_file") continue;
      const path = (call.args as Record<string, unknown> | undefined)?.path;
      if (typeof path === "string") paths.push(path);
    }
  }
  return paths;
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
    let contextLog: string[] = [];
    let contextReport: { omitted: { name: string }[] } | undefined;
    try {
      const contextResult = buildContext(spec, task, rules, dependencyOutputs, contextBudgetTokens);
      contextReport = contextResult.report;
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

    // Assemble the ask with the prompt library (T07), which carries the work skill. The context
    // builder above decides which dependency outputs fit the token budget; the ones it elided are
    // left out of the prompt too, so the budget is enforced rather than just measured.
    const omittedDeps = new Set(
      (contextReport?.omitted ?? [])
        .filter((o) => o.name.startsWith("Dependency: "))
        .map((o) => o.name.slice("Dependency: ".length)),
    );
    const fittedDeps = dependencyOutputs
      .filter((d) => !omittedDeps.has(d.file))
      // The context builder's shape is `{ file, content }`; the prompt library's is
      // `{ file, contents }`. One mapping, and the two modules keep their own names.
      .map((d) => ({ file: d.file, contents: d.content }));

    const artifact = options.taskArtifacts?.get(task.file);
    const prompt = buildGeneratorPrompt({ task, spec, rules, dependencyOutputs: fittedDeps, skillsDir: options.skillsDir });
    const taskArtifactNote = artifact ? `Task artifact: ${artifact.taskId} (${artifact.path})\n\n` : "";
    const initialMessage = `${taskArtifactNote}${prompt.messages[0]?.role === "user" ? prompt.messages[0].text : ""}`;

    // Run the agent loop
    contextLog.push(`Running agent loop for ${task.file}...`);
    const loopResult = await agentLoop(
      prompt.system,
      initialMessage,
      provider,
      TOOL_DEFINITIONS as ToolDefinition[],
      toolContext,
      { maxIterations },
    );

    // Which files this task actually wrote, in the order the model wrote them (test first, then
    // implementation, when the task owns both).
    const writtenFiles = writtenPathsFrom(loopResult.messages);

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
      writtenFiles,
      taskArtifact: artifact?.path,
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
