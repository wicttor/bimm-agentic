---
title: Task Execution Rules
description: Authoritative reference for the Execute phase (and the gates Prepare records). Defines the per-task Red/Green/Refactor gates, the retry-limit and blocked-transition policy, the resume policy, the skip transition, and the snapshot-and-continue regression policy. Execute and Prepare defer to these definitions; neither re-encodes them.
type: reference
version: 1.0
timestamp: "2026-08-07"
---

# Task Execution Rules

Authoritative reference for the **Execute** phase and the per-task gates Prepare records. Defines the per-task **Red/Green/Refactor** gates, the **retry-limit** and **blocked** transition, the **resume** policy, the **skip** transition, and the **snapshot-and-continue** regression policy. Execute enforces these; Prepare records the applicable set and thresholds read-only; neither re-encodes them.

## Core Invariants (inherited from `/plan`)

- **One Acceptance Criterion per task** — each task carries exactly one AC and exactly one `files.test` asserting it.
- **Test-first** — every task runs Red → Green → Refactor; the failing test is written and confirmed **before** implementation.
- **Idempotent status** — `completed` tasks are never re-opened and index checkboxes are ticked forward only (never reset).

## Per-Task Gates

| Gate      | Criteria (authoritative)                                                                                                       | On pass                          | On fail                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- | --------------------------- |
| **Red**   | The new test at `files.test[0]` exists and **fails for the right reason** — the assertion matching the AC fires; not a setup/import/compile error. On resume, if the test already passes, the task may already be done (re-check the AC). | Proceed to Green | If it passes immediately: re-check AC → may be `completed`; if setup error: log and fix the test |
| **Green** | The task's single AC test now passes **and** there is no new regression beyond the Prepare baseline (see Regression Policy).   | Proceed to Refactor              | Increment retry; on retry-limit → `blocked` |
| **Refactor** | Cleanup of naming/duplication/structure; the AC test stays green **and** no regression. No behavior change.               | Complete transition             | Revert the refactor; retry once; then `blocked` |

## Retry-Limit and Blocked Transition

- **Default retry-limit per task: 2** attempts to reach Green from a confirmed Red.
- Reaching the limit without Green transitions the task to **`blocked`**:
  - Set frontmatter `status: blocked` with a recorded `reason` (the failing assertion snapshot, which gate failed, the last error).
  - Leave the index checklist as `- [ ]` and append `— blocked: <reason>`.
  - Per the execution mode: `inline`/`serial` pause and surface; `parallel` blocks only dependents in later waves.
- A `blocked` task is **not auto-retried** on resume — it is carried with its reason (see Resume Policy). To retry it, the user re-runs Work and explicitly proceeds (the task's `status` is reset to `not-started` only on an Edit & Retry of Triage/Prepare).

## Resume Policy (authoritative)

On re-entry (re-running Work), before running each task, read its task-file frontmatter `status`:

| status        | Action on resume                                                          |
| ------------- | ------------------------------------------------------------------------- |
| `completed`   | Skip (never re-open); checkbox stays `- [x]` (never reset)               |
| `blocked`     | Carry with recorded reason; not auto-retried                              |
| `skipped`     | Carry with recorded reason; not auto-retried                              |
| `in-progress` | Re-enter the cycle at the appropriate gate (the last-run gate); do not tick the checkbox until a gate passes |
| `not-started` | Run the full Red → Green → Refactor cycle                                 |

The orchestrator's quality gate #4 requires the end state to be coherent: no task left `in-progress`; the index checklist matches task files.

## Skip Transition

- Skipping a task requires **explicit user confirmation** — never auto-skip.
- Set frontmatter `status: skipped` with a recorded `reason`.
- Leave the index checkbox as `- [ ]` and append `— skipped: <reason>`.
- A `skipped` task is not auto-retried on resume (Resume Policy).

## Complete Transition

When the Refactor gate passes:
- Set frontmatter `status: completed`.
- Flip the task file's `## Acceptance Criteria` checkbox to `- [x]`.
- In `docs/tasks/<work-id>/index.md`, tick that task's row from `- [ ]` to `- [x]` (forward only).

## Snapshot-and-Continue Regression Policy (authoritative)

When Prepare recorded `baseline: snapshot-and-continue` (the suite was red at baseline), a Prepare-recorded **known-failing test set** is the snapshot. Execute's regression gate behaves as follows:

- A failing test in the snapshot is **not** a regression (it was already failing).
- A **new** failing test (not in the snapshot) **is** a regression and fails the Green/Refactor gate.
- A snapshot test that now **passes** is an improvement, not a regression (do not block on it; record it for Review).

When `baseline: green`, the snapshot is empty — any failure is a regression.

When `baseline: red` without a snapshot-and-continue decision, Prepare must resolve the policy before Execute runs (it is a Prepare Smart pause trigger).

## Mid-Task Interruption

If Execute is interrupted mid-task:
- Set frontmatter `status: in-progress` (so a resume re-enters the cycle at the right gate).
- Do **not** tick the checkbox.
- On resume, re-enter at the last-attempted gate for that task.

## Per-Task Execution Cycle (Execute Step 3 follows this)

```
for each runnable task (status not-started | in-progress):
  gate Red:
    write/confirm the AC test at files.test[0]
    run it; assert it fails for the right reason
    if passes immediately -> re-check AC (may be completed on resume)
  gate Green:
    implement minimum code in files.create / files.modify
    run the AC test; assert green with no new regression (snapshot policy)
    on fail -> increment retry; on retry-limit -> blocked
  gate Refactor:
    clean up; re-run the AC test; assert green with no regression
    on fail -> revert refactor; retry once -> else blocked
  complete transition:
    status -> completed; checkbox -> - [x]; index ticked - [ ] -> - [x]
```

## Failure-Condition Reference

| Trigger                                                | Outcome per this reference                                  |
| ------------------------------------------------------ | ----------------------------------------------------------- |
| Red passes immediately on a `not-started` task         | Re-check AC; if genuinely satisfied, mark `completed`      |
| Green not reached within retry-limit (2)                | Task → `blocked` with reason + assertion snapshot          |
| Refactor introduces a regression                        | Revert the refactor; retry once; then `blocked`            |
| New regression on a `completed` task's Refactor re-run   | Surfaced as a Review Smart pause trigger (do not auto-mark) |
| Runner command fails (not an assertion failure)         | Category 6 recovery per [error-handling.md](error-handling.md) |

## Notes

- This reference is the single source of truth for gate criteria, the retry-limit, blocked/skip/complete/resume transitions, and the snapshot-and-continue regression policy.
- Prepare records the applicable set and thresholds **read-only** in the Execution Plan; Execute enforces them; Review verifies they were enforced (not re-defined inline).
- The 2-attempt default mirrors the per-phase retry-limit philosophy in [error-handling.md](error-handling.md) but is task-scoped (a blocked task is not a phase termination).