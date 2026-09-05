// Acceptance-Criterion tests for the plan skill's durable output (Generate + Tasks phases).
//
// The pipeline runs `/plan` in autopilot with the Tasks phase always on, so one successful planner
// call must leave behind: a plan document registered in the plan index, and one task artifact per
// planned file registered in a task index the work skill can read. Everything asserted here is
// deterministic rendering — no provider, no network, no LLM in the loop.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  allocatePlanId,
  deriveOverview,
  derivePlanTitle,
  dependencyDepth,
  isoDate,
  kebabCase,
  renderTaskArtifact,
  selectTier,
  stepsFor,
  taskLabel,
  acceptanceCriterionFor,
  testFileFor,
  writePlanArtifacts,
} from "../src/plan-artifacts.ts";
import type { Task } from "../src/plan.ts";

const NOW = new Date("2026-09-06T10:00:00.000Z");

const SPEC = `# Car Inventory Manager

Display a list of cars from a GraphQL endpoint and let a user add one.

## Behaviour

- Responsive images per breakpoint.
`;

const PLAN: Task[] = [
  {
    file: "src/hooks/useCars.ts",
    purpose: "Fetch the car list through Apollo.",
    dependsOn: [],
    exports: ["useCars"],
    title: "Fetch cars with a typed Apollo hook",
    unit: "U1",
    acceptanceCriterion: "useCars returns the seeded cars and exposes loading/error state",
    testFile: "src/hooks/useCars.test.ts",
    steps: ["RED: assert useCars returns 5 seeded cars", "GREEN: write the hook", "REFACTOR: extract the query"],
    priority: "P0",
    effort: "2 hours",
  },
  {
    file: "src/components/CarCard.tsx",
    purpose: "Render one car as a MUI card with the right image.",
    dependsOn: ["src/hooks/useCars.ts"],
    exports: ["CarCard"],
  },
  {
    file: "src/App.tsx",
    purpose: "Wire the list and the add form together.",
    dependsOn: ["src/hooks/useCars.ts", "src/components/CarCard.tsx"],
    exports: ["App"],
  },
];

let artifactsDir: string;

beforeEach(() => {
  artifactsDir = mkdtempSync(join(tmpdir(), "plan-artifacts-test-"));
});

afterEach(() => {
  rmSync(artifactsDir, { recursive: true, force: true });
});

describe("plan artifact naming and ids", () => {
  it("kebab-cases a title with stopwords dropped", () => {
    expect(kebabCase("Build a CLI Agentic Code Generator")).toBe("build-cli-agentic-code-generator");
    expect(kebabCase("  ")).toBe("unnamed");
  });

  it("titles the plan from the spec heading and falls back to the spec path", () => {
    expect(derivePlanTitle(SPEC)).toBe("Car Inventory Manager");
    expect(derivePlanTitle("no heading here", "specs/book-inventory.md")).toBe("book inventory");
    expect(derivePlanTitle("no heading here")).toBe("Generated implementation plan");
  });

  it("takes the overview from the first prose paragraph, skipping headings and lists", () => {
    expect(deriveOverview(SPEC)).toBe("Display a list of cars from a GraphQL endpoint and let a user add one.");
  });

  it("allocates the next plan-id for today, counting what is already on disk", () => {
    mkdirSync(join(artifactsDir, "plans"), { recursive: true });

    expect(allocatePlanId(artifactsDir, NOW)).toBe("2026-09-06-001");

    writeFileSync(join(artifactsDir, "plans", "2026-09-06-001-first.md"), "x", "utf8");
    mkdirSync(join(artifactsDir, "tasks", "2026-09-06-002"), { recursive: true });

    // Highest existing counter wins, so a folder created by /plan cannot be collided with.
    expect(allocatePlanId(artifactsDir, NOW)).toBe("2026-09-06-003");
  });

  it("ignores the dot-directories that hold phase dumps when counting", () => {
    mkdirSync(join(artifactsDir, "plans", ".work"), { recursive: true });
    writeFileSync(join(artifactsDir, "plans", ".work", "2026-09-06-007-execute.md"), "x", "utf8");

    expect(allocatePlanId(artifactsDir, NOW)).toBe("2026-09-06-001");
  });

  it("formats dates in UTC", () => {
    expect(isoDate(new Date("2026-09-06T23:30:00.000Z"))).toBe("2026-09-06");
    expect(taskLabel(0)).toBe("T01");
    expect(taskLabel(11)).toBe("T12");
  });
});

describe("derivation from a plan entry", () => {
  it("uses the planner's own criterion and test file when given", () => {
    expect(acceptanceCriterionFor(PLAN[0]!)).toBe("useCars returns the seeded cars and exposes loading/error state");
    expect(testFileFor(PLAN[0]!)).toBe("src/hooks/useCars.test.ts");
  });

  it("restates a criterion and a sibling test file when the planner omitted them", () => {
    const derived = acceptanceCriterionFor(PLAN[1]!);
    expect(derived).toContain("src/components/CarCard.tsx");
    expect(derived).toContain("verified by its own test");
    expect(testFileFor(PLAN[1]!)).toBe("src/components/CarCard.test.tsx");
  });

  it("does not invent a second test for a task that owns the test file", () => {
    const testTask: Task = {
      file: "src/__tests__/App.test.tsx",
      purpose: "Cover the app shell.",
      dependsOn: [],
      exports: [],
    };
    expect(testFileFor(testTask)).toBe("src/__tests__/App.test.tsx");
  });

  it("keeps the three steps in Red -> Green -> Refactor order, derived when absent", () => {
    expect(stepsFor(PLAN[0]!).map((s) => s.slice(0, 5))).toEqual(["RED: ", "GREEN", "REFAC"]);
    const derived = stepsFor(PLAN[1]!);
    expect(derived[0]).toMatch(/Red — Write the failing test/);
    expect(derived[0]).toContain("CarCard.test.tsx");
    expect(derived[1]).toContain("CarCard.tsx");
    expect(derived[2]).toMatch(/Refactor/);
  });

  it("sizes the tier from plan shape, with a risk floor that never downgrades", () => {
    expect(selectTier([PLAN[0]!]).tier).toBe("fast");
    expect(dependencyDepth(PLAN)).toBe(3);

    const chain: Task[] = [];
    for (let i = 0; i < 12; i += 1) {
      chain.push({
        file: `src/f${i}.ts`,
        purpose: `f${i}`,
        dependsOn: i === 0 ? [] : [`src/f${i - 1}.ts`],
        exports: [],
      });
    }
    const deep = selectTier(chain);
    expect(deep.tier).toBe("deep");
    expect(deep.risk).toBe("High");
    expect(deep.complexity).toBe("HIGH");
    expect(selectTier(new Array(20).fill(0).map((_, i) => ({ ...chain[0]!, file: `src/x${i}.ts` })))).toEqual({
      tier: "deep",
      complexity: "VERY_HIGH",
      risk: "High",
    });
  });
});

describe("writePlanArtifacts — the plan document", () => {
  it("writes a plan file whose frontmatter passes the work skill's field list", () => {
    const result = writePlanArtifacts({ artifactsDir, spec: SPEC, tasks: PLAN, specPath: "specs/car.md", now: NOW });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("artifacts should be written");

    const text = readFileSync(result.artifacts.planPath, "utf8");

    for (const key of [
      "plan-id:",
      "type: plan",
      "title:",
      "status: complete",
      "tier:",
      "tier_recommended:",
      "complexity:",
      "risk:",
      "scope-id:",
      "research-id:",
      "design-id:",
      "interactionMode: autopilot",
      "created:",
      "updated:",
      "version:",
    ]) {
      expect(text).toContain(key);
    }

    expect(text).toContain(`plan-id: ${result.artifacts.planId}`);
    expect(result.artifacts.planId).toBe("2026-09-06-001");
    expect(relative(artifactsDir, result.artifacts.planPath).split("\\").join("/")).toBe(
      "plans/2026-09-06-001-car-inventory-manager.md",
    );
  });

  it("records that Scope/Research/Design ran inline and wrote nothing", () => {
    const result = writePlanArtifacts({ artifactsDir, spec: SPEC, tasks: PLAN, now: NOW });
    if (!result.ok) throw new Error("artifacts should be written");

    const text = readFileSync(result.artifacts.planPath, "utf8");

    expect(text).toContain("phases-inlined: scope, research, design");
    expect(text).toContain("no `.scope/`, `.research/`, `.design/` or `.work/` dumps");
    expect(existsSync(join(artifactsDir, "plans", ".scope"))).toBe(false);
    expect(existsSync(join(artifactsDir, "plans", ".work"))).toBe(false);
  });

  it("carries the required sections, including a design rendered from the task graph", () => {
    const result = writePlanArtifacts({ artifactsDir, spec: SPEC, tasks: PLAN, now: NOW });
    if (!result.ok) throw new Error("artifacts should be written");

    const text = readFileSync(result.artifacts.planPath, "utf8");

    expect(text).toContain("## Overview");
    expect(text).toContain("## High-Level Technical Design");
    expect(text).toContain("## Implementation Units (Phased)");
    expect(text).toContain("## Risk Analysis & Mitigation");
    expect(text).toContain("## Related Learnings");
    expect(text).toContain("## Learning Gaps");
    // The mermaid graph is derived from dependsOn, so it cannot disagree with the task list.
    expect(text).toContain("```mermaid");
    expect(text).toContain("T01 --> T02");
    expect(text).toContain("T02 --> T03");
    expect(text).toContain("3 file-level task(s) · longest dependency chain 3");
  });

  it("groups units into phases by dependency depth", () => {
    const result = writePlanArtifacts({ artifactsDir, spec: SPEC, tasks: PLAN, now: NOW });
    if (!result.ok) throw new Error("artifacts should be written");

    const text = readFileSync(result.artifacts.planPath, "utf8");

    expect(text).toContain("### Phase 1: Foundation");
    expect(text).toContain("### Phase 2: Integration");
    expect(text).toContain("### Phase 3: Rollout");
    expect(text).toContain("- U1. **Fetch cars with a typed Apollo hook**");
  });

  it("flags criteria the harness had to restate, instead of hiding it", () => {
    const result = writePlanArtifacts({ artifactsDir, spec: SPEC, tasks: PLAN, now: NOW });
    if (!result.ok) throw new Error("artifacts should be written");

    const text = readFileSync(result.artifacts.planPath, "utf8");

    expect(text).toContain("2 task(s) planned without an explicit Acceptance Criterion");
    expect(text).toContain("2 task(s) named no test file");
  });

  it("refuses to render an empty plan", () => {
    const result = writePlanArtifacts({ artifactsDir, spec: SPEC, tasks: [], now: NOW });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error).toContain("empty task list");
  });
});

describe("writePlanArtifacts — task artifacts and indexes", () => {
  const written = async () => {
    const result = writePlanArtifacts({ artifactsDir, spec: SPEC, tasks: PLAN, now: NOW });
    if (!result.ok) throw new Error("artifacts should be written");
    return result.artifacts;
  };

  it("writes one task file per planned file, named T<NN>-<slug>.md", async () => {
    const artifacts = await written();

    expect(artifacts.tasks.map((t) => t.taskId)).toEqual([
      "2026-09-06-001-T01",
      "2026-09-06-001-T02",
      "2026-09-06-001-T03",
    ]);
    expect(artifacts.tasks[1]!.path).toMatch(/\/T02-[^/]+\.md$/);
    expect(relative(artifactsDir, artifacts.tasks[1]!.path).split("\\").join("/")).toMatch(
      /^tasks\/2026-09-06-001\/T02-.*\.md$/,
    );
    expect(existsSync(artifacts.tasks[2]!.path)).toBe(true);
  });

  it("gives each task the fields the work skill validates at its Step 0 gate", async () => {
    const artifacts = await written();
    const text = readFileSync(artifacts.tasks[0]!.path, "utf8");

    for (const key of [
      "id: 2026-09-06-001-T01",
      "title:",
      "plan-id: 2026-09-06-001",
      "unit: U1",
      "tier:",
      "status: not-started",
      "priority: P0",
      "dependencies: []",
      "estimated-effort:",
      "timestamp: 2026-09-06T10:00:00Z",
    ]) {
      expect(text).toContain(key);
    }

    expect(text).toContain("## Acceptance Criterion");
    expect(text).toContain("## Steps");
    expect(text).toContain("## Test Scenarios");
    expect(text).toContain("- [ ] ");
    expect(text).toContain("files:");
    expect(text).toContain("  test:\n    - src/hooks/useCars.test.ts");
  });

  it("resolves dependencies to sibling task ids, not file paths", async () => {
    const artifacts = await written();
    const text = readFileSync(artifacts.tasks[2]!.path, "utf8");

    expect(text).toContain("dependencies: [2026-09-06-001-T01, 2026-09-06-001-T02]");
  });

  it("states that no `.work/` phase artifact belongs to the task", async () => {
    const artifacts = await written();
    const text = readFileSync(artifacts.tasks[1]!.path, "utf8");

    expect(text).toContain("no `.work/` phase artifacts are written for it");
  });

  it("creates the task index with an unticked checklist the work skill can drive", async () => {
    const artifacts = await written();
    const text = readFileSync(artifacts.taskIndexPath, "utf8");

    expect(text).toContain(`## ${artifacts.planId} — Car Inventory Manager`);
    expect(text.match(/^- \[ \] T\d\d/gm)).toHaveLength(3);
    expect(text).toContain("- [ ] T02 —");
    expect(text).toContain("/work " + artifacts.planId);
  });

  it("registers the plan in plans/index.md exactly once across re-runs", async () => {
    await written();
    const first = readFileSync(join(artifactsDir, "plans", "index.md"), "utf8");
    expect(first.split("\n").filter((line) => line.startsWith("| [2026-09-06-001]")).length).toBe(1);

    // A second plan for the same date gets a new id and appends a second row.
    const second = writePlanArtifacts({ artifactsDir, spec: SPEC, tasks: PLAN, now: NOW });
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error("artifacts should be written");
    expect(second.artifacts.planId).toBe("2026-09-06-002");

    const after = readFileSync(join(artifactsDir, "plans", "index.md"), "utf8");
    expect(after).toContain("[2026-09-06-001]");
    expect(after).toContain("[2026-09-06-002]");
  });

  it("preserves an existing plan index written by a /plan session", async () => {
    const plansDir = join(artifactsDir, "plans");
    mkdirSync(plansDir, { recursive: true });
    writeFileSync(
      join(plansDir, "index.md"),
      "| Plan ID | Title | tier | tier_recommended | complexity | risk | status |\n| --- | --- | --- | --- | --- | --- | --- |\n| [2026-09-04-001](old.md) | Old | deep | deep | VERY_HIGH | High | ready |\n",
      "utf8",
    );

    writePlanArtifacts({ artifactsDir, spec: SPEC, tasks: PLAN, now: NOW });

    const text = readFileSync(join(plansDir, "index.md"), "utf8");
    expect(text).toContain("[2026-09-04-001]");
    expect(text).toContain("[2026-09-06-001]");
    // New row lands inside the table, not after it.
    expect(text.indexOf("[2026-09-06-001]")).toBeGreaterThan(text.indexOf("[2026-09-04-001]"));
  });

  it("renders a standalone task artifact without sibling labels as unresolved dependencies", () => {
    const text = renderTaskArtifact({ planId: "2026-09-06-009", task: PLAN[1]!, index: 1, taskTitle: "Card", now: NOW });
    expect(text).toContain("dependencies: [src/hooks/useCars.ts (not a planned task)]");
  });
});
