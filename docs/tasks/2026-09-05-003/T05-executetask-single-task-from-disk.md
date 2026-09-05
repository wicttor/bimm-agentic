---
id: 2026-09-05-003-T05
title: "Extract executeTask: one task, dependency outputs read from disk"
plan-id: 2026-09-05-003
unit: U5
tier: deep
status: not-started
priority: P0
dependencies: [2026-09-05-003-T03, 2026-09-05-003-T04]
files:
  create:
    - agent/src/executor.ts
    - agent/tests/executor.test.ts
  modify:
    - agent/src/index.ts
  test:
    - agent/tests/executor.test.ts
estimated-effort: "3 hours"
timestamp: 2026-09-05T18:45:00Z
---

# Extract executeTask: one task, dependency outputs read from disk

## Goal

`generate()` carries cross-task state in a `Map` that dies with the process. The split needs the
opposite: a unit that executes **one** task and gets everything it needs about the others from the
committed output directory. By extracting this into a focused, testable unit with a typed failure
mode for missing dependencies, we gain the ability to run single tasks in isolation and leave
`generate()` as a thin in-process loop with no duplicated logic.

## Acceptance Criterion

`executeTask` runs exactly one task through the agent loop with dependency file contents read from 
the output directory on disk; a missing dependency file returns a typed failure `missing_dependency_output`; 
and `generate()` is re-expressed as a thin in-process loop over `executeTask` so no per-task logic exists twice.

## Steps

1. **Red — Write the failing test:** create `agent/tests/executor.test.ts` with:
   - Seed a temp out dir with a dependency's file; call `executeTask(task, {outDir})` and assert the 
     executor's request prompt contains that on-disk content
   - Delete the dependency file; call again and assert `{ok: false, failureReason: "missing_dependency_output"}` 
     with the provider never called (spy at zero); verify the error message names the task id and file
   - Pass a `taskArtifacts` entry and assert `result.taskArtifact` is the artifact path and the prompt 
     is prefixed with its task id
   - Call `generate([a, b])` and assert it issues exactly two provider calls whose prompts are identical 
     to two sequential `executeTask` calls
   Confirm all tests fail (function doesn't exist yet).

2. **Green — Implement:** create `agent/src/executor.ts`:
   - Lift the per-task body of `generate()`'s `for` loop into `export async function executeTask(spec, rules, provider, toolContext, task, options): Promise<TaskResult>`
   - Replace `generatedFiles.get(dep)` lookups with reads from `join(toolContext.outDir, dep)` on disk
   - If a dependency file is not found, return `{ok: false, failureReason: "missing_dependency_output", message: "Task <id> requires output from <dep-id> but file not found"}` without calling the provider
   - Keep the context builder, budget elision, and `buildGeneratorPrompt` logic exactly as it was
   - Modify `generate()` in `agent/src/index.ts` to be a thin loop: `for (const t of plan) results.push(await executeTask(spec, rules, provider, toolContext, t, options))`

3. **Refactor:**
   - Verify that `TaskResult` (`task`, `ok`, `writtenFiles`, `taskArtifact`, `failureReason`, `log`) is 
     the single place that describes one task's result
   - Move cross-task summary counts (`successCount`, `failureCount`, `failedTasks`) to the loop in `generate()`, 
     not into `TaskResult`
   - Confirm that all generated-file references go through disk, never the cross-process `Map`

## Test Scenarios

- **Dep on disk:** dependency file exists at the expected path; `executeTask` reads it and its contents 
  appear in the prompt sent to the provider
- **Dep missing:** task lists a dependency; `executeTask` finds no output file; returns 
  `{ok: false, failureReason: "missing_dependency_output"}` naming the task id and expected file; 
  provider is never called
- **Single task:** task with all dependencies on disk executes; issues exactly one provider turn; 
  `writtenFiles` and `taskArtifact` are reported in the result
- **Parity:** calling `generate([a, b])` produces the same two prompts and the same summary counts 
  as two sequential `executeTask` calls with the same inputs

## Acceptance Criteria

- [ ] `executeTask` runs exactly one task through the agent loop with dependency file contents read from the output directory on disk
- [ ] Missing dependency files return a typed failure `missing_dependency_output` naming the task id and file
- [ ] `generate()` is re-expressed as a thin in-process loop over `executeTask` so no per-task logic exists twice

## Dependencies

- 2026-09-05-003-T03: Task queue reader must exist so we know which tasks to execute
- 2026-09-05-003-T04: Git seam must exist so later tasks can integrate commits with task execution

## Notes

- **`generate()` deliberately survives this task as the thin loop.** Deleting it here would leave 
  `agent/src/index.ts` and its 599-line test red at a commit boundary, and every commit in the split 
  must be green. T10 removes it in the same change that stops calling it.
- **Dependency outputs are read from disk, not from memory.** The design assumes each task's output is 
  persisted to `--out` before the next task runs. This makes the design resilient to task failures 
  and allows for offline testing.
- **The `missing_dependency_output` code is part of the `failureReason` vocabulary.** U7's recording 
  step consumes the `TaskResult` shape; add this code to the documented reason vocabulary rather 
  than inventing a second result type.
- **No exception is thrown on missing dependencies.** The executor returns the typed `TaskResult` 
  and lets the caller decide how to respond (record, gate, commit, etc.).
