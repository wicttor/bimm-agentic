---
id: 2026-09-05-003-T08
title: "Make the plan stage end at the artifacts and print how to continue"
plan-id: 2026-09-05-003
unit: U8
tier: deep
status: not-started
priority: P1
dependencies: [2026-09-05-003-T01, 2026-09-05-003-T02, 2026-09-05-003-T04]
files:
  create:
    - agent/tests/plan-stage.test.ts
  modify:
    - agent/src/index.ts
  test:
    - agent/tests/plan-stage.test.ts
estimated-effort: "2 hours"
timestamp: 2026-09-05T18:45:00Z
---

# Make the plan stage end at the artifacts and print how to continue

## Goal

The first half of the request: after the tasks exist, the call ends. No executor turn, no in-process
hand-off — just committed artifacts and the command that picks the run up.

## Acceptance Criterion

`index.ts plan --spec <path>` scaffolds, plans, writes and registers the plan and task artifacts, commits scaffold plus artifacts, exits 0 having issued no executor call, and prints the exact `work`/`drive` command to continue — a bare `--spec` run behaving identically

## Steps

1. **Red — Write the failing test:** create `agent/tests/plan-stage.test.ts` with a `FakeProvider` scripted for **exactly one** `write_plan` turn and set to throw loudly if called again: assert `run(["plan","--spec",…])` returns 0; the plan document and one task file per task exist with the manifest keys from T02; the recording `GitRunner` saw one commit whose path list covers the scaffold and the artifacts and nothing in the app tree was executed; stdout contains `drive --plan-id <id>` and `work --plan-id <id>`; and `run(["--spec",…])` (no subcommand) yields the same result. Confirm failures.
2. **Green — Implement:** split the first six steps of `orchestrate()` into `runPlanStage(config, provider, deps)`: scaffold → `deriveRules` → `plan` → `writePlanArtifacts` (now fed `out`/`provider`/`model` for the manifest) → `commitPaths` → print the continuation. Route the `plan` subcommand and a bare argv there; remove the unconditional execution from the entry point.
3. **Refactor:** keep the existing "artifacts failed → log once, continue" behaviour, but make it end the stage when it happens: with no task files there is no queue to hand off, so report the reason and return a generation error instead of proceeding silently to nothing.

## Test Scenarios

- One planner call, no second turn (loud fake exhaustion would fail the test)
- Artifacts + indexes on disk, manifest keys present
- Exactly one commit, path list = scaffold + plan + task files + indexes
- Continuation command printed with the real plan id
- Bare `--spec` == `plan --spec`
- `--no-commit` → artifacts on disk, zero git mutating calls, still exit 0

## Acceptance Criteria

- [ ] `index.ts plan --spec <path>` scaffolds, plans, writes and registers the plan and task artifacts, commits scaffold plus artifacts, exits 0 having issued no executor call, and prints the exact `work`/`drive` command to continue — a bare `--spec` run behaving identically

## Dependencies

- 2026-09-05-003-T01: the `plan` stage and the bare-argv default it must match
- 2026-09-05-003-T02: the manifest keys this stage is the only writer of
- 2026-09-05-003-T04: the commit that closes the stage (and its `paths_ignored` failure on this repo's `generated-app/`)

## Notes

- The commit at the end of the plan stage is the base every task commit assumes: it is what makes
  `restoreWrittenPaths` safe in a later session, because everything tracked in `--out` at session start
  came from a commit.
- A `--out` under this repo's `.gitignore` makes the scaffold commit fail with `paths_ignored`. That is
  T04's error surfacing here, and it is the expected first-run experience: the operator chooses a
  tracked `--out` or passes `--force-add`, or runs `--no-commit` and commits by hand.
- Script one provider reply per expected model call — a fake that runs dry is the proof of termination
  (`docs/learn/gotcha/scripted-fake-exhaustion-mimics-adapter-bug.md`).
