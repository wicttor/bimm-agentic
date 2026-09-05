// Work artifact bookkeeping: the durable output of the work skill's Execute + Review phases.
//
// `/work` normally writes four phase artifacts (`docs/plans/.work/.triage|.prepare|.execute|.review`)
// plus per-task status updates. The phase dumps are the human's audit trail for an interactive run;
// in a non-interactive code-generation run they duplicate information the run trace already holds,
// so this module writes **only** what the task artifacts themselves have to reflect:
//
//   - each task file's frontmatter `status` and its `## Acceptance Criteria` checkbox,
//   - the matching `- [ ]` → `- [x]` line in `docs/tasks/<plan-id>/index.md`,
//   - one closing `## Work Report` block in that index — the single "final result" record.
//
// Everything here is idempotent and forward-only, which is the Work skill's resume rule: a
// `completed` task is never re-opened and a checkbox is never unticked. A task that failed stays
// unchecked with `status: blocked` and the recorded reason, so re-running the pipeline resumes on it.

import { existsSync, readFileSync, writeFileSync } from "node:fs";

/** The three outcomes a task run can end in, matching the work skill's status vocabulary. */
export type TaskRunStatus = "completed" | "blocked" | "skipped";

/** One executed task and how it ended. */
export interface WorkOutcome {
  /** `<plan-id>-T<NN>` */
  taskId: string;
  /** `T<NN>` — the label used in the index checklist. */
  label: string;
  /** Repository-relative path to the task artifact. */
  taskPath: string;
  status: TaskRunStatus;
  /** Why it is not completed (required for blocked/skipped, ignored otherwise). */
  reason?: string;
}

/** What goes in the closing report block. */
export interface WorkReport {
  planId: string;
  outcomes: WorkOutcome[];
  /**
   * Total tasks in the plan, when the caller knows it. The report counts completed against this,
   * so a partial run (one task executed out of five) reads as incomplete instead of 1/1.
   * Defaults to the number of outcomes passed.
   */
  totalTasks?: number;
  /** Extra lines: validation results, repair rounds, cost, etc. */
  notes?: string[];
  /** Recorded as the report's timestamp; defaults to now. */
  at?: string;
}

/** Result of one bookkeeping pass, for logging and tests. */
export interface WorkRecordResult {
  taskFilesUpdated: string[];
  indexUpdated: boolean;
  reportWritten: boolean;
  errors: string[];
}

/** Replace (or insert) the `status:` value inside a task file's frontmatter block. */
export function setFrontmatterStatus(text: string, status: TaskRunStatus): string {
  const lines = text.split("\n");
  if (lines[0]?.trim() !== "---") return text; // no frontmatter: leave the file alone, untouched

  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i]?.trim() === "---") break; // end of frontmatter
    const match = /^status:\s*(.*)$/.exec(lines[i] ?? "");
    if (match) {
      lines[i] = `status: ${status}`;
      return lines.join("\n");
    }
  }
  return text;
}

/** Tick the single `- [ ]` item under `## Acceptance Criteria` (one AC per task, so one box). */
export function tickAcceptanceCriterion(text: string): string {
  const lines = text.split("\n");
  let inSection = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (/^##\s+/.test(line)) {
      inSection = /^##\s+Acceptance Criteria\s*$/.test(line.trim());
      continue;
    }
    if (inSection && line.startsWith("- [ ] ")) {
      lines[i] = line.replace("- [ ] ", "- [x] ");
      return lines.join("\n");
    }
  }
  return text; // already ticked, or no such section: idempotent no-op
}

/** Tick the checklist line for one task label in a task index. Forward-only. */
export function tickIndexChecklist(indexText: string, label: string): string {
  const pattern = new RegExp(`^- \\[ \\] (${escapeRegExp(label)})(\\s|—|-)`, "m");
  return indexText.replace(pattern, (_m, l: string, sep: string) => `- [x] ${l}${sep}`);
}

/**
 * Update task artifacts and their index for a finished run.
 *
 * Paths come in as they were written by `writePlanArtifacts` — repository-relative or absolute,
 * never re-prefixed here. A missing file is reported, not fatal: the pipeline's job is the
 * generated app, and a bookkeeping failure must never lose it.
 */
export function recordWorkOutcomes(input: {
  /** Path to `docs/tasks/<plan-id>/index.md` as returned by `writePlanArtifacts`. */
  taskIndexPath: string;
  /** One outcome per executed task, in plan order. */
  outcomes: WorkOutcome[];
  /** Header for the closing report block. */
  planId: string;
  /** Total tasks in the plan; see `WorkReport.totalTasks`. */
  totalTasks?: number;
  notes?: string[];
  at?: string;
}): WorkRecordResult {
  const result: WorkRecordResult = {
    taskFilesUpdated: [],
    indexUpdated: false,
    reportWritten: false,
    errors: [],
  };
  const report: WorkReport = {
    planId: input.planId,
    outcomes: input.outcomes,
    totalTasks: input.totalTasks,
    notes: input.notes,
    at: input.at,
  };

  for (const outcome of input.outcomes) {
    const path = outcome.taskPath;
    if (!existsSync(path)) {
      result.errors.push(`task artifact not found: ${outcome.taskPath}`);
      continue;
    }
    try {
      let text = readFileSync(path, "utf8");
      const status = statusIn(text);
      if (status === "completed" && outcome.status !== "completed") continue; // never re-open
      text = setFrontmatterStatus(text, outcome.status);
      if (outcome.status === "completed") text = tickAcceptanceCriterion(text);
      if (outcome.status !== "completed" && outcome.reason) {
        text = appendBlockedReason(text, outcome.reason);
      }
      writeFileSync(path, text, "utf8");
      result.taskFilesUpdated.push(path);
    } catch (cause) {
      result.errors.push(`${path}: ${message(cause)}`);
    }
  }

  if (existsSync(input.taskIndexPath)) {
    try {
      let indexText = readFileSync(input.taskIndexPath, "utf8");
      for (const outcome of input.outcomes) {
        if (outcome.status === "completed") indexText = tickIndexChecklist(indexText, outcome.label);
      }
      indexText = renderReportIntoIndex(indexText, report);
      writeFileSync(input.taskIndexPath, indexText, "utf8");
      result.indexUpdated = true;
      result.reportWritten = true;
    } catch (cause) {
      result.errors.push(`task index: ${message(cause)}`);
    }
  } else {
    result.errors.push(`task index not found: ${input.taskIndexPath}`);
  }

  return result;
}

/** The `status:` currently recorded in a task file, or null when it has none. */
function statusIn(text: string): TaskRunStatus | null {
  const match = /^status:\s*([a-z-]+)\s*$/m.exec(text.slice(0, 1200));
  const value = match?.[1];
  return value === "completed" || value === "blocked" || value === "skipped" ? value : null;
}

/** Record why a task did not complete, under a `## Blocked` heading (created on first failure). */
function appendBlockedReason(text: string, reason: string): string {
  const line = `- ${reason.trim()}`;
  if (text.includes("## Blocked")) {
    return text.includes(line) ? text : `${text.trimEnd()}\n${line}\n`;
  }
  return `${text.trimEnd()}\n\n## Blocked\n\n${line}\n`;
}

/**
 * Render (or replace) the closing Work Report section in the task index.
 *
 * Keyed by `## Work Report — <plan-id>-run`, so re-running the pipeline refreshes the same block
 * instead of stacking reports.
 */
export function renderReportIntoIndex(indexText: string, report: WorkReport): string {
  const heading = `## Work Report — ${report.planId}-run`;
  const completed = report.outcomes.filter((o) => o.status === "completed").length;
  const blocked = report.outcomes.filter((o) => o.status === "blocked").length;
  const skipped = report.outcomes.filter((o) => o.status === "skipped").length;

  const total = report.totalTasks ?? report.outcomes.length;

  const block = [
    heading,
    "",
    `- **Status:** ${blocked + skipped === 0 && completed === total ? "complete" : "incomplete"}`,
    `- **Timestamp:** ${report.at ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z")}`,
    `- **Tasks:** ${completed}/${total} completed, ${blocked} blocked, ${skipped} skipped`,
    `- **Interaction mode:** autopilot — no phase gates, no questions, no confirmation prompts`,
    `- **Phase artifacts:** not written (\`docs/plans/.work/**\` skipped by design); this report and the task files are the record`,
    ...(report.notes ?? []).map((n) => `- ${n}`),
    "",
  ].join("\n");

  const start = indexText.indexOf(heading);
  if (start === -1) return `${indexText.trimEnd()}\n\n${block}`;

  const rest = indexText.slice(start + heading.length);
  const nextHeading = rest.search(/\n##\s/);
  const end = nextHeading === -1 ? indexText.length : start + heading.length + nextHeading + 1;
  return `${indexText.slice(0, start)}${block}${indexText.slice(end)}`;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
