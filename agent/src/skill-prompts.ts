// Workflow-skill injection: the agent executes the repository's own `plan` and `work` skills.
//
// The planner and the executor used to carry bespoke prose ("decompose into file-level tasks",
// "write one file") written here in `agent/src/prompts/`. That prose was a weaker, drifting copy of
// what `.agents/skills/plan` and `.agents/skills/work` already specify — so the agent now loads those
// skills verbatim and injects them as the binding procedure for the call. One source of truth:
// change the skill, and the agent's behaviour changes with it.
//
// Two things the skills were NOT written for, and which this module therefore has to say out loud:
//
//   1. **There is no user.** Both skills open with "ask the user to choose an interaction mode"
//      and pause at every phase gate. This run is non-interactive, so the mode is pinned to
//      `autopilot` and every confirmation step is void.
//   2. **Their phase artifacts are too expensive to persist here.** A `/plan` session writes
//      `.scope/.research/.design` dumps and a `/work` session writes `.work/.triage|.prepare|
//      .execute|.review` dumps. The reasoning still happens; the files do not. The durable outputs
//      of this pipeline are exactly three things: the final plan document, the task files, and the
//      generated code (plus one closing work report line in the task index).
//
//   3. **Their sandbox has one root.** The executor's `read_file` / `write_file` / `list_files` reach
//      only the generated app's output directory, and `run_command` only allow-listed npm scripts
//      (`agent/src/tools/fs.ts`, `agent/src/tools/shell.ts`). The `work` skill's Pre-Flight Check,
//      Index Registration and Work Branch steps all reach for `docs/` or `git`, which are outside it —
//      `docs` is excluded from the scaffold (`DEFAULT_EXCLUDE` in `agent/src/scaffold.ts`). Left
//      unqualified, the model obeys the skill and takes a refusal it cannot act on; a run log recorded
//      `not_found` on `list_files("docs/tasks")` for exactly this reason. So the block voids those
//      sections and names the harness as their owner. This is prompt prose, not a sandbox exception:
//      nothing under `docs/` is ever made reachable from inside the call.
//
// The skill bodies also describe markdown output ("produce a Final Plan artifact"). The model's
// answer here is consumed by a validator, not a human, so the output contract in the prompt this
// block is appended to always wins — that precedence is stated, never assumed.

import { discoverSkills, findSkill, loadSkillBundle } from "./skills.ts";

/** Phases of the plan skill whose modules the planner call has to reason about. */
export const PLAN_SKILL_MODULES = ["generate", "tasks"] as const;

/** Phases of the work skill whose modules the executor call has to reason about. */
export const WORK_SKILL_MODULES = ["execute"] as const;

/**
 * The `work` skill's bookkeeping sections, which need a repository the executor cannot see. Named in
 * the block's overrides so the model leaves them alone instead of probing for them; the harness does
 * this work around the call (`agent/src/work-artifacts.ts`).
 */
export const WORK_HARNESS_OWNED_SECTIONS = [
  "the Pre-Flight Check over `docs/tasks/` and the `mkdir -p` Self-Healing that follows it",
  "Index Registration — ticking `docs/tasks/<plan-id>/index.md` and appending its Work Report block",
  "each task file's `status` frontmatter and its `## Acceptance Criteria` checkbox",
  "the Work Branch step (`git` branch creation and checkout)",
] as const;

/** Cap on rendered skill text per prompt, so a growing skill file cannot silently balloon cost. */
export const SKILL_BLOCK_MAX_BYTES = 40_000;

export interface SkillBlockInput {
  /** Directory scanned for `<id>/SKILL.md` (usually `AgentConfig.skillsDir`). */
  skillsDir: string;
  /** Skill directory name, e.g. `"plan"` or `"work"`. */
  skillId: string;
  /** Module basenames to inline from `<skillDir>/modules/`, in order. */
  modules?: readonly string[];
  /** Extra binding rules appended after the standard overrides. */
  extraRules?: readonly string[];
  /** Override the rendered byte cap (default `SKILL_BLOCK_MAX_BYTES`). */
  maxBytes?: number;
}

/** The rules that make an interactive, human-orchestrated skill runnable by a non-interactive loop. */
function autopilotOverrides(input: {
  skillId: string;
  durableOutputs: readonly string[];
  droppedArtifacts: readonly string[];
  /** Skill sections the harness performs around this call; empty when nothing is out of reach. */
  harnessOwned: readonly string[];
  extraRules: readonly string[];
}): string[] {
  return [
    `Interaction mode: **autopilot**, fixed for the whole ${input.skillId} pipeline. There is no user in this loop: never ask a question, never offer options, never wait for a confirmation at a phase gate. Where the skill says "ask the user", silently take the recommended option and record it as your decision.`,
    `Tier, mode and complexity choices are yours to make in one pass; do not stop to negotiate them.`,
    `Do NOT write these intermediate phase artifacts: ${input.droppedArtifacts
      .map((a) => `\`${a}\``)
      .join(", ")}. Their reasoning still happens, in this single response — only the files are skipped.`,
    ...(input.harnessOwned.length === 0
      ? []
      : [
          `The harness performs these parts of the skill around this call, not you: ${input.harnessOwned
            .join("; ")}. Your tools — \`read_file\`, \`write_file\`, \`list_files\`, \`run_command\` — are confined to the generated app's output directory, which holds no \`docs/\` tree and no git repository, and \`run_command\` runs allow-listed npm scripts only. So listing or reading a path under \`docs/\` fails \`not_found\` or \`path_escape\`, a \`git\` command is refused, and those refusals are correct, not an obstacle to route around. Never probe for those folders, never \`mkdir\` a \`docs/\` tree inside the output directory to satisfy the skill, and do not report a bookkeeping step as blocked.`,
        ]),
    `The durable outputs of this run are: ${input.durableOutputs
      .map((d) => `\`${d}\``)
      .join(", ")}. The harness writes those files for you; you produce the content.`,
    ...input.extraRules,
  ];
}

/**
 * Render one skill as a binding, autopilot-pinned procedure block.
 *
 * Returns `""` when the skill is not found or the directory is missing, so a checkout without
 * `.agents/skills/` degrades to the plain planner/executor prompt instead of failing a run.
 */
export function buildSkillBlock(input: SkillBlockInput): string {
  const skills = discoverSkills(input.skillsDir);
  const meta = findSkill(skills, input.skillId);
  if (!meta) return "";

  const maxBytes = input.maxBytes ?? SKILL_BLOCK_MAX_BYTES;
  const bundle = loadSkillBundle(meta, { modules: [...(input.modules ?? [])], maxBytes });

  const isPlan = meta.id === "plan";
  const overrides = autopilotOverrides({
    skillId: meta.name,
    durableOutputs: isPlan
      ? ["docs/plans/<plan-id>-<kebab-name>.md", "docs/tasks/<plan-id>/TASK-NNN-<kebab-name>.md"]
      : ["the files named by the current task"],
    droppedArtifacts: isPlan
      ? ["docs/plans/.scope/", "docs/plans/.research/", "docs/plans/.design/"]
      : ["docs/plans/.work/.triage/", "docs/plans/.work/.prepare/", "docs/plans/.work/.execute/", "docs/plans/.work/.review/"],
    harnessOwned: isPlan ? [] : WORK_HARNESS_OWNED_SECTIONS,
    extraRules: input.extraRules ?? [],
  });

  const sections = [
    `## Workflow skill: \`${meta.id}\` — binding procedure for this call`,
    "",
    "Execute the skill below as the procedure you are following. It is not background reading.",
    "",
    "### Binding overrides for this run",
    "",
  ];
  overrides.forEach((rule, i) => {
    sections.push(`${i + 1}. ${rule}`);
  });

  if (bundle.omitted.length > 0) {
    sections.push(
      "",
      `Phase modules not inlined (reasoned about from the pipeline table above): ${bundle.omitted
        .map((o) => `\`${o.name}\` (${o.reason})`)
        .join(", ")}.`,
    );
  }

  sections.push("", "### Skill body (verbatim)", "", bundle.text, "");

  return sections.join("\n");
}

/** The plan skill, as injected into the planner call (Scope→Research→Design→Generate→Tasks, autopilot). */
export function planSkillBlock(skillsDir: string, extraRules: readonly string[] = []): string {
  return buildSkillBlock({
    skillsDir,
    skillId: "plan",
    modules: PLAN_SKILL_MODULES,
    extraRules: [
      "Run all five phases — Scope, Research, Design, Generate, Tasks — in one pass, in that order; the answer you give is the product of all of them.",
      "Phase 5 (Tasks) is never skipped, whatever the tier: task artifacts are always generated.",
      "Your answer must still satisfy the output contract stated above this section — the plan and its tasks are read back by a program, not by a person.",
      ...extraRules,
    ],
  });
}

/** The work skill, as injected into the per-task executor call (Triage→Prepare→Execute→Review, autopilot). */
export function workSkillBlock(skillsDir: string, extraRules: readonly string[] = []): string {
  return buildSkillBlock({
    skillsDir,
    skillId: "work",
    modules: WORK_SKILL_MODULES,
    extraRules: [
      "Triage and Prepare are already done for you: the plan exists, the task list exists, and this call is scoped to exactly one task file. Do not re-plan and do not touch other tasks.",
      "Execute is your part of the pipeline: Red -> Green -> Refactor for this one task, in the order you write files. The harness runs the suite after your call.",
      "Review's bookkeeping (task `status`, the index checkbox, the work report) is written by the harness after your call. Never weaken or delete an Acceptance Criterion to make a check pass — report the blocker in prose instead.",
      ...extraRules,
    ],
  });
}
