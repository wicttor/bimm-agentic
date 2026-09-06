---
id: 2026-09-05-001-T08
title: "Write one task artifact per planned file"
plan-id: 2026-09-05-001
unit: U5
tier: deep
status: completed
priority: P1
dependencies: [2026-09-05-001-T07]
files:
  create: []
  modify:
    - agent/src/plan-artifacts.ts
    - agent/tests/plan-artifacts.test.ts
  test:
    - agent/tests/plan-artifacts.test.ts
estimated-effort: "2 hours"
timestamp: 2026-09-05T16:40:00Z
---

# Write one task artifact per planned file

## Goal

The task file is the handoff contract with the work skill: self-contained, test-first, and
addressable as `/work <plan-id>-T07`.

## Acceptance Criterion

Exactly one task artifact per planned file lands at `docs/tasks/<plan-id>/T<NN>-<slug>.md`, each carrying one Acceptance Criterion, exactly one `files.test` entry, three Red → Green → Refactor steps, `status: not-started`, and `dependencies` resolved to sibling `<plan-id>-T<NN>` ids

## Steps

1. **Red — Write the failing test:** extend `agent/tests/plan-artifacts.test.ts`: three tasks produce ids `T01`–`T03`, the second file's `dependencies` list the first two ids, `files.test` holds exactly one path, a task that owns a test file gets no sibling test, and the body has `## Acceptance Criterion`, `## Steps`, one `- [ ]` box. Confirm failures.
2. **Green — Implement:** implement `renderTaskArtifact` plus `acceptanceCriterionFor`, `testFileFor`, `stepsFor` and `taskLabel`, deriving anything the planner left out.
3. **Refactor:** resolve dependency ids through the `labelByFile` map built once by the writer, so no placeholder text survives into a saved artifact.

## Test Scenarios

- Ids: `[planId-T01, planId-T02, planId-T03]` in plan order
- Deps: third task's frontmatter -> `[<plan-id>-T01, <plan-id>-T02]`
- One test: `files.test` has exactly one entry; a test-file task names itself
- Derived criterion: absent AC -> restated from purpose, and the risk table counts it

## Acceptance Criteria

- [x] Exactly one task artifact per planned file lands at `docs/tasks/<plan-id>/T<NN>-<slug>.md`, each carrying one Acceptance Criterion, exactly one `files.test` entry, three Red → Green → Refactor steps, `status: not-started`, and `dependencies` resolved to sibling `<plan-id>-T<NN>` ids

## Dependencies

- 2026-09-05-001-T07: artifacts are rendered inside the same writer that emits the plan

## Notes

- `status` starts `not-started` and T12's bookkeeping is the only thing allowed to move it forward.
