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

## Implementation

### Algorithm: Cumulative Count and In-Place Replacement

The `renderReportIntoIndex` function must:

1. **Count completions from the index's checklist** (not from outcomes passed):
   - Parse all `- [x]` and `- [ ]` lines in the index markdown
   - Count checked lines (`- [x]`) as `completed`
   - Count total checklist lines as `total`
   - If no checklist exists, fall back to `totalTasks ?? outcomes.length`

2. **Derive Status from completeness**:
   - `Status: complete` only when `completed === total`
   - Otherwise `Status: incomplete`
   - Count `blocked` and `skipped` from outcomes (since index cannot show them)

3. **Find and replace in place**:
   - Search for existing `## Work Report — <plan-id>-run` block
   - Extract the entire block (header through next `##` or end of file)
   - Replace with new block containing current session context
   - If no block exists, append before any following sections

### Example: Partial vs. Cumulative Replacement

**Initial state (Session 1):** 5-task plan, task T01 completed
```markdown
- [x] T01-task-one
- [ ] T02-task-two
- [ ] T03-task-three
- [ ] T04-task-four
- [ ] T05-task-five

## Work Report — 2026-09-05-003-run

**Session:** 2026-09-05-003-T01 (abc1234)
**Completed:** 1/5
**Blocked:** 0
**Skipped:** 0
**Status:** incomplete

Last session checked off T01.
```

**After Session 2:** Tasks T02 and T03 now completed
```markdown
- [x] T01-task-one
- [x] T02-task-two
- [x] T03-task-three
- [ ] T04-task-four
- [ ] T05-task-five

## Work Report — 2026-09-05-003-run

**Session:** 2026-09-05-003-T02 (def5678)
**Completed:** 3/5
**Blocked:** 0
**Skipped:** 0
**Status:** incomplete

Cumulative across sessions; T02 and T03 checked in this session.
```

**After Session 5:** All tasks completed
```markdown
- [x] T01-task-one
- [x] T02-task-two
- [x] T03-task-three
- [x] T04-task-four
- [x] T05-task-five

## Work Report — 2026-09-05-003-run

**Session:** 2026-09-05-003-T05 (ghi9012)
**Completed:** 5/5
**Blocked:** 0
**Skipped:** 0
**Status:** complete

Plan complete. All tasks checked.
```

**Key observation:** The report block is replaced in place; the count always reads from the entire checklist, not just this session's outcomes.

## Test Scenarios

### Gated Replacement (Atomic Update)

1. **Partial update (1/5):** Call with first task outcome → block shows `1/5 completed, Status: incomplete`
2. **Cumulative (3/5):** Call again with outcomes 2–3 → same block replaced, now shows `3/5`
3. **Block persistence:** Verify no duplicate blocks created; following sections (e.g., `## Next Steps`) remain intact
4. **Completion gate (5/5):** Final call with outcomes 4–5 → block shows `5/5 completed, Status: complete`, following sections preserved

### Atomicity & Re-run Scenarios

1. **Index with checklist:** Compute count from `- [x]` lines, not from outcomes
2. **Index without checklist (ad-hoc plan):** Fall back to `totalTasks`, then to outcome count
3. **Re-run after completion:** Replace block in place; no stacking, no duplication
4. **Partial re-run after completion:** Block regenerated with current session SHA and notes; count and status recomputed
5. **Missing session SHA:** Handle gracefully (e.g., use timestamp or omit); do not fail
6. **Block at end of file:** Correctly positioned when no following sections exist
7. **Multiple plans in one index:** Each plan has its own `## Work Report — <plan-id>-run` block; no cross-contamination

### Edge Cases

1. **Empty checklist:** `total=0` → count as `0/0`, Status reflects zero completion requirement
2. **Malformed checklist lines:** Skip lines not matching `- [x]` or `- [ ]`; count valid lines only
3. **Blocked/skipped without outcomes:** Outcomes array is empty → report `0/0` with fallback logic
4. **Session SHA collision:** Two sessions with same commit; notes distinguish them (e.g., timestamp)

## Dependencies

- None

## Notes

- **Forward-only invariant:** `recordWorkOutcomes` still never re-opens a `completed` task and never unticks a box. This task changes how the report **counts**, not how it writes.
- **Shared checklist source:** Ties to T03 by name only, not by code; both read the checklist, and the count here must come from the same `- [x]` lines the queue (T03) trusts.
- **Report immutability within session:** Once a block is rendered for a plan-id, the next session always computes fresh counts; the previous session's notes are only read to determine block boundaries, never merged.
- **Outcome metadata preservation:** `blocked` and `skipped` counts come from outcomes; the index cannot represent them, so they remain outcome-only and are lost if the index is re-generated without outcomes (acceptable, since the count is the source of truth).
