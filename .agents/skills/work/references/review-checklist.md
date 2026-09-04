---
title: Review Checklist
description: Authoritative reference for the Review phase. Defines the simplification, consolidation, scope-creep, regression, and learnings-capture checks Review applies across the completed tasks' changed files. Review applies the checklist; it does not re-encode it.
type: reference
version: 1.0
timestamp: "2026-08-07"
---

# Review Checklist

Authoritative reference for the **Review** phase. Defines the checks Review applies across the `completed` tasks' changed files (`files.create` / `files.modify`). Review applies the checklist; it does not re-encode it. Each check is run as a **refactor** — the relevant tasks' AC tests must stay green; any check that would change behavior is routed to scope-creep handling, not applied here.

## Simplification Checks

Run across the union of completed tasks' `files.create` / `files.modify`:

| Check                | Criteria (authoritative)                                                           | Apply as        |
| -------------------- | ---------------------------------------------------------------------------------- | --------------- |
| Dead code            | Code made unreachable by the run (unused exports, unreachable branches, vestigial helpers) is removed. | refactor        |
| Duplication (DRY)    | Repeated logic across the changed files is extracted into one shared helper/abstraction. | refactor        |
| Naming               | Identifiers are intention-revealing; no cryptic or misnamed symbols introduced.     | refactor        |
| Function/class size   | Functions/classes do one thing; overlarge units are collapsed to single responsibility. | refactor        |
| Speculative generality | No added abstractions/parameters with no current consumer.                       | refactor (remove) |
| Commented-out code   | No commented-out code or dead scaffolding left behind.                             | refactor (remove) |

Record `simplification-summary` (what was simplified/clipped) and `consolidations` (any merged logic / extracted abstractions) in the Work Report.

## Consolidation Checks

| Check                    | Criteria                                                                          | Apply as   |
| ------------------------ | --------------------------------------------------------------------------------- | ---------- |
| Shared logic extraction  | Two+ completed tasks introduced parallel logic; extract to a shared, tested unit.  | refactor   |
| Public-API minimization  | Public surface area is minimal; depend on abstractions, not concretions.         | refactor   |
| Import boundary hygiene  | Side effects isolated at boundaries; inner functions kept pure where the change permits. | refactor |

A consolidation that would change behavior is **not** applied here — it becomes a scope-creep finding (the user decides whether to accept it as a follow-up task).

## Regression Check (authoritative for the suite comparison)

Run the full affected-scope suite (union of completed tasks' test paths + any modified files covered elsewhere) using the Execute-resolved command. Compare against the Prepare baseline:

| baseline               | Clean condition                                                 | Regression condition           |
| ---------------------- | --------------------------------------------------------------- | ------------------------------ |
| `green`                | Suite is still green                                            | Any failure is a regression    |
| `snapshot-and-continue`| Failures are a **subset** of the recorded known-failing snapshot | Any **new** failure is a regression |

Record `regression-check: clean | regressions-found` with the failing-test list if any. A regression on a `completed` task is a Review Smart pause trigger.

## Scope-Creep Checks (authoritative)

| Check                | Criteria (authoritative)                                                                              | Outcome                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Per-task scope       | A `completed` task's `files.create`/`files.modify` edits are bounded by **that task's single AC**. Edits beyond the AC (extra files, behavior not asserted by `files.test`) are scope creep. | Record per task: file path + why it exceeds the AC |
| Manifest scope      | No task was added, removed, or silently expanded beyond what Triage resolved. (`dependency-warning: expanded-to-upstream` from the task-file shape is expected, not creep.) | Record any deviation                     |

Record `scope-creep: none` or the per-task findings. Surface creep to the user — never fold it silently into a task.

## Learnings-Capture Checks

For each notable finding, record a learning candidate:

| Finding type       | When to capture                                              | Fields                                            |
| ------------------ | ------------------------------------------------------------ | ------------------------------------------------- |
| Confirmed pattern   | A codebase pattern was confirmed during execution            | title, domain, source (task-id + gate), summary   |
| Refuted assumption  | An assumption from Triage/Prepare was contradicted           | title, domain, source, summary                    |
| Gotcha hit          | A recurring trap was encountered (e.g., a flaky test class) | title, domain, source, summary                    |
| Forced decision     | The run forced a non-obvious decision                       | title, domain, source, summary                   |

Also carry forward the Work Manifest's `Learning Gaps` and add any gaps the run revealed (e.g., a missing test pattern that forced a workaround) to `learning-gaps`.

Record `learnings-to-capture` (candidates, handed to `/learn` — Work does not write `docs/learn/` directly) and the updated `learning-gaps` in the Work Report.

## Final work-state (Review derives from the Execution Log)

| work-state    | Condition                                                                     |
| ------------- | ----------------------------------------------------------------------------- |
| `complete`    | All tasks `completed` **and** regression-check `clean`                        |
| `partial`     | Some tasks `blocked`/`skipped` but progress was made                          |
| `nothing-done`| Empty run (`work-state: nothing-ready` carried through) or all tasks blocked early |

## Failure Conditions

| Trigger                                        | Recovery                                                  |
| ---------------------------------------------- | --------------------------------------------------------- |
| A simplification check would change behavior   | Route to scope-creep; do not apply as a refactor          |
| Regression found on a `completed` task          | Smart pause trigger; user decides accept or roll back      |
| Scope creep detected                            | Surface to user; do not fold silently into a task           |
| Task-status incoherent at Review Step 0         | Category 2 recovery per [error-handling.md](error-handling.md) — re-run Execute |

## Notes

- This reference is the single source of truth for the simplification/consolidation/scope-creep/regression/learnings checks. Review applies it; Prepare and Execute do not re-encode it.
- Every applied change here is a **refactor**: AC tests stay green, no behavior change. Behavior-changing ideas become scope-creep findings for the user to accept as a follow-up.
- Learnings are surfaced for `/learn` to persist; Work never writes `docs/learn/` directly.