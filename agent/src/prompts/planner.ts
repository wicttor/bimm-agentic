// Planner prompt (task 2026-09-04-001-T07).
//
// The planner turns the natural-language spec into an ordered list of file-level tasks. Two things
// keep this module honest:
//
//   1. The hard rules it hands the model are the same rendered block the generator and repair
//      prompts use, derived from the boilerplate by `exemplars.ts`. A planner that did not know the
//      app already has queries, handlers and a shared type would plan tasks that redefine them,
//      which is the failure mode this prompt exists to prevent.
//   2. The output contract is a JSON schema this module exports, so the planner (T08) validates
//      against the schema it advertises instead of keeping a second copy of the field names.
//
// Deliberately absent: any hint of *what* to plan. No feature list, no file names, no entity names.
// The decomposition is the model's job given the spec; ours is the shape of the answer.

import type { DerivedRules, Prompt } from "./exemplars.ts";
import { renderRules } from "./exemplars.ts";

/**
 * The shape of one planned task.
 *
 * Kept in sync with `GenerationTask` in `generator.ts` by construction: the generator accepts the
 * plan's own entries, so the four keys below are the only contract between the two calls.
 */
const TASK_PLAN_SCHEMA_KEYS = ["file", "purpose", "dependsOn", "exports"] as const;

/** A JSON Schema object, plain data so T08 can validate or re-export it without a dependency. */
export interface JsonSchemaObject {
  type: "object";
  additionalProperties: boolean;
  required: string[];
  properties: Record<string, unknown>;
}

/** The contract for a single task object inside the planner's answer. */
export const TASK_PLAN_JSON_SCHEMA: JsonSchemaObject = {
  type: "object",
  additionalProperties: false,
  required: [...TASK_PLAN_SCHEMA_KEYS],
  properties: {
    file: {
      type: "string",
      description:
        "Project-relative path of the one file this task creates or rewrites, e.g. `src/hooks/useListing.ts`.",
    },
    purpose: {
      type: "string",
      description: "One sentence: the behaviour this file is responsible for.",
    },
    dependsOn: {
      type: "array",
      items: { type: "string" },
      description:
        "Paths of the tasks whose output this file imports. A file can only depend on files earlier in the list.",
    },
    exports: {
      type: "array",
      items: { type: "string" },
      description: "Names this file exports for its dependents to import.",
    },
  },
};

export interface PlannerPromptInput {
  /** The natural-language spec, verbatim. */
  spec: string;
  /** Rules derived once from the reference boilerplate. */
  rules: DerivedRules;
}

/** The role, the contract, and the rules — nothing a model should have to guess. */
function plannerSystem(rules: DerivedRules): string {
  const schema = JSON.stringify(TASK_PLAN_JSON_SCHEMA, null, 2);
  return [
    "You are the planning stage of a code-generation agent. You decompose one specification into an ordered list of file-level tasks, and you do nothing else: you never write code, never name a file you are not going to create, and never explain your reasoning.",
    "",
    "CRITICAL: Answer with ONLY a bare JSON array of task objects. No wrapper object. No prose. No markdown code fence.",
    "WRONG: {\"tasks\": [...]} or {\"plan\": [...]}  |  RIGHT: [{...}, {...}]",
    "",
    "Each array element must satisfy this JSON Schema exactly:",
    "",
    schema,
    "",
    "Planning constraints:",
    `- One task per file. ${TASK_PLAN_SCHEMA_KEYS[0]} is where the work lands, so a task that touches two files is two tasks.`,
    "- Order the array so every task appears after the tasks it lists as dependencies: shared types and data-access hooks first, the components that consume them next, the app shell that wires them together last, and the tests for a file after that file.",
    "- The spec is the only source of requirements. Cover every behaviour it asks for, and invent nothing it does not.",
    "- The tasks must be completable by a generator that sees one task at a time and may only write the task's own file.",
    "",
    renderRules(rules),
  ].join("\n");
}

/** The spec, framed as the ask, with the answer shape restated where the model reads it last. */
function plannerUser(spec: string): string {
  return [
    "Specification:",
    "",
    spec.trim(),
    "",
    `DECOMPOSE IT. Reply with ONLY the JSON array (no wrapper, no explanation). Start directly with [ and end with ].`,
  ].join("\n");
}

/** Build the planner request: derived rules + task schema in the system turn, spec in the user turn. */
export function buildPlannerPrompt(input: PlannerPromptInput): Prompt {
  return {
    system: plannerSystem(input.rules),
    messages: [{ role: "user", text: plannerUser(input.spec) }],
  };
}
