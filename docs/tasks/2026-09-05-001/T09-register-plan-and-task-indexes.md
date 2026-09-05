---
id: 2026-09-05-001-T09
title: "Register the plan and its task checklist idempotently"
plan-id: 2026-09-05-001
unit: U5
tier: deep
status: completed
priority: P1
dependencies: [2026-09-05-001-T08]
files:
  create: []
  modify:
    - agent/src/plan-artifacts.ts
    - agent/tests/plan-artifacts.test.ts
  test:
    - agent/tests/plan-artifacts.test.ts
estimated-effort: "1 hour 30 minutes"
timestamp: 2026-09-05T16:40:00Z
---

# Register the plan and its task checklist idempotently

## Goal

Two writers share these indexes — interactive `/plan` sessions and the CLI — so registration has to
be insert-or-skip by id, and an id must never land on a folder that already exists.

## Acceptance Criterion

`docs/plans/index.md` and `docs/tasks/<plan-id>/index.md` are created or updated without duplicating an entry, and `allocatePlanId` counts existing plan files *and* task folders while ignoring the dot-directories

## Steps

1. **Red — Write the failing test:** extend `agent/tests/plan-artifacts.test.ts`: registering the same plan twice leaves one table row; a pre-existing hand-written index keeps its rows and gains the new one inside the table; ids `001` (plan file) and `002` (task folder) produce `003`; and a `.work/…-007-execute.md` file does not consume an id. Confirm failures.
2. **Green — Implement:** implement `registerPlanInIndex`, `writeTaskIndex` and `allocatePlanId` with the counting rule above.
3. **Refactor:** share one `listNames` helper between the two counters so a directory that cannot be read yields `[]` rather than throwing mid-run.

## Test Scenarios

- Idempotent row: second registration -> still one `| [id]` line
- Preserve hand-written index: old row survives, new row lands inside the table
- Allocation: plan file `001` + task folder `002` -> `003`
- Dot dirs ignored: `.work/2026-09-06-007-execute.md` -> next id `001`

## Acceptance Criteria

- [x] `docs/plans/index.md` and `docs/tasks/<plan-id>/index.md` are created or updated without duplicating an entry, and `allocatePlanId` counts existing plan files *and* task folders while ignoring the dot-directories

## Dependencies

- 2026-09-05-001-T08: the checklist rows name the task files that must already exist

## Notes

- Counting `docs/tasks/` folders is a deliberate extension of `references/id-generation.md`: the work skill allocates an ad-hoc `work-id` by counting exactly those, so an id free of both cannot collide.
