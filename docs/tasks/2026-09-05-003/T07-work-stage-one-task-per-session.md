---
id: 2026-09-05-003-T07
title: "Add the work stage: one session, one task, gate, record, commit"
plan-id: 2026-09-05-003
unit: U7
tier: deep
status: not-started
priority: P1
dependencies: [2026-09-05-003-T01, 2026-09-05-003-T02, 2026-09-05-003-T03, 2026-09-05-003-T04, 2026-09-05-003-T05, 2026-09-05-003-T06]
files:
  create:
    - agent/src/work.ts
    - agent/tests/work-stage.test.ts
  modify:
    - agent/src/index.ts
  test:
    - agent/tests/work-stage.test.ts
estimated-effort: "4 hours"
timestamp: 2026-09-05T18:45:00Z
---

# Add the work stage: one session, one task, gate, record, commit

## Goal

This is the requested behaviour in one place: a call that implements **one** task, proves it, commits
it, and exits — leaving the tree clean and the queue advanced for the next session, whatever the reason
it stopped.

## Acceptance Criterion

`index.ts work --plan-id <id>` opens a session that runs one task, gates it with `validate` and `repair` bounded by `--max-retries` (skipped by `--gate none`), and then either records `completed` and commits `[written files, task file, index]` exiting 0, or restores only that session's written files, records `blocked`, commits the artifact-only record and exits 4 — exiting 5 on an empty queue, 3 on a stalled one, and refusing a dirty tree before any model call

## Steps

1. **Red — Write the failing test:** create `agent/tests/work-stage.test.ts` driving `run(["work","--plan-id",…])` with an injected provider, `GitRunner` and `runScript`: green path → exit 0, exactly one commit whose path list is `[this session's written files, its task file, its index]`, task file `status: completed`, report `1/N incomplete`; red gate → `validate` called, `repair` attempted within `--max-retries`, then `status: blocked` with a reason, `restoreWrittenPaths` issued for that session's paths only, one artifact-only commit, exit 4; queue all checked → exit 5 and the provider spy at zero calls; unchecked-but-blocked-upstream → exit 3 naming the task; dirty tree → exit 2 with the provider spy at zero; `--gate none` → the commit happens with no `validate` call. Confirm failures.
2. **Green — Implement:** create `agent/src/work.ts` exporting `runWorkSession(config, provider, deps)` that composes the primitives in order: `readRunManifest` (CLI flags override each key) → `requireCleanTree` (unless `--no-commit`) → `loadTaskQueue` + `nextRunnableTask` (or `--task <id>`) → `executeTask` → `validate` then `repair` up to `config.maxRetries` → `recordWorkOutcomes` for the one outcome → `commitPaths` on the green path, `restoreWrittenPaths` + artifact-only commit on the red one → the exit code. Dispatch it from `agent/src/index.ts`'s stage switch; keep `orchestrate()` intact for the plan stage's reuse of its first half.
3. **Refactor:** make the ordering unmissable — validation runs before recording, and nothing that can fail runs after the commit. Name the commit-subject builder once, so the plan stage and this one cannot diverge in message shape.

## Test Scenarios

- Green: one commit, exact path list, `completed`, exit 0
- Red gate: repair bounded by `--max-retries`, `blocked` + reason, restore, artifact-only commit, exit 4
- Empty queue → exit 5, zero provider calls
- Stalled queue → exit 3 naming the blocked dependency
- Dirty tree → exit 2, zero provider calls, no `stash`/`reset` issued
- `--gate none` → commits on model-stop with no validation
- `--no-commit` → artifacts recorded, zero git mutating calls

## Acceptance Criteria

- [ ] `index.ts work --plan-id <id>` opens a session that runs one task, gates it with `validate` and `repair` bounded by `--max-retries` (skipped by `--gate none`), and then either records `completed` and commits `[written files, task file, index]` exiting 0, or restores only that session's written files, records `blocked`, commits the artifact-only record and exits 4 — exiting 5 on an empty queue, 3 on a stalled one, and refusing a dirty tree before any model call

## Dependencies

- 2026-09-05-003-T01: stage dispatch and the exit codes this stage returns
- 2026-09-05-003-T02: `readRunManifest` tells the session what to run against
- 2026-09-05-003-T03: `nextRunnableTask` is what "next" means
- 2026-09-05-003-T04: the commit and the scoped restore are both git-seam calls
- 2026-09-05-003-T05: `executeTask` is the only executor entry point this stage may use
- 2026-09-05-003-T06: one session's outcome must land in a cumulative report

## Implementation / Notes

### Session Lifecycle

```
Session Start (fresh process)
    ↓
readRunManifest (config from CLI flags, task index frontmatter)
    ↓
requireCleanTree (unless --no-commit)
    ↓ [refuse if dirty]
loadTaskQueue + nextRunnableTask (or --task <id>)
    ↓ [exit 5 if empty, exit 3 if stalled]
executeTask (one task, dependencies from disk)
    ↓ [on model stop or error]
validate (typecheck + test, --gate none skips)
    ↓ [validate fails → repair loop]
repair (up to --max-retries attempts)
    ↓
recordWorkOutcomes (write task file + work report)
    ↓
GATE DECISION
    ├─ GREEN (validation passed)
    │   ├─ commitPaths([written files, task file, index])
    │   ├─ record status: completed
    │   └─ EXIT 0
    │
    └─ RED (validation failed, repair exhausted)
        ├─ restoreWrittenPaths (this session's files only)
        ├─ artifact-only commit (record + report only)
        ├─ record status: blocked + reason
        └─ EXIT 4
```

### Gate Behavior

- **Validation gates every green commit.** Runs after task execution and before recording outcomes.
- **Repair is bounded.** Each repair attempt increments a counter; stops at `--max-retries`.
- **--gate none skips validation.** Commits happen without gating; used for dev/debug only.
- **Validation failure → repair loop.** After repair exhaustion, session records `blocked` and exits 4.
- **Validation success → commit + exit 0.** Task is committed as complete.

### Commit vs Restore Flow

| Outcome | Files | Commit | Exit | Notes |
|---------|-------|--------|------|-------|
| Green (pass validation) | Written files + task file + index | One commit with all three | 0 | Tree is clean, queue advanced |
| Red (fail validation) | Session-scoped restore (tracked paths deleted, untracked removed) | Artifact-only (task file + report only) | 4 | Tree is clean, queue ready for retry/skip |
| Empty queue | None | None | 5 | No session started; zero provider calls |
| Stalled queue | None | None | 3 | No session started; named blocked dependency |
| Dirty tree (at start) | None | None | 2 | Refused before manifest; zero provider calls |

### Exit-Code Mapping

- **Exit 0:** One task completed, committed, queue advanced. Normal progress.
- **Exit 2:** Dirty tree at session start. Refused before any model call.
- **Exit 3:** Task queue is stalled (blocked dependency not completed). Named in error message.
- **Exit 4:** One task attempted, validation failed, repair exhausted. Task marked blocked, committed.
- **Exit 5:** Task queue is empty. No work to do; session did not start.

### Validation & Repair Integration

- Validation runs after `executeTask` but before `recordWorkOutcomes`.
- If validation fails, `repair()` is called up to `--max-retries` times.
- Each repair attempt is independent; repair does not re-run the model.
- After repair exhaustion, outcome is recorded with `status: blocked` and reason.
- The blocked outcome and report are committed (artifact-only, no written files).

### Refusal Order (Safety Property)

1. **Manifest:** Missing config keys or invalid flags → refuse before clean-tree check.
2. **Clean tree:** Dirty working tree → refuse before queue check (exit 2).
3. **Queue:** Empty or stalled queue → refuse before any LLM call (exit 5, 3).
4. **Network:** Only after all pre-flight checks pass, the model is called.

This order ensures a session that fails early does not burn tokens on a problem that will not proceed.

### Key Invariants

- **One commit per completed task.** Exactly one green commit, or exactly one artifact-only commit.
- **Scoped restore.** Red sessions restore only written files they produced, not task file or index.
- **Artifact-only commit on blocked.** The block is a record worth keeping; next session starts clean.
- **No model commit.** The model cannot issue commit commands; all commits are harness-side.
- **No retry on git failure.** If commit fails, session exits with that error; no restart logic.

## Notes

- The refusal order is a safety property: manifest → clean tree → queue → **then** the network. A session that burns tokens before discovering it is about to fail leaves the human with a cost and no progress.
- `validate.ts` and `repair.ts` become live here. They were built for the outer loop in plan 2026-09-04-001 and never reached from the CLI — this is the wiring, and it is why the gate exists per commit rather than once at the end.
- The artifact-only commit on the blocked path is on purpose: the block is a record worth having in history, and the next `work` session must start from a clean tree, not from a `blocked` edit it has to carry.
- The sandbox does not change. `run_command` still allow-lists `typecheck|test|build`, so the model cannot commit, push, or clean; commits are this harness's doing only.
