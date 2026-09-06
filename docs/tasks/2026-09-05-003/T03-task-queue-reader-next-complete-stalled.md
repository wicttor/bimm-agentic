---
id: 2026-09-05-003-T03
title: "Read the task index as a queue: next, complete, or stalled"
plan-id: 2026-09-05-003
unit: U3
tier: deep
status: not-started
priority: P0
dependencies: []
files:
  create:
    - agent/src/queue.ts
    - agent/tests/queue.test.ts
  modify: []
  test:
    - agent/tests/queue.test.ts
estimated-effort: "3 hours"
timestamp: 2026-09-05T18:45:00Z
---

# Read the task index as a queue: next, complete, or stalled

## Goal

`docs/tasks/<plan-id>/index.md` already *describes* a queue — order, checkboxes, dependencies. This task
makes it the scheduler, so a session can answer "what is next, are we done, or are we stuck" from disk.

## Acceptance Criterion

`loadTaskQueue` + `nextRunnableTask` return `{kind:"task"}` for the first unchecked task whose every dependency is `completed`, `{kind:"complete", total}` when all lines are checked, and `{kind:"stalled"}` naming the unchecked tasks and their unmet dependencies when nothing is runnable — with a `blocked` task treated as re-runnable and a `completed` one never re-opened

## Steps

1. **Red — Write the failing test:** create `agent/tests/queue.test.ts` against a temp artifacts dir containing a generated index and task files (write them with `writePlanArtifacts` so the fixture cannot drift from the renderer): all unchecked → first entry; T01 completed → second; all completed → `{kind:"complete", total:3}`; T02 unchecked with T01 unchecked → `{kind:"stalled"}` naming T02 and its unmet dep; a `blocked` T01 with its box unticked → T01 is next (re-runnable); a dependency that names a task id which exists in no file → `stalled`, and the queue reports the dangling reference instead of skipping it. Confirm failures.
2. **Green — Implement:** create `agent/src/queue.ts`: `loadTaskQueue({artifactsDir, planId})` parses each `- [ ] T<NN> — <title> (\`U<n>\`, AC: …) — \`<path>\`` checklist line into `{label, taskId, title, unit, checked, path}`, then reads each task file's frontmatter for `status` and `dependencies`; `nextRunnableTask(queue)` is a pure function over that list in index order.
3. **Refactor:** keep I/O in `loadTaskQueue` and the decision in `nextRunnableTask` — the driver and the work stage both branch on the pure half, and both test it without a filesystem.

## nextRunnableTask Semantics

The function `nextRunnableTask(queue)` examines the task queue in index order and returns one of three results:

### Result: `{kind: "task", taskId, title, path, unit}`
The first task in index order whose:
1. Index checkbox is **unchecked** (or frontmatter `status ≠ "completed"`)
2. **Every** dependency is `completed` (or does not exist as a file — non-existent tasks are treated as blocking)
3. Frontmatter `status` is either `not-started` or `blocked` (re-runnable; `completed` never selects)

### Result: `{kind: "complete", total}`
All tasks in the index are **checked** (or have `status: "completed"`). `total` is the count of tasks in the queue.

### Result: `{kind: "stalled", tasks, reasons}`
No task is runnable — either the queue is empty or every unchecked task has an unmet dependency.
- `tasks`: array of unchecked task ids
- `reasons`: object mapping each task id to the list of unmet dependencies (by task id or file path)

## Example State Transitions

### Scenario 1: Three tasks in order, none started
```
Index:
- [ ] T01 — Compile (dependencies: [])
- [ ] T02 — Link (dependencies: [T01])
- [ ] T03 — Run (dependencies: [T02])

Initial: nextRunnableTask() → {kind: "task", taskId: "T01", ...}
After T01 marked done: nextRunnableTask() → {kind: "task", taskId: "T02", ...}
After T02 marked done: nextRunnableTask() → {kind: "task", taskId: "T03", ...}
After T03 marked done: nextRunnableTask() → {kind: "complete", total: 3}
```

### Scenario 2: Circular or broken dependency
```
Index:
- [ ] T01 — Task A (dependencies: [T02])
- [ ] T02 — Task B (dependencies: [T01])

Result: {kind: "stalled", tasks: ["T01", "T02"], reasons: {
  T01: ["T02 (unchecked)"],
  T02: ["T01 (unchecked)"]
}}
```

### Scenario 3: Blocked task is re-runnable
```
Index:
- [x] T01 — First pass (status: blocked)
- [ ] T02 — Second pass (dependencies: [T01])

nextRunnableTask() → {kind: "task", taskId: "T01", ...}  // blocked is re-runnable
```

### Scenario 4: Index mismatch with frontmatter
```
Index: - [x] T01 — Done?
File:   status: not-started

The file wins. Index and file disagree → report mismatch.
nextRunnableTask() → {kind: "task", taskId: "T01", ...}  // because file says not-started
```

## Test Scenarios

- Empty queue → `stalled` with an explicit "no tasks registered" reason, never `complete`
- First unchecked with satisfied deps → `task`
- Every line checked → `complete` carrying the total
- Unchecked with an unchecked dependency → `stalled` naming both
- `blocked` → re-runnable; `completed` → never selected again
- Disagreement: index checked, file `status: not-started` → the file wins and the mismatch is reported

## Acceptance Criteria

- [ ] `loadTaskQueue` + `nextRunnableTask` return `{kind:"task"}` for the first unchecked task whose every dependency is `completed`, `{kind:"complete", total}` when all lines are checked, and `{kind:"stalled"}` naming the unchecked tasks and their unmet dependencies when nothing is runnable — with a `blocked` task treated as re-runnable and a `completed` one never re-opened

## Dependencies

- None

## Notes

- A dependency line in a task file may read `` `src/x.ts` (not a planned task)`` (see `renderTaskArtifact`'s `dependencies` mapping). Those are not task ids: ignore them for gating, but surface them in `stalled.reasons` so a human can see why.
- The plan skill guarantees index order is topological, so "first runnable in index order" is the whole scheduler. Do not re-sort — re-sorting hides a planner that emitted a bad order, which `stalled` should expose.
- Prove behaviour by constructing fixtures through the renderer, not by hand-writing markdown that merely looks right (`docs/learn/pattern/test-config-isolation-behaviorally-not-regex.md`).
