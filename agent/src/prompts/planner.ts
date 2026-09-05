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
import { planSkillBlock } from "../skill-prompts.ts";
import { DEFAULTS } from "../config.ts";

/**
 * The shape of one planned task.
 *
 * Kept in sync with `GenerationTask` in `generator.ts` by construction: the generator accepts the
 * plan's own entries, so the four keys below are the only contract between the two calls.
 */
const TASK_PLAN_SCHEMA_KEYS = ["file", "purpose", "dependsOn", "exports"] as const;

/**
 * Optional task-slicing fields (plan skill, Phase 5 `tasks.md`).
 *
 * The four required keys above are the generation contract; these carry the information a
 * *task artifact* needs — one Acceptance Criterion, exactly one test file, Red→Green→Refactor
 * steps — so the plan can be registered in `docs/tasks/<plan-id>/` and picked up by the work
 * skill. Every one is optional: a model that returns only the four required keys still yields a
 * valid plan, and the artifact renderer fills the gaps deterministically.
 */
const TASK_PLAN_OPTIONAL_KEYS = {
  title: {
    type: "string",
    description: "Short, action-oriented task title, for the task artifact heading.",
  },
  unit: {
    type: "string",
    description: "The implementation unit this task belongs to, e.g. `U1` or `U2a`.",
  },
  acceptanceCriterion: {
    type: "string",
    description:
      "Exactly one verifiable criterion for this task — one criterion per task, never bundled.",
  },
  testFile: {
    type: "string",
    description:
      "The one test file that asserts this task's acceptance criterion, e.g. `src/CarList.test.tsx`.",
  },
  steps: {
    type: "array",
    items: { type: "string" },
    description:
      "Red -> Green -> Refactor: [0] the failing test and how it is confirmed red, [1] the minimum implementation, [2] the refactor that keeps it green.",
  },
  priority: {
    type: "string",
    description: "P0 (blocks all), P1 (critical path) or P2 (deferrable).",
  },
  effort: {
    type: "string",
    description: "Rough estimate for this task alone, e.g. `2 hours`.",
  },
} as const;

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
  additionalProperties: true,
  required: [...TASK_PLAN_SCHEMA_KEYS],
  properties: {
    ...TASK_PLAN_OPTIONAL_KEYS,
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
  /**
   * Skills directory to load the `plan` skill from. When it resolves (default `.agents/skills`),
   * the skill body becomes the binding procedure for this call; when the directory or the skill is
   * missing, the planner degrades to its own role + contract text instead of failing the run.
   * Pass an empty string to disable injection (tests that assert the bare contract).
   */
  skillsDir?: string;
}

/** Planning constraints, including the task-slicing invariants the Tasks phase depends on. */
function planningConstraints(): string[] {
  return [
    "Planning constraints:",
    `- One task per file. ${TASK_PLAN_SCHEMA_KEYS[0]} is where the work lands, so a task that touches two files is two tasks.`,
    "- Order the array so every task appears after the tasks it lists as dependencies: shared types and data-access hooks first, the components that consume them next, the app shell that wires them together last, and the tests for a file after that file.",
    "- The spec is the only source of requirements. Cover every behaviour it asks for, and invent nothing it does not.",
    "- The tasks must be completable by a generator that sees one task at a time and may only write the task's own file.",
    "",
    "Task slicing (Phase 5 of the plan skill — always run, never skipped):",
    "- One Acceptance Criterion per task, stated in `acceptanceCriterion`: one sentence, verifiable, not bundled with another.",
    "- One test per task, in `testFile`: the single test file that proves that criterion. Exactly one path, never zero and never two.",
    "- `steps` is three entries in Red -> Green -> Refactor order: the failing test first, the minimum implementation second, the refactor third.",
    "- `title` is short and action-oriented; `unit` names the implementation unit the task belongs to (`U1`, `U2a`, ...).",
  ];
}

/**
 * Restated after the skill body, which is the last thing in the system turn and the only part of
 * the prompt that talks about writing markdown artifacts. Without it, "produce the Final Plan
 * artifact" reads like an instruction to answer in prose.
 */
const OUTPUT_CONTRACT_REMINDER =
  "Final note on output format: the plan skill's artifact templates describe what the harness writes to disk from your answer. Your answer itself is ONLY the bare JSON array of task objects defined above — no markdown, no plan document, no prose, no wrapper object.";

/** The role, the contract, and the rules — nothing a model should have to guess. */
function plannerSystem(rules: DerivedRules, skillBlock = ""): string {
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
    ...planningConstraints(),
    "",
    renderRules(rules),
    ...(skillBlock === "" ? [] : ["", skillBlock, "", OUTPUT_CONTRACT_REMINDER]),
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
  const skillBlock =
    input.skillsDir === "" ? "" : planSkillBlock(input.skillsDir ?? DEFAULTS.skillsDir);
  return {
    system: plannerSystem(input.rules, skillBlock),
    messages: [{ role: "user", text: plannerUser(input.spec) }],
  };
}
