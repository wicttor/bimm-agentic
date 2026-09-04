---
id: 2026-09-04-001-T11
title: "Repair loop with bounded retries and stall detection"
plan-id: 2026-09-04-001
unit: U10
tier: deep
status: not-started
priority: P1
dependencies: [2026-09-04-001-T06, 2026-09-04-001-T10]
files:
  create:
    - agent/src/repair.ts
  modify:
    - agent/src/run.ts
  test:
    - agent/tests/repair.test.ts
estimated-effort: "6 hours"
timestamp: 2026-09-04T22:00:00Z
---

# Repair loop with bounded retries and stall detection

## Goal
Read validation output, feed it back to the model, and fix only what failed — the graded error-recovery criterion (Error Handling 10% of the rubric). Two independent caps plus stall detection prevent runaway token spend.

## Acceptance Criterion
When validation reports errors the repair pass sends the error list and only the offending files to the model, applies targeted edits, re-validates, and stops after `--max-retries` **or** immediately on a no-progress signature (identical error fingerprint twice), then exits non-zero with the residual errors.

## Steps
1. **Red — Write the failing test:** add `agent/tests/repair.test.ts` asserting: (a) one-fix recovery: injected `TS6133` unused local -> repaired, validation green on attempt 2, exactly 2 provider calls; (b) cap reached: provider keeps failing -> exactly `max-retries` repair calls, then non-zero exit; (c) stall detection: identical error set twice -> stops early; (d) blast-radius: error in `CarCard.tsx` -> `SearchBar.tsx` bytes unchanged; (e) `--max-retries 0`: validation runs once, no repair call, non-zero exit with error report. Run and confirm failure (repair loop doesn't exist yet).
2. **Green — Implement:** create `agent/src/repair.ts` (repair pass: takes validation errors, builds repair prompt with only offending files, calls provider, applies edits, re-validates, checks for stall), update `agent/src/run.ts` to integrate the repair loop after generation.
3. **Refactor:** ensure the error fingerprint is deterministic (sorted, normalized); verify the repair prompt includes only the offending files, not the entire codebase; confirm `--max-retries 0` short-circuits cleanly.

## Test Scenarios
- One-fix recovery: injected `TS6133` unused local -> repaired, validation green on attempt 2, exactly 2 provider calls recorded
- Cap reached: provider keeps failing -> exactly `max-retries` repair calls, then non-zero exit
- Stall detection: identical error set twice -> stops early rather than burning remaining retries
- Blast-radius: error in `CarCard.tsx` -> `SearchBar.tsx` bytes unchanged
- `--max-retries 0`: validation runs once, no repair call, non-zero exit with the error report

## Acceptance Criteria
- [ ] Repair pass sends error list and only offending files to model, applies targeted edits, re-validates, and stops at max-retries or on stall (identical error fingerprint twice), exiting non-zero with residual errors

## Dependencies
- 2026-09-04-001-T06: Validation gate provides the structured errors the repair loop consumes
- 2026-09-04-001-T10: Generator must complete before repair can run (repair fixes generated output)

## Notes
- This is the graded error-recovery criterion — the reviewer specifically evaluates this loop.
- Two independent caps: `--max-iterations` (inner, per-task) and `--max-retries` (outer, repair).
- Stall detection via error fingerprint: if the same error set appears twice in a row, stop immediately.
- Default `--max-retries` is 3 (overridable).
- The repair prompt uses `agent/src/prompts/repair.ts` from T07.
