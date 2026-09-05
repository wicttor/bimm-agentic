// AC tests for the skill-injection boundary (task 2026-09-05-007-T01).
//
// `buildSkillBlock` inlines a skill's SKILL.md VERBATIM as the procedure an LLM call has to follow.
// The `work` skill was written for a human orchestrator sitting in a repository, so its body orders
// actions the per-task executor cannot perform: a Pre-Flight Check over `docs/tasks/` with `mkdir -p`
// self-healing, Index Registration into `docs/tasks/<plan-id>/index.md`, and a `git` branch step. The
// executor's tools are confined to the generated app's output directory (see `agent/src/tools/fs.ts`)
// and `docs` is excluded from the scaffold (`DEFAULT_EXCLUDE` in `agent/src/scaffold.ts`), so each of
// those instructions ends in a refusal the sandbox is obliged to return — observed in a run log as
// `not_found` on `list_files("docs/tasks")`.
//
// The contract under test: the block's OWN binding-override section voids those sections by name, with
// the confinement reason stated, and no longer lists a `docs/` path among the call's durable outputs.
// Assertions are scoped to the override section (`overridesSection`), never to the whole block, because
// the verbatim body legitimately mentions those headings — naming them in the body is the problem, not
// the proof. The `plan` skill is asserted UNCHANGED by the same tests: it has no filesystem to be
// confused about (its call exposes only the plan-writing tool), so extending the rule there would be a
// behaviour change with no failure behind it.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildSkillBlock } from "../src/skill-prompts.ts";

/** The parts of a skill body that a human orchestrator performs and a sandboxed call must not. */
const HARNESS_OWNED_HEADINGS = [
  "Pre-Flight Check",
  "Self-Healing",
  "Index Registration",
  "Work Report",
  "Work Branch",
] as const;

/** Rendered markdown for a fake `work` skill carrying the same sections as the real one. */
const WORK_SKILL_BODY = `---
name: Work
description: Executes a task list test-first.
---

# Work

## Pre-Flight Check

Before starting, verify \`docs/tasks/\` exists.

**Self-Healing:** if it is missing, create it with \`mkdir -p\`.

## Work Branch

Create or check out \`work/<slug>\` with \`git checkout -b\`.

## Index Registration

Tick \`docs/tasks/<plan-id>/index.md\` as tasks complete and append a \`## Work Report\` block.
`;

const PLAN_SKILL_BODY = `---
name: Plan
description: Turns a goal into a plan and its task list.
---

# Plan

Slice the work into tasks, one Acceptance Criterion each.
`;

let skillsDir: string;

beforeEach(() => {
  skillsDir = mkdtempSync(join(tmpdir(), "skill-prompts-boundary-"));
  mkdirSync(join(skillsDir, "work", "modules"), { recursive: true });
  mkdirSync(join(skillsDir, "plan"), { recursive: true });
  writeFileSync(join(skillsDir, "work", "SKILL.md"), WORK_SKILL_BODY, "utf8");
  writeFileSync(join(skillsDir, "work", "modules", "execute.md"), "Red, then Green, then Refactor.\n", "utf8");
  writeFileSync(join(skillsDir, "plan", "SKILL.md"), PLAN_SKILL_BODY, "utf8");
});

afterEach(() => {
  rmSync(skillsDir, { recursive: true, force: true });
});

/** Everything the block says BEFORE the verbatim skill body: the overrides are the only binding part. */
function overridesSection(block: string): string {
  const start = block.indexOf("### Binding overrides for this run");
  const end = block.indexOf("### Skill body (verbatim)");
  expect(start, "block renders a binding-overrides section").toBeGreaterThan(-1);
  expect(end, "block renders the verbatim skill body after the overrides").toBeGreaterThan(start);
  return block.slice(start, end);
}

/** The single rendered line listing what this call is allowed to produce. */
function durableOutputsLine(block: string): string {
  const line = block.split("\n").find((entry) => entry.includes("The durable outputs of this run are:"));
  expect(line, "block states this run's durable outputs").toBeDefined();
  return line!;
}

describe("buildSkillBlock — work skill sandbox boundary", () => {
  it("renders the work skill at all, so a Red failure below is content and not plumbing", () => {
    const block = buildSkillBlock({ skillsDir, skillId: "work", modules: ["execute"] });
    expect(block).toContain("Workflow skill: `work`");
    expect(block).toContain("Phase module: execute");
    expect(overridesSection(block)).not.toBe("");
  });

  it("voids every harness-owned section of the work skill inside the binding overrides", () => {
    const overrides = overridesSection(buildSkillBlock({ skillsDir, skillId: "work", modules: ["execute"] }));
    for (const heading of HARNESS_OWNED_HEADINGS) {
      expect(overrides, `overrides void "${heading}"`).toContain(heading);
    }
  });

  it("names the harness as the owner of those sections, once, in the overrides", () => {
    const overrides = overridesSection(buildSkillBlock({ skillsDir, skillId: "work", modules: ["execute"] }));
    expect(overrides).toContain("harness performs");
    expect(overrides.match(/harness performs/g)).toHaveLength(1);
  });

  it("states the confinement reason the refusals come from", () => {
    const overrides = overridesSection(buildSkillBlock({ skillsDir, skillId: "work", modules: ["execute"] }));
    expect(overrides).toContain("output directory");
    expect(overrides).toContain("not_found");
    expect(overrides).toContain("path_escape");
  });

  it("tells the model not to self-heal the missing docs tree inside the sandbox", () => {
    const overrides = overridesSection(buildSkillBlock({ skillsDir, skillId: "work", modules: ["execute"] }));
    expect(overrides).toContain("mkdir");
    expect(overrides).toContain("git");
  });

  it("lists no path under docs/ among the work call's durable outputs", () => {
    const line = durableOutputsLine(buildSkillBlock({ skillsDir, skillId: "work", modules: ["execute"] }));
    expect(line).not.toContain("docs/");
    expect(line).toContain("the files named by the current task");
  });
});

describe("buildSkillBlock — plan skill is left alone", () => {
  it("does not extend the harness-owned boundary to the plan skill", () => {
    const block = buildSkillBlock({ skillsDir, skillId: "plan" });
    expect(block).toContain("Workflow skill: `plan`");
    const overrides = overridesSection(block);
    expect(overrides).not.toContain("harness performs");
    expect(overrides).not.toContain("Pre-Flight Check");
  });

  it("keeps the plan skill's docs/ durable outputs, which the harness writes for it", () => {
    const line = durableOutputsLine(buildSkillBlock({ skillsDir, skillId: "plan" }));
    expect(line).toContain("docs/plans/");
    expect(line).toContain("docs/tasks/");
  });
});
