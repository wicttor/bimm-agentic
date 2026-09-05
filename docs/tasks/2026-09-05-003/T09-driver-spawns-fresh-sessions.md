---
id: 2026-09-05-003-T09
title: "Add drive: launch a fresh session per task until the queue is empty"
plan-id: 2026-09-05-003
unit: U9
tier: deep
status: not-started
priority: P1
dependencies: [2026-09-05-003-T01, 2026-09-05-003-T07, 2026-09-05-003-T08]
files:
  create:
    - agent/src/drive.ts
    - agent/tests/drive.test.ts
  modify:
    - agent/src/index.ts
  test:
    - agent/tests/drive.test.ts
estimated-effort: "2 hours"
timestamp: 2026-09-05T18:45:00Z
---

# Add drive: launch a fresh session per task until the queue is empty

## Goal

The run should finish without a human in the launch loop: one session per task, each in its own
process, each starting from disk — and the loop stops the moment a session says stop.

## Acceptance Criterion

`drive --plan-id <id> [--max-sessions N]` launches one session per remaining task through an injectable `SessionLauncher` (production: a `node` child process per session, no shell, `stdio: "inherit"`), stops at the first blocked or failed session propagating its code, and exits 0 when a session reports the queue empty

## Steps

1. **Red — Write the failing test:** create `agent/tests/drive.test.ts` with a launcher that records argv and returns scripted codes: three tasks then 5 → three launches, exit 0, and each launch's argv is identical to the others (the queue, not the driver, decides what runs next); a 4 on the second launch → the driver returns 4 and launches nothing further; `--max-sessions 2` with a queue that never empties → two launches, a non-zero exit, and a printed resume command naming the plan id; the production launcher builds `[process.execPath, entryPath, "work", …]` and passes no `shell: true`. Confirm failures.
2. **Green — Implement:** create `agent/src/drive.ts` exporting `runDriveStage(config, deps)` over `launch?: SessionLauncher`, defaulting to a `spawn` of a fresh `node <entry> work …` per iteration with `stdio: "inherit"`; loop on 0, stop-and-propagate on 2/3/4, stop-and-succeed on 5, stop on budget. Route the `drive` subcommand from `agent/src/index.ts`; resolve the entry path the same way `isDirectExecution()` does.
3. **Refactor:** print one line per session — task id, exit code, commit sha when there was one — so the driver's own stdout is the run's progress log.

## Test Scenarios

- Three tasks + empty → 3 launches, exit 0
- Blocked second session → exit 4, 2 launches total
- Budget spent before empty → non-zero, resume command printed
- Every launch's argv is the same `work` command (state lives on disk)
- Production launcher: argument array, `process.execPath`, no shell interpolation

## Acceptance Criteria

- [ ] `drive --plan-id <id> [--max-sessions N]` launches one session per remaining task through an injectable `SessionLauncher` (production: a `node` child process per session, no shell, `stdio: "inherit"`), stops at the first blocked or failed session propagating its code, and exits 0 when a session reports the queue empty

## Dependencies

- 2026-09-05-003-T01: the `drive` subcommand, `--max-sessions`, and the exit codes this loop branches on
- 2026-09-05-003-T07: the session it launches
- 2026-09-05-003-T08: the artifacts (and manifest) every session reads first

## Notes

- The driver holds **no** task state — not a counter of what ran, not a list of files. Each session
  re-reads manifest, queue, and dependencies from disk, which is what makes a killed driver safely
  restartable and what makes `--max-sessions` a budget rather than a cursor.
- `stdio: "inherit"` is a correctness choice, not a convenience: a piped child that fills the buffer
  with a long `npm run test` output wedges the driver.
- Per `docs/learn/workflow/spawn-real-cli-entry-in-tests.md`, when a test needs the real spawn path it
  runs `node agent/src/index.ts drive …` with a scrubbed env behind `isDirectExecution()` — no `tsx`,
  no new npm script. The scripted-launcher tests above stay in-process for speed and determinism.
