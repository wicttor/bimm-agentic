// Context builder with token budget (task 2026-09-04-001-T09).
//
// Assembles contract files plus only the current task's dependency outputs into context for the
// generator, respecting a token budget by eliding lowest-priority content while never dropping
// the spec or hard rules.
//
// Design priorities (lowest-priority items elided first):
//   1. Exemplars (few-shot examples) — lowest priority, largest size, non-essential
//   2. Rules (hard rules block) — medium priority, but never omitted
//   3. Spec (specification text) — highest priority, must never be omitted
//   4. Dependency outputs — medium priority, omit least-important dependencies first
//
// Token counting uses a simple heuristic: characters ÷ 4 (typical English/TS word average).

import type { DerivedRules } from "./prompts/exemplars.ts";
import { renderRules, renderExemplars } from "./prompts/exemplars.ts";
import type { Task } from "./plan.ts";

/** Token count estimate: characters divided by 4 (English/TS average word length). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** An item that can be elided when over budget. */
interface ContextItem {
  /** Human-readable name for the report. */
  name: string;
  /** Whether this item can ever be omitted (spec and rules cannot). */
  omissible: boolean;
  /** Priority: lower values are kept, higher values are elided first. */
  priority: number;
  /** The text content of this item. */
  content: string;
  /** Tokens this item contributes. */
  tokens: number;
}

/**
 * A dependency output, with its name and content.
 */
export interface DependencyOutput {
  /** The file path that was generated. */
  file: string;
  /** The content of the generated file. */
  content: string;
}

/**
 * The context builder result.
 */
export interface ContextBuilderResult {
  /** The assembled context text, ready for the generator. */
  contextText: string;
  /** Machine-readable report of what was omitted and why. */
  report: ContextBuilderReport;
}

/**
 * Report of omitted items when the context exceeded token budget.
 */
export interface ContextBuilderReport {
  /** Total tokens available (the budget). */
  budgetTokens: number;
  /** Tokens included in the assembled context. */
  includedTokens: number;
  /** List of items that were omitted. */
  omitted: OmittedItem[];
}

/**
 * One item that was omitted from the context.
 */
export interface OmittedItem {
  /** The name of the item (for reporting). */
  name: string;
  /** Tokens that would have been used. */
  tokens: number;
  /** Why this item was omitted. */
  reason: string;
}

/**
 * Build context for a generator, assembling spec, rules, dependency outputs, and exemplars
 * into a single text block that respects the token budget.
 *
 * @param spec - The specification text.
 * @param task - The current task being generated.
 * @param rules - Derived rules from the boilerplate.
 * @param dependencyOutputs - Outputs from tasks this one depends on.
 * @param budgetTokens - Maximum tokens allowed.
 * @returns Assembled context and a report of any omissions.
 */
export function buildContext(
  spec: string,
  task: Task,
  rules: DerivedRules,
  dependencyOutputs: DependencyOutput[],
  budgetTokens: number,
): ContextBuilderResult {
  // Validate budget
  if (budgetTokens <= 0) {
    throw new Error(`Token budget must be positive, got ${budgetTokens}`);
  }

  // Assemble all items, ranked by priority
  const items: ContextItem[] = [];

  // 1. Spec (highest priority, never omit)
  items.push({
    name: "Specification",
    omissible: false,
    priority: 0, // Lowest priority value = always kept
    content: spec,
    tokens: 0, // Will be calculated
  });

  // 2. Hard rules (medium-high priority, never omit)
  const rulesText = renderRules(rules);
  items.push({
    name: "Hard rules",
    omissible: false,
    priority: 1,
    content: rulesText,
    tokens: 0, // Will be calculated
  });

  // 3. Dependency outputs (medium priority, elide least-important first)
  // Sort by file path for deterministic ordering
  const sortedDeps = [...dependencyOutputs].sort((a, b) => a.file.localeCompare(b.file));
  for (const dep of sortedDeps) {
    items.push({
      name: `Dependency: ${dep.file}`,
      omissible: true,
      priority: 10 + sortedDeps.indexOf(dep), // Dependencies elided before exemplars
      content: dep.content,
      tokens: 0, // Will be calculated
    });
  }

  // 4. Exemplars (lowest priority, elide first)
  const exemplarsText = renderExemplars(rules, task.file);
  if (exemplarsText) {
    items.push({
      name: "Reference exemplars",
      omissible: true,
      priority: 1000, // Highest priority value = elided first
      content: exemplarsText,
      tokens: 0, // Will be calculated
    });
  }

  // Calculate tokens for each item (now that we have the final content)
  for (const item of items) {
    item.tokens = estimateTokens(item.content);
  }

  // Greedily assemble context, eliding items that don't fit
  const included: ContextItem[] = [];
  let totalTokens = 0;
  const omitted: OmittedItem[] = [];

  // Must include all non-omissible items first
  for (const item of items) {
    if (!item.omissible) {
      included.push(item);
      totalTokens += item.tokens;
    }
  }

  // Check if non-omissible items alone exceed budget (this is an error state)
  if (totalTokens > budgetTokens) {
    throw new Error(
      `Spec and rules exceed token budget: ` +
        `${totalTokens} tokens required but only ${budgetTokens} available`,
    );
  }

  // Now greedily add omissible items, sorted by priority (ascending)
  const omissibleItems = items.filter((item) => item.omissible);
  omissibleItems.sort((a, b) => a.priority - b.priority);

  for (const item of omissibleItems) {
    if (totalTokens + item.tokens <= budgetTokens) {
      included.push(item);
      totalTokens += item.tokens;
    } else {
      omitted.push({
        name: item.name,
        tokens: item.tokens,
        reason: "Exceeds token budget",
      });
    }
  }

  // Assemble final context, maintaining a stable order (spec, rules, deps, exemplars)
  const contextLines: string[] = [];
  for (const item of items) {
    if (included.includes(item)) {
      contextLines.push(item.content);
      contextLines.push(""); // Blank line between sections
    }
  }

  return {
    contextText: contextLines.join("\n").trim(),
    report: {
      budgetTokens,
      includedTokens: totalTokens,
      omitted,
    },
  };
}
