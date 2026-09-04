---
title: Error Handling & Recovery
description: Reference for all Work Skill phases (Triage, Prepare, Execute, Review). Defines the Step 0 artifact verification procedure, per-type required fields, error categories, recovery workflow, retry limits, and cross-phase consistency checks.
type: reference
version: 1.0
timestamp: "2026-08-07"
---

# Error Handling & Recovery

This file documents the error handling and recovery strategies shared across all Work Skill phases (Triage, Prepare, Execute, Review). Each phase begins with a **Step 0: Verification** that validates the incoming artifact; this reference defines the validation rules, recovery actions, and termination conditions.

## Core Principle

**Fail explicitly, never silently.** When an artifact is missing, malformed, or inconsistent, the phase must surface a clear error with a recovery suggestion rather than guessing or proceeding with bad data. Silent failures cascade downstream and produce invalid work runs. The one recognized exception is a *missing learnings index* (Triage Step 5), which logs a single explicit warning rather than failing — but this is a deliberate non-block, not a silent no-op.

## Step 0: Artifact Verification

Every phase receives an artifact from the previous phase (or the Orchestrator, for Triage). Step 0 validates the artifact before any work begins.

### Verification Procedure

```
1. Confirm the artifact exists and is non-empty
2. Confirm the required frontmatter fields are present and well-formed
3. Confirm the artifact type matches the expected phase input
4. Confirm interactionMode is present and valid (default to "smart" if missing)
5. Confirm cross-phase IDs match the upstream artifacts
```

### Required Fields by Artifact Type

| Artifact Type   | Required Fields                                                                                                                                                                                                    | Produced By  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `work-input`    | `type`, `timestamp`, `source`, `status`, input shape (`plan-id` **or** `task-file` **or** `ad-hoc` description), `interactionMode`                                                                                | Orchestrator |
| `work-manifest` | `triage-id`, `work-id`, `work-branch`, `input-shape`, `status`, `interactionMode`, resolved task list, `ready-tasks` | Triage       |
| `execution-plan`| `prepare-id`, `triage-id`, `work-id`, `work-branch`, `input-shape`, `status`, `interactionMode`, `executionMode`, `execution-list`, `runner`, `baseline`, `applicable-gates`                                                      | Prepare      |
| `execution-log` | `execute-id`, `prepare-id`, `triage-id`, `work-id`, `work-branch`, `input-shape`, `status`, `interactionMode`, `executionMode`, per-task result table, aggregator counts                                                          | Execute      |
| `work-report`   | `review-id`, `execute-id`, `prepare-id`, `triage-id`, `work-id`, `work-branch`, `input-shape`, `status`, `interactionMode`, `executionMode`, task-outcome rollup, `regression-check`, `scope-creep`                               | Review       |

## Error Categories

### Category 1: Missing Artifact

The expected input artifact was not provided by the Orchestrator or previous phase.

| Trigger                           | Recovery Action                                               | Terminate?         |
| --------------------------------- | ------------------------------------------------------------- | ------------------ |
| Artifact object is null/undefined | Ask Orchestrator to re-run previous phase                     | Yes, after 1 retry |
| Artifact file path does not exist | Log warning; ask user to locate file or re-run previous phase | No                 |
| Artifact file is empty (0 bytes)  | Re-run previous phase from its saved context                  | Yes, after 1 retry |

### Category 2: Malformed Artifact

The artifact exists but is missing required fields or has invalid structure.

| Trigger                                       | Recovery Action                                             | Terminate? |
| --------------------------------------------- | ----------------------------------------------------------- | ---------- |
| Missing required frontmatter field            | Re-run previous phase to regenerate artifact                | No         |
| `interactionMode` missing or invalid          | Default to `smart`; log warning; continue                   | No         |
| `executionMode` missing or invalid (Prepare+)| Default per execution-mode-selection.md; log warning         | No         |
| `status` field is `failed` or `pending`       | Reject; ask Orchestrator to re-run previous phase           | Yes        |
| Artifact `type` does not match expected input | Reject; ask Orchestrator to check phase ordering            | Yes        |
| YAML frontmatter has syntax errors            | Log error with line number; ask user to fix or re-run phase | No         |

### Category 3: Invalid Work Input

Only applies to the Triage phase (Step 0) when resolving a Work Input Artifact.

| Trigger                                              | Recovery Action                                            | Terminate? |
| ---------------------------------------------------- | --------------------------------------------------------- | ---------- |
| All three input shapes empty or ambiguous            | Ask: "What would you like to work on? plan-id, task file, or describe." | No         |
| Plan-based `plan-id` with no `docs/tasks/<id>/index.md` | Ask to run `/plan <id>` first, or switch to ad-hoc       | No         |
| Task-file path does not resolve to exactly one file   | Ask user to disambiguate or supply the task-id            | No         |
| Ad-hoc description empty or unobservable              | Ask: "What should happen after this is done?"             | No         |

### Category 4: File System Errors

Errors encountered while saving or reading artifact files.

| Trigger                                          | Recovery Action                                                   | Terminate?         |
| ------------------------------------------------ | ----------------------------------------------------------------- | ------------------ |
| Target directory does not exist                  | Create directory (`mkdir -p`); treat counter as 0; start from 001 | No                 |
| Counter directory exists but no files match date | Start counter at 001                                              | No                 |
| File write permission denied                     | Log error; ask user to check permissions; retry once              | Yes, after 1 retry |
| Task directory `docs/tasks/<work-id>/` missing   | Create it (ad-hoc); for plan-based, ask to run `/plan` first      | No                 |
| Index `docs/tasks/<work-id>/index.md` missing    | Create empty index; append the section (idempotent on `review-id`) | No               |

### Category 5: Interaction Mode Errors

Errors related to `interactionMode` propagation.

| Trigger                                  | Recovery Action                                            | Terminate? |
| ---------------------------------------- | ---------------------------------------------------------- | ---------- |
| Mode missing from incoming artifact      | Default to "smart"; log warning; continue                  | No         |
| Mode value is not in enum                | Reject; re-prompt Orchestrator to set valid mode            | Yes        |
| User selects "Abort" during confirmation | Stop immediately; inform Orchestrator of abort with reason   | Yes        |
| User does not respond (timeout)          | Pause; ask user to retry or abort                          | No         |

### Category 6: Execution Errors (Execute phase)

| Trigger                                              | Recovery Action                                                    | Terminate? |
| ---------------------------------------------------- | ------------------------------------------------------------------ | ---------- |
| Task's Green gate not reached within retry-limit      | Mark task `blocked` with reason + assertion snapshot; pause per mode | No         |
| Test runner command fails to execute (not an assertion failure) | Ask user to verify runner/packageManager; category-2 recovery | No         |
| Dependency install fails during a Green step         | Log error; retry once; then mark task `blocked`                    | No         |
| New regression beyond baseline snapshot on a completed task | Surface as Review Smart pause trigger; do not auto-mark blocked | No         |

Initial values: a task starts `not-started`; Execute sets `in-progress` mid-task, then transitions to `completed`, `blocked`, or `skipped`. Only `completed` ticks the index checkbox.

### Category 7: Git / Branch Errors

Errors from Work Branch Creation (Triage Step 2d).

| Trigger                                                      | Recovery Action                                                                                                       | Terminate?                |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Working directory is not a git repository                    | Log one explicit warning; record `work-branch: null`, `work-branch-state: not-a-git-repo`; continue without a branch  | No                        |
| Dirty working tree (uncommitted changes)                      | Fail branch creation with an explicit error; ask the user: commit/stash & retry, proceed without a work branch, or abort | Yes (unless user picks proceed) |
| Branch slug cannot be derived (vague ad-hoc description)      | Ask the user for a short kebab-case slug for `work/<slug>`                                                             | No                        |
| Current HEAD is not the default branch at creation            | Smart pause; ask which base to branch from (default branch / current HEAD / abort); autopilot: default branch + warning | No                        |
| Branch checkout/create fails (permissions, lock, etc.)        | Log error; retry once; then terminate with a suggestion                                                                 | Yes, after 1 retry        |

## Recovery Workflow

When a verification failure is detected in Step 0, apply this workflow:

```
1. Identify the error category (1-7) from the tables above
2. Look up the specific trigger to find the recovery action
3. Execute the recovery action:
   - If recovery is "ask user": ask one question with clear options (2-4 concrete choices)
   - If recovery is "re-run previous phase": return to Orchestrator with error context
   - If recovery is "default and continue": apply default, log warning, proceed
4. If terminate = Yes: stop and inform Orchestrator with:
   - Error category and trigger
   - Recovery action attempted
   - Reason for termination
5. If terminate = No: after recovery, continue to Step 1 of the phase
```

## Retry Limits

- **Maximum retries per error:** 1
- **Maximum total retries per phase:** 2
- **Per-task Green-gate retry-limit:** defined in [task-execution-rules.md](task-execution-rules.md) (authoritative); reaching it transitions the task to `blocked`, not a phase termination.
- After exhausting phase retries, terminate with a clear error suggesting the user re-run the work workflow from the start or resume from the last complete phase.

## Error Reporting Format

When reporting an error to the Orchestrator or user, use this format:

```yaml
error:
  phase: triage | prepare | execute | review
  step: 0 | 1 | 2 | ...
  category: 1 | 2 | 3 | 4 | 5 | 6
  trigger: "[specific trigger description]"
  recovery_attempted: "[action taken]"
  outcome: recovered | terminated
  suggestion: "[next step for the user or Orchestrator]"
```

## Cross-Phase Consistency Checks

The Orchestrator should verify consistency between phases:

| Check                                                                 | Action on Failure                           |
| --------------------------------------------------------------------- | ------------------------------------------- |
| `work-id` in downstream artifact matches the Triage output            | Reject; re-run from Triage                  |
| `triage-id` in Prepare+ matches Triage output                         | Reject Prepare; re-run from Triage          |
| `prepare-id` in Execute+ matches Prepare output                      | Reject Execute; re-run from Prepare         |
| `execute-id` in Review matches Execute output                        | Reject Review; re-run from Execute          |
| `interactionMode` is identical across all artifacts                   | Log warning; use earliest non-default value |
| `executionMode` is identical across Prepare/Execute/Review artifacts | Log warning; re-run Prepare                 |
| `work-branch` in downstream artifacts matches the Triage manifest     | Reject; re-run from Triage                  |

## Notes

- All errors and warnings should be logged with a timestamp for debugging.
- When a phase terminates, its saved artifact (if any) should be marked `status: failed`.
- The Orchestrator is responsible for deciding whether to retry the entire workflow or resume from the last successful phase.
- ID assignment and re-use (including recycle-on-edit) is defined in [id-generation.md](id-generation.md); this reference covers only verification and recovery.
- This reference is shared by all four phases; phase-specific handling is documented inline in the respective module.