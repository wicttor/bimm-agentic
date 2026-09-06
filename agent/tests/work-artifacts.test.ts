// Acceptance-Criterion tests for the work skill's bookkeeping (Execute + Review phases).
//
// The pipeline runs `/work` in autopilot and explicitly skips its four phase dumps
// (`docs/plans/.work/.triage|.prepare|.execute|.review`). What survives is what a task artifact and
// its index are *required* to reflect: status, the acceptance-criterion checkbox, the checklist
// tick, and one closing work report. All of it forward-only, so a re-run resumes instead of
// rewinding.

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  renderReportIntoIndex,
  setFrontmatterStatus,
  recordWorkOutcomes,
  tickAcceptanceCriterion,
  tickIndexChecklist,
  type WorkOutcome,
} from "../src/work-artifacts.ts";
import { writePlanArtifacts, type PlanArtifacts } from "../src/plan-artifacts.ts";
import type { Task } from "../src/plan.ts";

const NOW = new Date("2026-09-06T10:00:00.000Z");

const PLAN: Task[] = [
  {
    file: "src/hooks/useCars.ts",
    purpose: "Fetch the car list.",
    dependsOn: [],
    exports: ["useCars"],
    acceptanceCriterion: "useCars returns the seeded cars",
    testFile: "src/hooks/useCars.test.ts",
  },
  {
    file: "src/App.tsx",
    purpose: "Wire the shell.",
    dependsOn: ["src/hooks/useCars.ts"],
    exports: ["App"],
  },
];

let artifactsDir: string;
let artifacts: PlanArtifacts;

/** Write the plan + task artifacts and return the paths the work pass will update. */
function planned() {
  const result = writePlanArtifacts({
    artifactsDir,
    spec: "# Cars\n\nList the cars.\n",
    tasks: PLAN,
    now: NOW,
  });
  if (!result.ok) throw new Error("plan artifacts should be written");
  return result.artifacts;
}

beforeEach(() => {
  artifactsDir = mkdtempSync(join(tmpdir(), "work-artifacts-test-"));
  artifacts = planned();
});

afterEach(() => {
  rmSync(artifactsDir, { recursive: true, force: true });
});

function outcome(index: number, status: WorkOutcome["status"], reason?: string): WorkOutcome {
  const artifact = artifacts.tasks[index]!;
  return {
    taskId: artifact.taskId,
    label: artifact.label,
    taskPath: artifact.path,
    status,
    reason,
  };
}

function taskText(index: number): string {
  return readFileSync(artifacts.tasks[index]!.path, "utf8");
}

function indexText(): string {
  return readFileSync(artifacts.taskIndexPath, "utf8");
}

describe("task-file frontmatter and checkbox helpers", () => {
  it("sets status inside the frontmatter block only", () => {
    const source = "---\nid: x\nstatus: not-started\n---\n\n# X\n\nstatus: keep me\n";
    const out = setFrontmatterStatus(source, "completed");

    expect(out).toContain("status: completed\n");
    expect(out).toContain("status: keep me"); // body text untouched
  });

  it("leaves a file with no frontmatter alone", () => {
    expect(setFrontmatterStatus("# No frontmatter\nstatus: not-started\n", "completed")).toBe(
      "# No frontmatter\nstatus: not-started\n",
    );
  });

  it("ticks only the box under `## Acceptance Criteria`", () => {
    const source = [
      "# T",
      "",
      "## Acceptance Criterion",
      "",
      "- [ ] not this one",
      "",
      "## Acceptance Criteria",
      "",
      "- [ ] the real one",
      "",
    ].join("\n");

    const out = tickAcceptanceCriterion(source);

    expect(out).toContain("- [ ] not this one");
    expect(out).toContain("- [x] the real one");
    // Idempotent: a second pass changes nothing.
    expect(tickAcceptanceCriterion(out)).toBe(out);
  });

  it("ticks the matching index line and nothing else", () => {
    const source = "- [ ] T01 — one\n- [ ] T02 — two\n- [x] T03 — three\n";
    const out = tickIndexChecklist(source, "T02");

    expect(out).toBe("- [ ] T01 — one\n- [x] T02 — two\n- [x] T03 — three\n");
  });
});

describe("recordWorkOutcomes", () => {
  it("marks a completed task in its file and in the index", () => {
    const record = recordWorkOutcomes({
      taskIndexPath: artifacts.taskIndexPath,
      outcomes: [outcome(0, "completed")],
      planId: artifacts.planId,
    });

    expect(record.errors).toEqual([]);
    expect(taskText(0)).toContain("status: completed");
    expect(taskText(0)).toMatch(/## Acceptance Criteria\n\n- \[x\] /);
    expect(indexText()).toMatch(/^- \[x\] T01/m);
    expect(indexText()).toMatch(/^- \[ \] T02/m);
  });

  it("records a blocked task with a reason, leaving its criterion unticked", () => {
    recordWorkOutcomes({
      taskIndexPath: artifacts.taskIndexPath,
      outcomes: [outcome(1, "blocked", "max_iterations: model stopped before writing src/App.tsx")],
      planId: artifacts.planId,
    });

    const text = taskText(1);
    expect(text).toContain("status: blocked");
    expect(text).toContain("## Blocked");
    expect(text).toContain("max_iterations: model stopped before writing src/App.tsx");
    expect(text).toContain("- [ ] ");
    expect(indexText()).toMatch(/^- \[ \] T02/m);
  });

  it("never re-opens a task already completed", () => {
    recordWorkOutcomes({
      taskIndexPath: artifacts.taskIndexPath,
      outcomes: [outcome(0, "completed")],
      planId: artifacts.planId,
    });
    const done = taskText(0);

    recordWorkOutcomes({
      taskIndexPath: artifacts.taskIndexPath,
      outcomes: [outcome(0, "blocked", "later failure")],
      planId: artifacts.planId,
    });

    expect(taskText(0)).toBe(done);
  });

  it("writes one work report block, refreshed in place on re-runs", () => {
    recordWorkOutcomes({
      taskIndexPath: artifacts.taskIndexPath,
      outcomes: [outcome(0, "completed")],
      planId: artifacts.planId,
      totalTasks: PLAN.length,
      notes: ["Generated app: generated-app"],
    });
    const once = indexText();
    expect(once).toContain(`## Work Report — ${artifacts.planId}-run`);
    expect(once).toContain("**Tasks:** 1/2 completed, 0 blocked, 0 skipped");
    expect(once).toContain("Generated app: generated-app");
    expect(once).toContain("**Interaction mode:** autopilot");

    recordWorkOutcomes({
      taskIndexPath: artifacts.taskIndexPath,
      outcomes: [outcome(0, "completed"), outcome(1, "completed")],
      planId: artifacts.planId,
      totalTasks: PLAN.length,
    });
    const twice = indexText();

    expect(twice.match(/## Work Report — /g)).toHaveLength(1);
    expect(twice).toContain("**Tasks:** 2/2 completed, 0 blocked, 0 skipped");
    expect(twice).toContain("**Status:** complete");
  });

  it("says plainly that the phase dumps were skipped, and creates none", () => {
    recordWorkOutcomes({
      taskIndexPath: artifacts.taskIndexPath,
      outcomes: [outcome(0, "completed"), outcome(1, "completed")],
      planId: artifacts.planId,
    });

    expect(indexText()).toContain("Phase artifacts:** not written");
    expect(existsSync(join(artifactsDir, "plans", ".work"))).toBe(false);
    expect(existsSync(join(artifactsDir, "plans", ".scope"))).toBe(false);
    expect(existsSync(join(artifactsDir, "plans", ".research"))).toBe(false);
    expect(existsSync(join(artifactsDir, "plans", ".design"))).toBe(false);
  });

  it("reports a missing task file and a missing index without throwing", () => {
    const record = recordWorkOutcomes({
      taskIndexPath: join(artifactsDir, "tasks", "nope", "index.md"),
      outcomes: [{ taskId: "x-T01", label: "T01", taskPath: join(artifactsDir, "gone.md"), status: "completed" }],
      planId: "nope",
    });

    expect(record.errors).toHaveLength(2);
    expect(record.errors[0]).toContain("task artifact not found");
    expect(record.errors[1]).toContain("task index not found");
    expect(record.indexUpdated).toBe(false);
  });

  it("keeps the task artifacts that were never executed untouched", () => {
    const before = taskText(1);

    recordWorkOutcomes({
      taskIndexPath: artifacts.taskIndexPath,
      outcomes: [outcome(0, "completed")],
      planId: artifacts.planId,
    });

    expect(taskText(1)).toBe(before);
  });
});

describe("renderReportIntoIndex", () => {
  it("replaces the report block without eating the sections after it", () => {
    const base = [
      "## 2026-09-06-001 — Cars",
      "",
      "- [ ] T01 — one",
      "",
      `## Work Report — ${"2026-09-06-001"}-run`,
      "",
      "old line",
      "",
      "## Something After",
      "",
      "kept",
      "",
    ].join("\n");

    const out = renderReportIntoIndex(base, {
      planId: "2026-09-06-001",
      outcomes: [{ taskId: "t", label: "T01", taskPath: "p", status: "completed" }],
      at: "2026-09-06T11:00:00Z",
    });

    expect(out).toContain("- **Timestamp:** 2026-09-06T11:00:00Z");
    expect(out).not.toContain("old line");
    expect(out).toContain("## Something After");
    expect(out).toContain("kept");
    expect(out.match(/## Work Report/g)).toHaveLength(1);
  });
});
