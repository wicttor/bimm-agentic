---
id: 2026-09-05-003-T05
title: "Extract executeTask: one task, dependency outputs read from disk"
plan-id: 2026-09-05-003
unit: U5
tier: deep
status: not-started
priority: P1
dependencies: []
files:
  create:
    - agent/tests/execute-task.test.ts
  modify:
    - agent/src/generator.ts
  test:
    - agent/tests/execute-task.test.ts
estimated-effort: "2 hours"
timestamp: 2026-09-05T18:45:00Z
---

# Extract executeTask: one task, dependency outputs read from disk

## Goal

`generate()` carries cross-task state in a `Map` that dies with the process. The split needs the
opposite: a unit that executes **one** task and gets everything it needs about the others from the
committed output directory.

## Acceptance Criterion

`executeTask` runs exactly one task through the agent loop with dependency file contents read from the output directory on disk, types an absent dependency file as `missing_dependency_output`, and `generate` is re-expressed as a thin in-process loop over it so no per-task logic exists twice

## Steps

1. **Red — Write the failing test:** create `agent/tests/execute-task.test.ts`: seed a temp out dir with a dependency's file, then assert the executor request's prompt contains that on-disk content; delete the dependency file and assert `{ok:false, failureReason:"missing_dependency_output"}` with the provider never called (spy at zero); pass a `taskArtifacts` entry and assert `result.taskArtifact` is the artifact path and the ask is prefixed with its task id; and assert `generate([a,b])` issues exactly two provider calls whose prompts are identical to two sequential `executeTask` calls. Confirm failures.
2. **Green — Implement:** lift the per-task body of `generate()`'s `for` loop into `export async function executeTask(spec, rules, provider, toolContext, task, options): Promise<TaskResult>`, replacing `generatedFiles.get(dep)` with a read of `join(toolContext.outDir, dep)`; keep the context builder, the budget elision, and `buildGeneratorPrompt` exactly where they are; reduce `generate()` to `for (const t of plan) results.push(await executeTask(...))`.
3. **Refactor:** one owner for the summarising — move `successCount`/`failureCount`/`failedTasks` onto the loop that still runs many tasks, so `TaskResult` stays about a single task.

## Test Scenarios

- Dep on disk → its contents appear in the prompt
- Dep missing → `missing_dependency_output`, provider calls zero
- Single task → exactly one provider turn, `writtenFiles` reported
- Parity: `generate` and two `executeTask` calls produce the same prompts and the same summary counts

## Acceptance Criteria

- [ ] `executeTask` runs exactly one task through the agent loop with dependency file contents read from the output directory on disk, types an absent dependency file as `missing_dependency_output`, and `generate` is re-expressed as a thin in-process loop over it so no per-task logic exists twice

## Dependencies

- None

## Notes

- `generate()` deliberately survives this task as the thin loop. Deleting it here would leave `agent/src/index.ts` and its 599-line test red at a commit boundary, and every commit in the split must be green. T10 removes it, in the same change that stops calling it.
- The prior task artifact's `TaskResult` shape (`task`, `ok`, `writtenFiles`, `taskArtifact`, `failureReason`, `log`) is what U7's recording step consumes: add `missing_dependency_output` to the documented reason vocabulary rather than inventing a second result type.
