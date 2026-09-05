---
id: 2026-09-05-003-T10
title: "Prove the split offline and retire the one-process loop"
plan-id: 2026-09-05-003
unit: U10
tier: deep
status: not-started
priority: P1
dependencies: [2026-09-05-003-T05, 2026-09-05-003-T06, 2026-09-05-003-T07, 2026-09-05-003-T08, 2026-09-05-003-T09]
files:
  create:
    - agent/tests/pipeline-sessions.test.ts
  modify:
    - agent/tests/pipeline-skills.test.ts
    - agent/tests/generator.test.ts
    - agent/src/generator.ts
  test:
    - agent/tests/pipeline-sessions.test.ts
estimated-effort: "3 hours"
timestamp: 2026-09-05T18:45:00Z
---

# Prove the split offline and retire the one-process loop

## Goal

Until one test file shows plan, execute-per-task, and finish as **separate calls**, the split is a
claim. This is also the change that deletes the loop the pipeline no longer has.

## Acceptance Criterion

Offline with `FakeProvider`, a scripted `GitRunner` and an in-process `SessionLauncher`: the plan stage writes and commits the artifacts, each work session is a separate call committing exactly its own task, a blocked task leaves no modified files and stops the driver, a re-run on a complete list exits 5 with zero provider calls — and `generate()` no longer exists

## Steps

1. **Red — Write the failing test:** create `agent/tests/pipeline-sessions.test.ts`: one `run(["plan","--spec",…])` with a one-reply `FakeProvider` → artifacts and one commit; then `run(["drive","--plan-id",…])` with the launcher calling `run(["work",…])` in-process against the same temp tree → per-task commits whose path lists never overlap, all task files `completed`, the cumulative report reading `N/N` and `complete`, and the executor's request count equal to the task count; then a variant where the second task's `runScript` returns a failing exit → `blocked`, `restoreWrittenPaths` observed for exactly that session's paths, driver exit 4, no further launches; then `run(["work","--plan-id",…])` on the finished list → exit 5 with the provider spy at zero calls. Assert zero network with both the `createProvider` spy and a `fetch` spy. Confirm failures.
2. **Green — Implement:** fix what the proof exposes in the stages — the hand-off ordering, the artifact path set, the exit-code mapping. Then delete `generate()` from `agent/src/generator.ts` and migrate `agent/tests/generator.test.ts` to `executeTask`, rewriting `agent/tests/pipeline-skills.test.ts` to its plan-stage-only half (its skill-provenance assertions move here and stay).
3. **Refactor:** the proof is the documentation of the split — name each `describe` block after the stage it exercises, and keep one `it` per exit code.

## Test Scenarios

- Plan then drive: 1 planner call + N executor calls, N+1 commits, `N/N complete`
- Non-overlap: each task commit contains its own written files, task file and index only
- Blocked mid-list: exactly one restore for that session, driver stops, remaining tasks `not-started`
- Resume: rerun after the block → only the pending task executes
- Finished queue → exit 5, zero provider calls
- Zero network: both spies at zero; no `.work/`, `.scope/`, `.research/`, `.design/` directory created

## Acceptance Criteria

- [ ] Offline with `FakeProvider`, a scripted `GitRunner` and an in-process `SessionLauncher`: the plan stage writes and commits the artifacts, each work session is a separate call committing exactly its own task, a blocked task leaves no modified files and stops the driver, a re-run on a complete list exits 5 with zero provider calls — and `generate()` no longer exists

## Dependencies

- 2026-09-05-003-T05: `executeTask` is what the migrated generator tests must now target
- 2026-09-05-003-T06: the report this proof asserts across sessions, not within one
- 2026-09-05-003-T07: the work stage under test
- 2026-09-05-003-T08: the plan stage under test
- 2026-09-05-003-T09: the driver whose launcher the proof replaces

## Notes

- `generate()` survives from T05 until here precisely so no commit in this plan is red; deleting it in
  the same change that removes its last caller is the honest order.
- Keep the loud provider stub: a scripted fake that throws when its replies run out is what proves no
  session made a call nobody expected.
- Do not replace the deleted one-process proof with a regex over markdown or over source strings —
  assert the commits, the files, and the argv the seams received.
