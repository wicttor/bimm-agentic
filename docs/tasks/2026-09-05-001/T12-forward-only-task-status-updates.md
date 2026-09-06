---
id: 2026-09-05-001-T12
title: "Record task outcomes forward-only in the artifacts"
plan-id: 2026-09-05-001
unit: U6
tier: deep
status: completed
priority: P1
dependencies: [2026-09-05-001-T08]
files:
  create:
    - agent/src/work-artifacts.ts
  modify:
    - agent/tests/work-artifacts.test.ts
  test:
    - agent/tests/work-artifacts.test.ts
estimated-effort: "1 hour 30 minutes"
timestamp: 2026-09-05T16:40:00Z
---

# Record task outcomes forward-only in the artifacts

## Goal

Re-running the pipeline or `/work` must resume from the first unfinished task rather than rewind
evidence, which is the Work skill's idempotency rule.

## Acceptance Criterion

`recordWorkOutcomes` flips each task file's frontmatter `status`, ticks its `## Acceptance Criteria` box only on completion, writes a `## Blocked` reason otherwise, ticks the matching index checklist line, and never re-opens a task already recorded as `completed`

## Steps

1. **Red — Write the failing test:** create `agent/tests/work-artifacts.test.ts`: completed -> status + both boxes ticked; blocked -> `status: blocked`, reason under `## Blocked`, criterion box still `- [ ]`; completed-then-blocked -> file byte-identical; a task with no outcome in the pass is untouched. Confirm the failures.
2. **Green — Implement:** implement `setFrontmatterStatus`, `tickAcceptanceCriterion`, `tickIndexChecklist` and `recordWorkOutcomes`, scoping the status edit to the frontmatter block and the tick to the `## Acceptance Criteria` section.
3. **Refactor:** report a missing task file or index in `result.errors` instead of throwing — a bookkeeping failure must never lose the generated app.

## Test Scenarios

- Completed: frontmatter `status: completed`, one `- [x]` under Acceptance Criteria, index `- [x] T01`
- Blocked: `## Blocked` reason recorded, criterion still `- [ ]`
- No rewind: completed then blocked -> identical bytes
- Missing paths: two named errors, no exception

## Acceptance Criteria

- [x] `recordWorkOutcomes` flips each task file's frontmatter `status`, ticks its `## Acceptance Criteria` box only on completion, writes a `## Blocked` reason otherwise, ticks the matching index checklist line, and never re-opens a task already recorded as `completed`

## Dependencies

- 2026-09-05-001-T08: it edits the task artifacts T08 defines

## Notes

- `- [ ]` → `- [x]` is applied to the first box inside `## Acceptance Criteria` only: exactly one box exists per task by construction (T08).
