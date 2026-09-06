// Plan artifact renderer: the durable output of the plan skill's Generate + Tasks phases.
//
// The planner's LLM call returns a task array. This module turns that array into the artifacts the
// `/work` skill consumes — **deterministically**, with no model call, no prose drift and no extra
// tokens:
//
//   <artifactsDir>/plans/<plan-id>-<kebab-title>.md   the Final Plan artifact
//   <artifactsDir>/plans/index.md                     plan registration (one table row)
//   <artifactsDir>/tasks/<plan-id>/T<NN>-<kebab>.md   one task artifact per Acceptance Criterion
//   <artifactsDir>/tasks/<plan-id>/index.md           the checklist `/work` reads and ticks
//
// Deliberately *not* written: `plans/.scope/`, `plans/.research/`, `plans/.design/` and anything
// under `plans/.work/`. Those dumps exist in an interactive session to give a human something to
// approve between phases. There is nothing to approve here, and the reasoning that would have been
// recorded in them happens inside the single planner call — so they are skipped, which is what the
// plan skill's own `autopilot` mode intends. The plan frontmatter says so (`phases-inlined`), and
// Scope/Research/Design carry the plan-id instead of pointing at files that do not exist.
//
// Section shape and frontmatter keys follow the skill's templates
// (`.agents/skills/plan/references/templates/artifacts/final-plan.md` and `task.md`) and the field
// list in `.agents/skills/plan/references/error-handling.md`, so artifacts written here pass the
// Work skill's Step 0 verification unchanged.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { Task } from "./plan.ts";

/** One task artifact, as written to disk. */
export interface TaskArtifact {
  /** `<plan-id>-T<NN>`, the id `/work` accepts as a single-task target. */
  taskId: string;
  /** `T<NN>`, the short form used in the index checklist. */
  label: string;
  /** Repository-relative path of the task file. */
  path: string;
  /** The production file this task owns. */
  file: string;
}

/** Everything one call wrote. */
export interface PlanArtifacts {
  planId: string;
  title: string;
  planPath: string;
  indexPath: string;
  taskIndexPath: string;
  tasks: TaskArtifact[];
}

/** fast / standard / deep, with the complexity and risk that justify it. */
export interface TierSelection {
  tier: "fast" | "standard" | "deep";
  complexity: "TRIVIAL" | "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
  risk: "Low" | "Medium" | "High";
}

/** Plan a `writePlanArtifacts` call can produce, or the reason it could not. */
export type WritePlanArtifactsResult =
  | { ok: true; artifacts: PlanArtifacts }
  | { ok: false; error: string };

/**
 * The fields the artifact renderer needs from a task. `Task` satisfies it; so does a task-shaped
 * object that came from somewhere other than the planner (a test, a partial handoff).
 */
export interface TaskShape {
  file: string;
  purpose: string;
  exports?: string[];
  dependsOn?: string[];
  acceptanceCriterion?: string;
  testFile?: string;
  steps?: string[];
}

const STOPWORDS = new Set([
  "a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "of", "on", "or", "the", "to",
  "with", "that", "this", "it", "is", "are", "be", "using", "use", "will", "must", "should",
]);

const TEST_FILE_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

/** Lowercase kebab-case slug, stopwords dropped; symbol-only input falls back to the full words. */
export function kebabCase(text: string): string {
  const words = text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  const kept = words.filter((w) => !STOPWORDS.has(w));
  const slug = (kept.length > 0 ? kept : words).join("-");
  return slug === "" ? "unnamed" : slug;
}

/** Plan title: the spec's first ATX heading, else its basename, else a neutral default. */
export function derivePlanTitle(spec: string, specPath?: string): string {
  const heading = /^#\s+(.+)$/m.exec(spec);
  if (heading?.[1]) return heading[1].trim();
  if (specPath) {
    const base = (dirname(specPath) === "." ? specPath : specPath.split("/").pop()) ?? specPath;
    const noExt = base.replace(/\.(md|markdown|txt)$/i, "").replace(/[-_]+/g, " ").trim();
    if (noExt.length > 0) return noExt;
  }
  return "Generated implementation plan";
}

/** Overview: the spec's first prose paragraph — headings, tables, lists and fences skipped. */
export function deriveOverview(spec: string, maxChars = 700): string {
  const paragraphs = spec
    .replace(/```[\s\S]*?```/g, "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !/^[#|>*\-\d]/.test(p));

  const text = (paragraphs[0] ?? "").replace(/\s+/g, " ").trim();
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

/**
 * Tier from plan shape, following `.agents/skills/plan/references/plan-tier-selection.md`:
 * complexity sets the base tier and risk can only raise it.
 *
 * A non-interactive run has no `user_preference` input, so complexity is estimated from what the
 * planner actually produced — task count and the depth of the dependency chain.
 */
export function selectTier(tasks: Task[]): TierSelection {
  const count = tasks.length;
  const depth = dependencyDepth(tasks);

  let complexity: TierSelection["complexity"];
  if (count <= 2 && depth <= 1) complexity = "TRIVIAL";
  else if (count <= 4) complexity = "LOW";
  else if (count <= 9) complexity = "MEDIUM";
  else if (count <= 14) complexity = "HIGH";
  else complexity = "VERY_HIGH";

  const risk: TierSelection["risk"] =
    depth >= 4 || count >= 10 ? "High" : count >= 5 ? "Medium" : "Low";

  let tier: TierSelection["tier"];
  if (complexity === "TRIVIAL" || complexity === "LOW") tier = "fast";
  else if (complexity === "MEDIUM") tier = "standard";
  else tier = "deep";

  if (tier === "fast" && risk === "High") tier = "standard"; // risk floor, never a downgrade

  return { tier, complexity, risk };
}

/** Longest dependency chain in the plan (1 = every task independent). */
export function dependencyDepth(tasks: Task[]): number {
  const byFile = new Map(tasks.map((t) => [t.file, t]));
  const memo = new Map<string, number>();

  const depthOf = (task: Task, stack: Set<string>): number => {
    if (stack.has(task.file)) return 1; // cycle guard; the planner rejects cycles before this runs
    const cached = memo.get(task.file);
    if (cached !== undefined) return cached;

    stack.add(task.file);
    let max = 0;
    for (const dep of task.dependsOn) {
      const depTask = byFile.get(dep);
      if (depTask) max = Math.max(max, depthOf(depTask, stack));
    }
    stack.delete(task.file);

    const depth = max + 1;
    memo.set(task.file, depth);
    return depth;
  };

  return tasks.reduce((max, t) => Math.max(max, depthOf(t, new Set())), 0);
}

/** Dependency depth of one task, 1-based: the phase it belongs to. */
function phaseOfTask(tasks: Task[], index: number): number {
  const byFile = new Map(tasks.map((t) => [t.file, t]));
  const stack = new Set<string>();
  const walk = (task: Task, depth: number): number => {
    if (stack.has(task.file)) return depth;
    stack.add(task.file);
    let max = depth;
    for (const dep of task.dependsOn) {
      const depTask = byFile.get(dep);
      if (depTask) max = Math.max(max, walk(depTask, depth + 1));
    }
    stack.delete(task.file);
    return max;
  };
  return walk(tasks[index]!, 1);
}

/** This task's single Acceptance Criterion: the planner's, or a restatement of its purpose. */
export function acceptanceCriterionFor(task: TaskShape): string {
  if (task.acceptanceCriterion) return task.acceptanceCriterion;
  const exports = task.exports && task.exports.length > 0 ? ` and exports ${task.exports.join(", ")}` : "";
  const behaviour = task.purpose.trim().replace(/[.;]+$/, "").toLowerCase();
  return `\`${task.file}\` is created implementing ${behaviour}${exports}, verified by its own test`;
}

/** This task's one test file: the planner's, or the conventional sibling of the file it owns. */
export function testFileFor(task: TaskShape): string {
  if (task.testFile) return task.testFile;
  if (TEST_FILE_RE.test(task.file)) return task.file;
  const suffix = task.file.endsWith("x") ? "tsx" : task.file.endsWith("mjs") || task.file.endsWith("cjs") ? "test.mjs" : "ts";
  return `${task.file.replace(/\.[cm]?[jt]sx?$/, "")}.test.${suffix}`;
}

/** Red -> Green -> Refactor: the planner's three steps, or deterministic ones in the same shape. */
export function stepsFor(task: TaskShape): [string, string, string] {
  const testFile = testFileFor(task);
  const criterion = acceptanceCriterionFor(task);
  const given = (task.steps ?? []).filter((s) => s.trim().length > 0);

  const red =
    given[0] ??
    `**Red — Write the failing test:** add \`${testFile}\` asserting: ${criterion}. Run it and confirm it fails for the right reason — the file under test does not exist or does not yet behave this way.`;
  const green =
    given[1] ??
    `**Green — Implement:** write \`${task.file}\` with the minimum complete implementation that makes that test pass — no placeholders, no stubbed bodies.`;
  const refactor =
    given[2] ??
    `**Refactor:** with the test green, tighten naming, duplication and structure in \`${task.file}\`; keep its declared exports stable.`;

  return [red, green, refactor];
}

/** `T01`, `T02`, … zero-padded to two digits, in dependency order. */
export function taskLabel(index: number): string {
  return `T${String(index + 1).padStart(2, "0")}`;
}

/** `YYYY-MM-DD` in UTC — the date component of a plan-id. */
export function isoDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function listNames(dir: string): { name: string; isDirectory: boolean }[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir, { withFileTypes: true }).map((e) => ({
      name: e.name,
      isDirectory: e.isDirectory(),
    }));
  } catch {
    return [];
  }
}

/**
 * Allocate the next plan-id for today: `YYYY-MM-DD-NNN`.
 *
 * Per `.agents/skills/plan/references/id-generation.md`, counted from `<artifactsDir>/plans/` —
 * dot-directories (`.scope/`, `.work/`, …) excluded, since those hold phase dumps rather than
 * plan-ids. Task folders under `<artifactsDir>/tasks/` are counted too: the work skill allocates an
 * ad-hoc `work-id` by counting exactly those, so an id free of one is free of the other.
 */
export function allocatePlanId(artifactsDir: string, now: Date = new Date()): string {
  const date = isoDate(now);
  const fileRe = new RegExp(`^${date}-(\\d{3})(?:-|\\.md$|$)`);

  const taken = new Set<string>();
  const collect = (entries: { name: string }[]) => {
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const match = fileRe.exec(entry.name);
      if (match?.[1]) taken.add(match[1]);
    }
  };

  collect(listNames(join(artifactsDir, "plans")));
  collect(listNames(join(artifactsDir, "tasks")));

  let n = 1;
  while (taken.has(String(n).padStart(3, "0"))) n += 1;
  return `${date}-${String(n).padStart(3, "0")}`;
}

/** Mermaid flowchart of the plan's own dependency edges. */
function renderMermaid(tasks: Task[]): string {
  const lines = ["```mermaid", "flowchart TD"];
  tasks.forEach((task, i) => {
    lines.push(`  ${taskLabel(i)}["${task.file}"]`);
  });
  tasks.forEach((task, i) => {
    for (const dep of task.dependsOn) {
      const depIndex = tasks.findIndex((t) => t.file === dep);
      if (depIndex >= 0) lines.push(`  ${taskLabel(depIndex)} --> ${taskLabel(i)}`);
    }
  });
  lines.push("```");
  return lines.join("\n");
}

/** Risk table derived from the plan's shape — never an invented hazard list. */
function renderRisks(tasks: Task[], depth: number): string {
  const rows: { risk: string; impact: string; mitigation: string }[] = [];

  const untestFiles = tasks.filter((t) => !t.testFile && !TEST_FILE_RE.test(t.file));
  if (untestFiles.length > 0) {
    rows.push({
      risk: `${untestFiles.length} task(s) named no test file, so this plan guesses one and the AC may go unproven`,
      impact: "High",
      mitigation: "Ask the planner for `testFile` per task; the validation gate fails the run when a task's test is absent",
    });
  }
  if (depth >= 4) {
    rows.push({
      risk: `Dependency chain ${depth} files deep: one wrong file blocks everything downstream of it`,
      impact: "High",
      mitigation: "Dependency outputs are injected into downstream contexts, and the outer repair loop re-enters at the offending file",
    });
  }
  const derivedCriteria = tasks.filter((t) => !t.acceptanceCriterion).length;
  if (derivedCriteria > 0) {
    rows.push({
      risk: `${derivedCriteria} task(s) planned without an explicit Acceptance Criterion; their criteria are restated from purpose`,
      impact: "Medium",
      mitigation: "Strengthen the planner prompt so every task carries `acceptanceCriterion`; do not hand-edit artifacts to compensate",
    });
  }

  rows.push(
    {
      risk: "Planner returns prose or a wrapper object instead of the bare task array",
      impact: "Medium",
      mitigation: "Forced `write_plan` tool call, schema validation and exactly one re-ask; the run then fails loudly instead of planning twice",
    },
    {
      risk: "Generated code drifts from the boilerplate contract (redefined types, restated handlers)",
      impact: "High",
      mitigation: "Rules derived from the reference files are rendered into every planner and executor turn; `npm run typecheck` and `npm run test` are the gate",
    },
  );

  return [
    "| Risk | Impact | Mitigation |",
    "| --- | --- | --- |",
    ...rows.map((r) => `| ${r.risk} | ${r.impact} | ${r.mitigation} |`),
  ].join("\n");
}

/** Implementation Units, grouped into phases by dependency depth. */
function renderUnits(tasks: Task[]): string {
  const phaseNames = ["Foundation", "Integration", "Rollout"];
  const byPhase = new Map<number, number[]>();
  tasks.forEach((_, index) => {
    const phase = Math.min(3, phaseOfTask(tasks, index));
    const bucket = byPhase.get(phase) ?? [];
    bucket.push(index);
    byPhase.set(phase, bucket);
  });

  const out: string[] = [];
  for (const phase of [...byPhase.keys()].sort((a, b) => a - b)) {
    out.push(`### Phase ${phase}: ${phaseNames[phase - 1] ?? `Wave ${phase}`}`, "");
    for (const index of byPhase.get(phase) ?? []) {
      const task = tasks[index]!;
      const [red, , refactor] = stepsFor(task);
      out.push(
        `- U${index + 1}. **${task.title ?? task.purpose}**`,
        `  - **Goal:** ${task.purpose}`,
        `  - **Dependencies:** ${task.dependsOn.length > 0 ? task.dependsOn.map((d) => `\`${d}\``).join(", ") : "None"}`,
        "  - **Files:**",
        `    - Create: \`${task.file}\``,
        `    - Test: \`${testFileFor(task)}\``,
        "  - **Acceptance Criteria:**",
        `    - ${acceptanceCriterionFor(task)}`,
        "  - **Test Scenarios:**",
        `    - ${stripBold(red).slice(0, 220)}`,
        "  - **Refactor note:**",
        `    - ${stripBold(refactor).slice(0, 220)}`,
        "",
      );
    }
  }
  return out.join("\n").trimEnd();
}

function stripBold(text: string): string {
  return text.replace(/\*\*/g, "");
}

/** The Final Plan artifact, in the shape the template and the Work skill's gate expect. */
export function renderFinalPlan(input: {
  planId: string;
  title: string;
  overview: string;
  specPath?: string;
  tasks: Task[];
  now?: Date;
  generatedBy?: string;
}): string {
  const { planId, title, overview, tasks } = input;
  const now = input.now ?? new Date();
  const date = isoDate(now);
  const tier = selectTier(tasks);
  const depth = dependencyDepth(tasks);

  const frontmatter = [
    "---",
    `plan-id: ${planId}`,
    "type: plan",
    `title: ${quote(title)}`,
    "status: complete",
    `tier: ${tier.tier}`,
    `tier_recommended: ${tier.tier}`,
    `complexity: ${tier.complexity}`,
    `risk: ${tier.risk}`,
    `scope-id: ${planId}`,
    `research-id: ${planId}`,
    `design-id: ${planId}`,
    "phases-inlined: scope, research, design",
    "interactionMode: autopilot",
    `created: ${date}`,
    `updated: ${date}`,
    "version: 1.0",
    `generated-by: ${input.generatedBy ?? "agent/src/index.ts"}`,
    `spec: ${input.specPath ?? "(inline)"}`,
    "---",
  ].join("\n");

  const body = [
    "## Overview",
    "",
    overview === ""
      ? "_No prose paragraph was found in the spec; the implementation units below are the plan._"
      : overview,
    "",
    `# ${title}`,
    "",
    "## High-Level Technical Design",
    "",
    "> **Note:** This is directional guidance for review, not an implementation specification to copy.",
    "> The diagram is rendered from the planner's own dependency graph, so it cannot drift from the task list.",
    "",
    renderMermaid(tasks),
    "",
    "```",
    `${tasks.length} file-level task(s) · longest dependency chain ${depth} · one file per task, generated in dependency order`,
    "```",
    "",
    "## Implementation Units (Phased)",
    "",
    renderUnits(tasks),
    "",
    "## Risk Analysis & Mitigation",
    "",
    renderRisks(tasks, depth),
    "",
    "## Operational / Rollout Notes",
    "",
    `- Execute with the work skill: \`/work ${planId}\` runs the whole list in dependency order, \`/work ${planId}-T01\` runs one task's Red → Green → Refactor cycle.`,
    `- Task artifacts live in \`<artifactsDir>/tasks/${planId}/\`. The plan document and its task files are the only artifacts this run writes — no \`.scope/\`, \`.research/\`, \`.design/\` or \`.work/\` dumps.`,
    "- Rollback: the generated app is written into a fresh `--out` directory, so deleting that directory reverts the run completely.",
    "",
    "## Related Learnings",
    "",
    "- Not consulted by this pipeline: an autopilot run plans from the spec plus the derived boilerplate rules. Entries under `docs/learn/` are applied by interactive `/plan` sessions.",
    "",
    "## Learning Gaps",
    "",
    "- Whether an autopilot planner states exactly one Acceptance Criterion and one test file per task reliably — check the derived-criteria risk row above and capture the outcome with `/learn`.",
    "",
  ];

  return `${frontmatter}\n\n${body.join("\n")}`;
}

/** YAML `key: "value"` with quotes neutralised. */
function quote(value: string): string {
  return `"${value.replace(/"/g, "'")}"`;
}

/** One task artifact, in the shape `/work` validates at its Step 0 gate. */
export function renderTaskArtifact(input: {
  planId: string;
  task: Task;
  index: number;
  taskTitle: string;
  now?: Date;
  labelByFile?: Map<string, string>;
}): string {
  const { planId, task, index } = input;
  const now = input.now ?? new Date();
  const label = taskLabel(index);
  const taskId = `${planId}-${label}`;
  const criterion = acceptanceCriterionFor(task);
  const testFile = testFileFor(task);
  const [red, green, refactor] = stepsFor(task);
  const ownsTestFile = TEST_FILE_RE.test(task.file);

  const dependencies = task.dependsOn.map((dep) => {
    const depLabel = input.labelByFile?.get(dep);
    return depLabel ? `${planId}-${depLabel}` : `${dep} (not a planned task)`;
  });

  return [
    "---",
    `id: ${taskId}`,
    `title: ${quote(input.taskTitle)}`,
    `plan-id: ${planId}`,
    `unit: ${task.unit ?? `U${index + 1}`}`,
    `tier: ${selectTier([task]).tier}`,
    "status: not-started",
    `priority: ${task.priority ?? (index < 3 ? "P0" : "P1")}`,
    `dependencies: [${dependencies.join(", ")}]`,
    "files:",
    "  create:",
    ownsTestFile ? "    []" : `    - ${task.file}`,
    "  modify: []",
    "  test:",
    `    - ${testFile}`,
    `estimated-effort: "${task.effort ?? "1 hour"}"`,
    `timestamp: ${now.toISOString().replace(/\.\d{3}Z$/, "Z")}`,
    "---",
    "",
    `# ${input.taskTitle}`,
    "",
    "## Goal",
    "",
    task.purpose,
    "",
    "## Acceptance Criterion",
    "",
    criterion,
    "",
    "## Steps",
    "",
    `1. ${red}`,
    `2. ${green}`,
    `3. ${refactor}`,
    "",
    "## Test Scenarios",
    "",
    `- ${criterion}`,
    "",
    "## Acceptance Criteria",
    "",
    `- [ ] ${criterion}`,
    "",
    "## Dependencies",
    "",
    dependencies.length === 0
      ? "- None"
      : dependencies.map((d) => `- \`${d}\`: its output is imported by \`${task.file}\``).join("\n"),
    "",
    "## Notes",
    "",
    `- Must export: ${task.exports.length > 0 ? task.exports.map((e) => `\`${e}\``).join(", ") : "(none declared)"}.`,
    `- Executed by the work skill in autopilot. The only files this task may create are the ones named above; no \`.work/\` phase artifacts are written for it.`,
    "",
  ].join("\n");
}

/** Title-case a filename into a task title, with the purpose as the qualifier. */
function deriveTaskTitle(task: Task): string {
  const base = (task.file.split("/").pop() ?? task.file).replace(TEST_FILE_RE, "").replace(/\.[cm]?[jt]sx?$/, "");
  const words = base
    .replace(/[-_.]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  const head = words.length > 0 ? words.join(" ") : "Task";
  return `${head} — ${task.purpose.trim().replace(/[.;]+$/, "")}`;
}

/**
 * Write the plan document, the task artifacts and both indexes.
 *
 * Filesystem work only, so it is safe from the CLI and from tests: directories are created as
 * needed, an existing plan row / task section is never duplicated, and paths are recorded
 * repository-relative.
 */
export function writePlanArtifacts(input: {
  artifactsDir: string;
  spec: string;
  tasks: Task[];
  specPath?: string;
  title?: string;
  planId?: string;
  now?: Date;
}): WritePlanArtifactsResult {
  if (input.tasks.length === 0) {
    return { ok: false, error: "Cannot write plan artifacts for an empty task list" };
  }

  const now = input.now ?? new Date();
  const planId = input.planId ?? allocatePlanId(input.artifactsDir, now);
  const title = input.title ?? derivePlanTitle(input.spec, input.specPath);
  const slug = kebabCase(title);

  const plansDir = join(input.artifactsDir, "plans");
  const taskDir = join(input.artifactsDir, "tasks", planId);
  mkdirSync(plansDir, { recursive: true });
  mkdirSync(taskDir, { recursive: true });

  const labelByFile = new Map(input.tasks.map((t, i) => [t.file, taskLabel(i)]));
  const planPath = join(plansDir, `${planId}-${slug}.md`);

  writeFileSync(
    planPath,
    renderFinalPlan({
      planId,
      title,
      overview: deriveOverview(input.spec),
      specPath: input.specPath,
      tasks: input.tasks,
      now,
    }),
    "utf8",
  );

  const taskArtifacts: TaskArtifact[] = input.tasks.map((task, index) => {
    const label = taskLabel(index);
    const taskTitle = task.title ?? deriveTaskTitle(task);
    const taskPath = join(taskDir, `${label}-${kebabCase(taskTitle)}.md`);
    writeFileSync(
      taskPath,
      renderTaskArtifact({ planId, task, index, taskTitle, now, labelByFile }),
      "utf8",
    );
    return { taskId: `${planId}-${label}`, label, path: repoRelative(taskPath), file: task.file };
  });

  const indexPath = join(plansDir, "index.md");
  registerPlanInIndex(indexPath, {
    planId,
    title,
    file: `${planId}-${slug}.md`,
    tier: selectTier(input.tasks),
  });

  const taskIndexPath = join(taskDir, "index.md");
  writeTaskIndex(taskIndexPath, { planId, title, artifacts: taskArtifacts, tasks: input.tasks });

  return {
    ok: true,
    artifacts: {
      planId,
      title,
      planPath: repoRelative(planPath),
      indexPath: repoRelative(indexPath),
      taskIndexPath: repoRelative(taskIndexPath),
      tasks: taskArtifacts,
    },
  };
}

/** Repository-relative display path — artifacts never record an absolute path. */
function repoRelative(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** Append this plan's row to `<artifactsDir>/plans/index.md`, creating the index if absent. */
export function registerPlanInIndex(
  indexPath: string,
  row: { planId: string; title: string; file: string; tier: TierSelection },
): void {
  const line = `| [${row.planId}](${row.file}) | ${row.title.replace(/\|/g, "\\|")} | ${row.tier.tier} | ${row.tier.tier} | ${row.tier.complexity} | ${row.tier.risk} | planned |`;

  if (!existsSync(indexPath)) {
    writeFileSync(
      indexPath,
      [
        "---",
        'type: "index"',
        'title: "Plan Index"',
        'description: "Plans produced by /plan sessions and by the agent pipeline."',
        "---",
        "",
        "## Plans",
        "",
        "| Plan ID | Title | tier | tier_recommended | complexity | risk | status |",
        "| --- | --- | --- | --- | --- | --- | --- |",
        line,
        "",
      ].join("\n"),
      "utf8",
    );
    return;
  }

  const existing = readFileSync(indexPath, "utf8");
  if (existing.includes(`[${row.planId}]`)) return; // already registered — idempotent on re-run

  const lines = existing.split("\n");
  let lastTableRow = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i]?.startsWith("| ")) lastTableRow = i;
  }
  if (lastTableRow === -1) {
    writeFileSync(
      indexPath,
      [
        existing.trimEnd(),
        "",
        "## Plans",
        "",
        "| Plan ID | Title | tier | tier_recommended | complexity | risk | status |",
        "| --- | --- | --- | --- | --- | --- | --- |",
        line,
        "",
      ].join("\n"),
      "utf8",
    );
    return;
  }

  lines.splice(lastTableRow + 1, 0, line);
  writeFileSync(indexPath, lines.join("\n"), "utf8");
}

/** Create the task checklist index `/work` reads, or append this plan's section to an existing one. */
export function writeTaskIndex(
  taskIndexPath: string,
  input: { planId: string; title: string; artifacts: TaskArtifact[]; tasks: Task[] },
): void {
  const section = [
    `## ${input.planId} — ${input.title}`,
    "",
    ...input.artifacts.map((artifact, i) => {
      const task = input.tasks[i];
      const unit = task?.unit ?? `U${i + 1}`;
      const criterion = task ? acceptanceCriterionFor(task) : artifact.file;
      return `- [ ] ${artifact.label} — ${criterion.slice(0, 120)} (\`${unit}\`, file: \`${artifact.file}\`) — \`${artifact.path}\``;
    }),
    "",
  ].join("\n");

  if (!existsSync(taskIndexPath)) {
    writeFileSync(
      taskIndexPath,
      [
        "---",
        `plan-id: ${input.planId}`,
        'type: "task-index"',
        quote(input.title),
        "interactionMode: autopilot",
        "---",
        "",
        `# Tasks — ${input.title}`,
        "",
        "Task artifacts produced by the plan skill's Tasks phase (always run, autopilot).",
        `Execute with the work skill: \`/work ${input.planId}\` for the whole list, \`/work ${input.planId}-T01\` for one task.`,
        "",
        section,
      ].join("\n"),
      "utf8",
    );
    return;
  }

  const existing = readFileSync(taskIndexPath, "utf8");
  if (existing.includes(`## ${input.planId} —`)) return;
  writeFileSync(taskIndexPath, `${existing.trimEnd()}\n\n${section}`, "utf8");
}
