// Planner: spec to dependency-ordered task plan (task 2026-09-04-001-T08).
//
// Decomposes a spec into an ordered, file-level generation tasks using a forced `write_plan`
// tool call to ensure structured output. Validates against the JSON schema, detects cycles,
// and returns tasks in topological order.

import type { DerivedRules } from "./prompts/exemplars.ts";
import { buildPlannerPrompt } from "./prompts/planner.ts";
import type { LlmProvider, Message } from "./llm/provider.ts";
import { validateTaskArray } from "./plan-schema.ts";

/** A task in the plan. */
export interface Task {
  file: string;
  purpose: string;
  dependsOn: string[];
  exports: string[];
}

/** Error from the planner. */
export interface PlanError {
  code: "cycle_detected" | "validation_failed" | "llm_error";
  message: string;
}

/** Result of planning. */
export type PlanResult =
  | { ok: true; tasks: Task[] }
  | { ok: false; error: PlanError };

/** Input to the planner. */
export interface PlanInput {
  spec: string;
  rules: DerivedRules;
  provider: LlmProvider;
}

/** Tool definition for write_plan. */
export const WRITE_PLAN_TOOL = {
  name: "write_plan",
  description: "Write the dependency-ordered task plan as a JSON array",
  parameters: {
    type: "object",
    properties: {
      // The tool's argument IS the array itself, so we accept an array as the parameter.
      // This is a bit unconventional but matches how we force tool calls with full arrays as args.
    },
    additionalProperties: true,
  },
};

/** Detect if tasks have cyclic dependencies using DFS. */
function detectCycle(tasks: any[]): string[] | null {
  // Build adjacency list for quick lookup
  const fileToTask = new Map<string, any>();
  for (const task of tasks) {
    fileToTask.set(task.file, task);
  }

  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];

  function dfs(file: string): string[] | null {
    if (recursionStack.has(file)) {
      // Found a cycle; build the cycle path
      const cycleStart = path.indexOf(file);
      return path.slice(cycleStart).concat(file);
    }
    if (visited.has(file)) {
      return null; // Already explored from this node, no cycle here
    }

    visited.add(file);
    recursionStack.add(file);
    path.push(file);

    const task = fileToTask.get(file);
    if (task && task.dependsOn) {
      for (const dep of task.dependsOn) {
        const result = dfs(dep);
        if (result !== null) {
          return result;
        }
      }
    }

    path.pop();
    recursionStack.delete(file);
    return null;
  }

  for (const file of fileToTask.keys()) {
    if (!visited.has(file)) {
      const cycle = dfs(file);
      if (cycle !== null) {
        return cycle;
      }
    }
  }

  return null;
}

/** Topological sort of tasks using Kahn's algorithm. */
function topologicalSort(tasks: any[]): any[] {
  // Build a file-to-task map
  const fileToTask = new Map<string, any>();
  for (const task of tasks) {
    fileToTask.set(task.file, task);
  }

  // Calculate in-degrees
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const task of tasks) {
    if (!inDegree.has(task.file)) {
      inDegree.set(task.file, 0);
    }
    if (!adjacency.has(task.file)) {
      adjacency.set(task.file, []);
    }

    // Add dependencies
    for (const dep of task.dependsOn || []) {
      if (!adjacency.has(dep)) {
        adjacency.set(dep, []);
      }
      if (!inDegree.has(dep)) {
        inDegree.set(dep, 0);
      }
      adjacency.get(dep)!.push(task.file);
      inDegree.set(task.file, (inDegree.get(task.file) || 0) + 1);
    }
  }

  // Kahn's algorithm
  const queue: string[] = [];
  for (const [file, degree] of inDegree.entries()) {
    if (degree === 0) {
      queue.push(file);
    }
  }

  // Sort queue for deterministic ordering when multiple tasks have same in-degree
  queue.sort();

  const sorted: any[] = [];
  while (queue.length > 0) {
    const file = queue.shift()!;
    const task = fileToTask.get(file);
    if (task) {
      sorted.push(task);
    }

    const neighbors = adjacency.get(file) || [];
    // Sort neighbors for deterministic ordering
    const sortedNeighbors = [...neighbors].sort();
    for (const neighbor of sortedNeighbors) {
      inDegree.set(neighbor, (inDegree.get(neighbor) || 1) - 1);
      if (inDegree.get(neighbor) === 0) {
        queue.push(neighbor);
        queue.sort(); // Keep sorted for determinism
      }
    }
  }

  return sorted;
}

/** Normalize a task, filling in optional fields. */
function normalizeTask(task: any): Task {
  return {
    file: task.file,
    purpose: task.purpose,
    dependsOn: task.dependsOn || [],
    exports: task.exports || [],
  };
}

/** Plan the spec into a dependency-ordered task list. */
export async function plan(input: PlanInput): Promise<PlanResult> {
  const { spec, rules, provider } = input;
  const prompt = buildPlannerPrompt({ spec, rules });

  const messages: Message[] = prompt.messages;
  const system = prompt.system;

  // First request: ask for the plan
  let response = await provider.complete({
    system,
    messages,
    tools: [WRITE_PLAN_TOOL],
    maxTokens: 8192,
  });

  // Extract the write_plan tool call
  let writeplanCall = response.toolCalls.find((call) => call.name === "write_plan");
  let planData = writeplanCall?.args;

  // Re-ask loop: if validation fails, send back the error and re-ask once
  let attempts = 0;
  const maxAttempts = 2;

  let validation: ReturnType<typeof validateTaskArray> | undefined;

  while (attempts < maxAttempts) {
    attempts += 1;

    if (!planData) {
      // No tool call found; try again
      if (response.text) {
        // Send the error back and ask again
        const errorMessage: Message = {
          role: "assistant",
          text: response.text,
          toolCalls: response.toolCalls,
        };
        messages.push(errorMessage);
        messages.push({
          role: "tool",
          toolCallId: "validation_error",
          content: "Expected a write_plan tool call with a JSON array, but got prose text instead. Reply with ONLY a write_plan tool call containing the JSON array.",
          isError: true,
        });

        response = await provider.complete({
          system,
          messages,
          tools: [WRITE_PLAN_TOOL],
          maxTokens: 8192,
        });

        writeplanCall = response.toolCalls.find((call) => call.name === "write_plan");
        planData = writeplanCall?.args;
        continue;
      }

      return {
        ok: false,
        error: {
          code: "validation_failed",
          message: "No write_plan tool call in response",
        },
      };
    }

    // Validate the plan data
    validation = validateTaskArray(planData);
    if (!validation.ok) {
      if (attempts < maxAttempts) {
        // Re-ask with the validation error
        const errorMessage: Message = {
          role: "assistant",
          toolCalls: [{ id: "write_plan_call", name: "write_plan", args: planData }],
        };
        messages.push(errorMessage);
        messages.push({
          role: "tool",
          toolCallId: "write_plan_call",
          content: `Validation failed: ${validation.errors.join("; ")}. Reply again with a corrected write_plan call.`,
          isError: true,
        });

        response = await provider.complete({
          system,
          messages,
          tools: [WRITE_PLAN_TOOL],
          maxTokens: 8192,
        });

        writeplanCall = response.toolCalls.find((call) => call.name === "write_plan");
        planData = writeplanCall?.args;
        continue;
      }

      return {
        ok: false,
        error: {
          code: "validation_failed",
          message: `Schema validation failed: ${validation.errors.join("; ")}`,
        },
      };
    }

    // Validation succeeded
    break;
  }

  if (!validation || !validation.ok || !planData || !Array.isArray(planData)) {
    return {
      ok: false,
      error: {
        code: "validation_failed",
        message: "Failed to validate plan data",
      },
    };
  }

  // Normalize tasks
  let tasks = validation.tasks.map(normalizeTask);

  // Detect cycles
  const cycle = detectCycle(tasks);
  if (cycle !== null) {
    return {
      ok: false,
      error: {
        code: "cycle_detected",
        message: `Cyclic dependency detected: ${cycle.join(" -> ")}`,
      },
    };
  }

  // Topological sort
  tasks = topologicalSort(tasks);

  return { ok: true, tasks };
}
