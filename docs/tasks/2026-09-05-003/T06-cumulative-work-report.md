---
id: 2026-09-05-003-T06
title: "Make the work report cumulative across sessions"
plan-id: 2026-09-05-003
unit: U6
tier: deep
status: not-started
priority: P1
dependencies: []
files:
  create: []
  modify:
    - agent/src/work-artifacts.ts
    - agent/tests/work-artifacts.test.ts
  test:
    - agent/tests/work-artifacts.test.ts
estimated-effort: "1 hour"
timestamp: 2026-09-05T18:45:00Z
---

# Make the work report cumulative across sessions

## Goal

One closing report per plan is the design; one **session** per plan is what the current code writes. In
a split pipeline, a report built from "this call's outcomes" reads `1/1 complete` after the first task
of a fifteen-task plan — which is worse than no report, because it is the record a human trusts.

## Acceptance Criterion

After any number of sessions the index carries exactly one `## Work Report — <plan-id>-run` block whose completed count is taken from the whole checked list (`N/total`), whose `Status:` reads `complete` only when every line is checked, and which is replaced in place rather than stacked

## Steps

1. **Red — Write the failing test:** extend `agent/tests/work-artifacts.test.ts` with a `cumulative report across sessions` block: three calls of one outcome each against the same index → one block reading `3/5 completed, 0 blocked, 0 skipped` with `Status: incomplete`, and after a fifth → `5/5`, `Status: complete`; assert the checked-line count — not the outcomes passed — is what produced the numbers; assert no section following the block was eaten and no second block exists. Confirm failures.
2. **Green — Implement:** in `renderReportIntoIndex`, count completions from the index's own `- [x] T<NN>` lines (`total` from all checklist lines, falling back to `totalTasks ?? outcomes.length` when the index has none) and derive `Status:` from "every line checked"; keep blocked/skipped counted from the outcomes passed, since the index cannot show them.
3. **Refactor:** add the note line naming the session (`<plan-id>-T<NN>`) and the commit sha the caller supplies in `notes`, so one block answers "what did the last session do" without losing "where is the plan overall".

## Test Scenarios

- One outcome of five → `1/5 completed`, `Status: incomplete`
- Third session → `3/5`, one block only
- Last session → `5/5`, `Status: complete`
- Re-run after completion → block replaced in place, following sections intact
- Index with no checklist (ad-hoc) → falls back to `totalTasks`, then to the outcome count

## Acceptance Criteria

- [ ] After any number of sessions the index carries exactly one `## Work Report — <plan-id>-run` block whose completed count is taken from the whole checked list (`N/total`), whose `Status:` reads `complete` only when every line is checked, and which is replaced in place rather than stacked

## Dependencies

- None

## Notes

- Forward-only stays untouched: `recordWorkOutcomes` still never re-opens a `completed` task and never unticks a box. This task changes how the report **counts**, not how it writes.
- Ties to T03 by name only, not by code: both read the checklist, and the count here must come from the same `- [x]` lines the queue trusts.
