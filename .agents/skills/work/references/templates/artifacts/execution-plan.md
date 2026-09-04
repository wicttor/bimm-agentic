---
title: Execution Plan Artifact
description: Template for the Execution Plan produced by the Prepare phase. Carries the ordered execution-list, selected execution mode, test runner + packageManager, baseline policy, applicable gates, and resume/blocked/skip policy; consumed by Execute.
type: template
version: 1.0
timestamp: "2026-08-07"
---

# Execution Plan Artifact

The product of the **Prepare** phase is an Execution Plan: an ordered `execution-list` to run, the selected `executionMode`, the resolved test `runner` (+ `packageManager` for Node.js), the `baseline` policy and any known-failing snapshot, and the `applicable-gates` + thresholds (recorded read-only from [task-execution-rules.md](../../task-execution-rules.md)). Execute consumes it.

## Schema

```yaml
prepare-id: YYYY-MM-DD-NNN-prepare
triage-id: YYYY-MM-DD-NNN-triage
work-id: YYYY-MM-DD-NNN
work-branch: work/<short-description> | null   # inherited from the Work Manifest
input-shape: plan-based | task-file | ad-hoc
interactionMode: detailed | smart | autopilot
executionMode: inline | serial | parallel
status: complete
timestamp: ISO-8601 timestamp

test-environment:
  runner: npm | pnpm | pytest | go | cargo | rspec | phpunit | mvn | gradle | unknown
  packageManager: npm | pnpm | null     # Node.js only
  test-command: "[resolved test invocation pattern]"

baseline:
  state: green | red | snapshot-and-continue
  known-failing-snapshot: [test-path or test-id, ...]   # only when state == snapshot-and-continue

execution-list:                          # flat for inline/serial; wave-grouped for parallel
  inline | serial:
    - <task-id>
    - <task-id>
  parallel:
    waves:
      - [  <task-id>, ... ]   # Wave 0 (independent)
      - [  <task-id>, ... ]   # Wave 1 (depends on Wave 0)
upstream-skipped: false | true           # task-file "Proceed anyway" only

applicable-gates: [red, green, refactor, complete]   # the gates Execute enforces (read-only)
retry-limit: 2                            # task-scoped; authorized in task-execution-rules.md

policy:                                  # recorded read-only from task-execution-rules.md; not re-derived
  resume: "completed skipped; blocked/skipped carried; in-progress re-enters; not-started runs"
  blocked: "green-not-reached-within-retry-limit -> status blocked + reason; checkbox stays -[]"
  skip: "explicit user confirm only -> status skipped + reason; checkbox stays -[]"
  complete: "refactor green -> status completed; checkbox -[x]; index tick -[x]"
  regression: "snapshot-and-continue ignores known-failing-snapshot; green requires no NEW failure"

work-state: ready | nothing-ready         # echoes the Work Manifest if carried through
```

Also save the Execution Plan to `docs/plans/.work/.prepare/<prepare-id>.md`.

## Validation Rules

- **prepare-id:** Required. Format `YYYY-MM-DD-NNN-prepare`.
- **triage-id, work-id, work-branch, input-shape:** Required, inherited from Triage (cross-phase consistency).
- **interactionMode, executionMode:** Both required. `executionMode` must respect the risk floor in [execution-mode-selection.md](../../execution-mode-selection.md) (any HIGH-risk task → `inline`).
- **test-environment.runner:** Required; `unknown` only allowed when the user was asked to supply the command (Prepare should normally resolve it).
- **test-environment.packageManager:** Required for Node.js (`npm` | `pnpm`), else `null`.
- **baseline.state:** Required. `red` without `snapshot-and-continue` is invalid here (Prepare must resolve the policy first).
- **execution-list:** Required. Preserves the manifest's dependency order; wave-grouping (if `parallel`) respects dependency layers. Empty only when `work-state: nothing-ready`.
- **applicable-gates, retry-limit, policy:** Required, recorded **read-only** from [task-execution-rules.md](../../task-execution-rules.md) — Execute enforces them; Prepare must not re-encode altered definitions.
- **status:** Required. `complete`.

## Example (serial, green baseline)

```yaml
prepare-id: 2026-08-07-002-prepare
triage-id: 2026-08-07-001-triage
work-id: 2026-07-10-001
work-branch: work/redis-session-store
input-shape: plan-based
interactionMode: smart
executionMode: serial
status: complete
timestamp: 2026-08-07T14:35:00Z
test-environment:
  runner: pnpm
  packageManager: pnpm
  test-command: "pnpm test -- <test-path>"
baseline:
  state: green
  known-failing-snapshot: []
execution-list:
  - 2026-07-10-001-T01
  - 2026-07-10-001-T02a
  - 2026-07-10-001-T02b
upstream-skipped: false
applicable-gates: [red, green, refactor, complete]
retry-limit: 2
policy:
  resume: "completed skipped; blocked/skipped carried; in-progress re-enters; not-started runs"
  blocked: "green-not-reached-within-retry-limit -> status blocked + reason"
  skip: "explicit user confirm only -> status skipped + reason"
  complete: "refactor green -> status completed; checkbox -[x]; index tick -[x]"
  regression: "green requires no NEW failure (snapshot empty for green baseline)"
work-state: ready
```

## Notes

- The orchestrator's quality gate #2 cross-checks `interactionMode` and `executionMode` are identical across Prepare/Execute/Review artifacts.
- `upstream-skipped: true` is set only for the task-file shape when the user chose "Proceed anyway" (Triage Step 2b); the execution-list then contains just that single task.
- Gate/policy values are **read-only** here: Execute enforces the definitions in [task-execution-rules.md](../../task-execution-rules.md); Prepare must not redefine them (single-source-of-truth).