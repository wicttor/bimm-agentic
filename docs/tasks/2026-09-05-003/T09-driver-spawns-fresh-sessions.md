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

## Implementation / Notes

### SessionLauncher Interface

The driver is injectable with a `SessionLauncher` to enable testing without spawning real processes:

```typescript
type SessionLauncher = (argv: string[]) => Promise<number>;
```

**Inputs:**
- `argv`: Full argument array for the child process, e.g., `["work", "--plan-id", "2026-09-05-003", "--task", "2026-09-05-003-T04"]`

**Returns:** Exit code (0, 2, 3, 4, 5, or other non-zero).

**Production implementation** (built into `runDriveStage`):
```typescript
const productionLauncher: SessionLauncher = async (argv: string[]) => {
  const child = spawn(process.execPath, [entryPath, ...argv], {
    stdio: "inherit",
    shell: false,
  });
  return new Promise((resolve) => child.on("exit", (code) => resolve(code ?? 1)));
};
```

### Driver Loop & Exit Code Propagation

```
Driver Start
    ↓
Load config (--plan-id, --max-sessions)
    ↓
Loop (up to --max-sessions):
    ├─ launcher(["work", "--plan-id", <id>])
    │  (Each child reads manifest, queue, and dependencies fresh from disk)
    │
    ├─ Exit code 0 (task completed)
    │  ├─ Increment session counter
    │  ├─ Continue loop if budget remaining and queue not empty
    │  └─ On exit from loop → EXIT 0 (queue empty)
    │
    ├─ Exit code 2 (dirty tree)
    │  ├─ DRIVER PROPAGATES EXIT 2
    │  └─ No further sessions launched
    │
    ├─ Exit code 3 (queue stalled / blocked dependency)
    │  ├─ DRIVER PROPAGATES EXIT 3
    │  └─ No further sessions launched
    │
    ├─ Exit code 4 (task blocked / validation failed)
    │  ├─ DRIVER PROPAGATES EXIT 4
    │  └─ No further sessions launched
    │
    └─ Exit code 5 (queue empty)
       ├─ Loop exits (queue reported empty)
       └─ DRIVER EXITS 0 (success)

After Loop:
    ├─ If budget exhausted (max-sessions reached, queue not empty)
    │  ├─ Print resume command: `agent drive --plan-id <id> [--max-sessions N]`
    │  └─ EXIT 1 (non-zero, indicating incomplete run)
    │
    └─ Queue empty → EXIT 0 (all tasks done)
```

### Blocked Session Propagation

When a child session exits with 2, 3, or 4, the driver **immediately stops** and returns that code:

| Exit Code | Meaning | Driver Behavior |
|-----------|---------|-----------------|
| 0 | Task completed | Continue loop |
| 2 | Dirty tree | Stop, propagate 2 |
| 3 | Queue stalled | Stop, propagate 3 |
| 4 | Task blocked | Stop, propagate 4 |
| 5 | Queue empty | Continue loop (or exit if loop ends) |

**Rationale:** Codes 2, 3, 4 are terminal conditions that indicate a problem the next session cannot fix:
- **2 (dirty tree):** The working tree is not clean; no session can run until `git reset` is issued externally.
- **3 (stalled queue):** A task is blocked by a dependency that also failed to complete; the queue will not advance.
- **4 (blocked task):** The task in question cannot progress; the queue advances for other tasks, but this one is marked blocked.

All three are propagated up to the human operator to decide next steps.

### Session Lifecycle Example

**Scenario: Three tasks, first two succeed, third is blocked**

```
Driver: launch 1
  ├─ work session: reads manifest, queue = [T01, T02, T03]
  ├─ nextRunnableTask → T01 (no dependencies)
  ├─ executeTask(T01) → success
  ├─ validate → pass
  ├─ commit [written files, task file, index]
  └─ EXIT 0

Driver: launch 2
  ├─ work session: reads manifest, queue = [T02, T03]
  ├─ nextRunnableTask → T02 (no dependencies)
  ├─ executeTask(T02) → success
  ├─ validate → pass
  ├─ commit [written files, task file, index]
  └─ EXIT 0

Driver: launch 3
  ├─ work session: reads manifest, queue = [T03]
  ├─ nextRunnableTask → T03 (depends on T02: complete ✓)
  ├─ executeTask(T03) → validation fails, repair exhausted
  ├─ restoreWrittenPaths
  ├─ artifact-only commit [task file, report]
  ├─ recordWorkOutcomes (status: blocked, reason: "validation failed")
  └─ EXIT 4

Driver: received EXIT 4 from launch 3
  └─ DRIVER EXITS 4 (blocked session propagated)
```

### Budget Exhaustion Example

**Scenario: --max-sessions 2, queue never empties (circular dependency or infinite backlog)**

```
Driver: launch 1
  ├─ work session executes one task
  └─ EXIT 0

Driver: launch 2
  ├─ work session executes one task
  └─ EXIT 0

Driver: budget spent (2 sessions launched)
  ├─ check queue status
  ├─ queue not empty → print resume command
  ├─ Print: "Run 'agent drive --plan-id 2026-09-05-003 --max-sessions 10' to continue"
  └─ EXIT 1 (incomplete run)
```

### Test Scenarios

#### Scenario 1: Three tasks, all green
- **Setup:** Queue = [T01, T02, T03], each task succeeds
- **Expected:**
  - Launcher called 3 times with identical work command
  - Each argv: `["work", "--plan-id", "2026-09-05-003"]`
  - All three return 0
  - Driver exits 0

#### Scenario 2: Blocked on second session
- **Setup:** Queue = [T01, T02, T03], T02 validation fails
- **Expected:**
  - Launcher called 2 times
  - First call returns 0
  - Second call returns 4 (blocked)
  - Driver stops and exits 4 (propagated)

#### Scenario 3: Budget spent, queue not empty
- **Setup:** --max-sessions 2, queue = [T01, T02, T03, T04] or larger
- **Expected:**
  - Launcher called 2 times
  - Both return 0
  - Driver detects budget exhausted
  - Prints resume command with plan-id
  - Driver exits 1 (non-zero, run incomplete)

#### Scenario 4: Empty queue from the start
- **Setup:** --plan-id pointing to a plan with all tasks completed
- **Expected:**
  - First launcher call returns 5 (queue empty)
  - Driver exits 0 (success, nothing to do)

#### Scenario 5: Dirty tree at work session start
- **Setup:** Working directory has uncommitted changes
- **Expected:**
  - First launcher call returns 2 (dirty tree)
  - Driver stops and exits 2 (propagated)
  - No further sessions launched

#### Scenario 6: Stalled queue (blocked dependency)
- **Setup:** Queue = [T02], T02 depends on T01 which is in state: blocked
- **Expected:**
  - First launcher call returns 3 (stalled)
  - Driver stops and exits 3 (propagated)

### Exit-Code Mapping in Driver

- **Exit 0:** Queue became empty after one or more successful sessions. All planned tasks are done.
- **Exit 1:** Budget exhausted (--max-sessions limit reached) but queue not empty. Resume command printed.
- **Exit 2:** A session reported dirty tree. Propagated; no further sessions.
- **Exit 3:** A session reported stalled queue. Propagated; no further sessions.
- **Exit 4:** A session reported task blocked. Propagated; no further sessions.
- **Exit 5+:** Launcher threw or timed out (host-side failure).

### Argv Invariant

**Every launcher invocation receives the same `work` command.** The driver does not build per-task arguments; the queue on disk decides what each session runs next. This is why killing the driver and restarting it is safe:

```typescript
// Driver DOES NOT do this (wrong):
// launcher(["work", "--plan-id", id, "--task", nextTaskId])

// Driver DOES this (correct):
// launcher(["work", "--plan-id", id])
// ↑ Each session reads the manifest and queue independently, calls nextRunnableTask, and picks the next task itself.
```

### Production Launcher

```typescript
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname } from "path";

const productionLauncher: SessionLauncher = async (argv: string[]) => {
  const __filename = fileURLToPath(import.meta.url);
  const agentSrcDir = dirname(__filename);
  const entryPath = `${agentSrcDir}/index.ts`;

  const child = spawn(process.execPath, [entryPath, ...argv], {
    stdio: "inherit", // Correctness: piped stdio on large output wedges the driver
    shell: false,      // Security: no shell interpolation
  });

  return new Promise((resolve) => {
    child.on("exit", (code) => {
      resolve(code ?? 1); // Treat no exit code as 1 (error)
    });
    child.on("error", () => {
      resolve(1); // Spawn error → exit 1
    });
  });
};
```

### Output & Progress Logging

The driver prints one line per session to stdout:

```
[T01] 0 (sha: abc1234)
[T02] 0 (sha: def5678)
[T03] 4 (sha: ghi9012) — blocked
```

Format: `[task-id] exit-code (sha: commit-sha)` — allows the human to follow progress in real time.

## Notes

- The driver holds **no** task state — not a counter of what ran, not a list of files. Each session
  re-reads manifest, queue, and dependencies from disk, which is what makes a killed driver safely
  restartable and what makes `--max-sessions` a budget rather than a cursor.
- `stdio: "inherit"` is a correctness choice, not a convenience: a piped child that fills the buffer
  with a long `npm run test` output wedges the driver.
- Per `docs/learn/workflow/spawn-real-cli-entry-in-tests.md`, when a test needs the real spawn path it
  runs `node agent/src/index.ts drive …` with a scrubbed env behind `isDirectExecution()` — no `tsx`,
  no new npm script. The scripted-launcher tests above stay in-process for speed and determinism.
