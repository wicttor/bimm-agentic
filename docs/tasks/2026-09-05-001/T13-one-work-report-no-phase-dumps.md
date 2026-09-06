---
id: 2026-09-05-001-T13
title: "Close the run with one work report and no phase dumps"
plan-id: 2026-09-05-001
unit: U6
tier: deep
status: completed
priority: P1
dependencies: [2026-09-05-001-T12]
files:
  create: []
  modify:
    - agent/src/work-artifacts.ts
    - agent/tests/work-artifacts.test.ts
  test:
    - agent/tests/work-artifacts.test.ts
estimated-effort: "1 hour"
timestamp: 2026-09-05T16:40:00Z
---

# Close the run with one work report and no phase dumps

## Goal

The user asked for the final result, not a paper trail: one report block is the record, and the four
interactive phase dumps are skipped by design.

## Acceptance Criterion

The task index carries exactly one `## Work Report — <plan-id>-run` block, replaced in place on a re-run and never eating the sections after it, stating that the `.work/` phase artifacts were skipped — and after a full run no `docs/plans/.work/`, `.scope/`, `.research/` or `.design/` directory exists

## Steps

1. **Red — Write the failing test:** extend `agent/tests/work-artifacts.test.ts`: two passes produce one `## Work Report` heading with updated counts and `**Status:** complete` only when every planned task finished; a replaced block leaves a following `## Something After` section intact; `totalTasks` makes a partial run read `1/2 completed` and `incomplete`; and the four dot-directories do not exist. Confirm failures.
2. **Green — Implement:** implement `renderReportIntoIndex` with heading-keyed replacement and the `Phase artifacts:** not written` line.
3. **Refactor:** derive the completed denominator from `totalTasks` when the caller knows it, so a partial pass never reports `1/1`.

## Test Scenarios

- Single block: two passes -> one `## Work Report — <id>-run`
- Contained replace: sections after the block survive
- Partial run: `totalTasks: 2`, one completed -> `1/2 completed`, status `incomplete`
- No dumps: `.work`, `.scope`, `.research`, `.design` absent

## Acceptance Criteria

- [x] The task index carries exactly one `## Work Report

## Dependencies

- 2026-09-05-001-T12: the report sits beside the ticks that task owns

## Notes

- `Timestamp` in the block comes from `WorkReport.at` so a trace-derived time is recorded rather than a wall-clock re-read.
