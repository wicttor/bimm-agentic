---
title: Error Handling & Recovery
description: Reference for all Review Skill phases (Scope, Prepare, Analyze, Report). Defines the Step 0 artifact verification procedure, per-type required fields, error categories, recovery workflow, retry limits, and cross-phase consistency checks.
type: reference
version: 1.0
timestamp: "2026-08-08"
---

# Error Handling & Recovery

This file documents the error handling and recovery strategies shared across all Review Skill phases (Scope, Prepare, Analyze, Report). Each phase begins with a **Step 0: Verification** that validates the incoming artifact; this reference defines the validation rules, recovery actions, and termination conditions.

## Core Principle

**Fail explicitly, never silently.** When an artifact is missing, malformed, or inconsistent, the phase must surface a clear error with a recovery suggestion rather than guessing or proceeding with bad data. Silent failures cascade downstream and produce invalid reviews. The one recognized exception is a *missing learnings index* (Scope Step 5), which logs a single explicit warning rather than failing — but this is a deliberate non-block, not a silent no-op. A second deliberate non-block is a *missing requirements source* (`requirements-source: none`), which is a legitimate review input that skips the scope-creep category by design, not an error.

## Step 0: Artifact Verification

Every phase receives an artifact from the previous phase (or the Orchestrator, for Scope). Step 0 validates the artifact before any work begins.

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
| `review-input`  | `type`, `timestamp`, `source`, `status`, input shape (`change-set` **or** `work-id`/Work `review-id` **or** `ad-hoc`), `interactionMode`                                                                          | Orchestrator |
| `review-scope`  | `scope-id`, `review-id`, `input-shape`, `status`, `interactionMode`, `change-boundary` (`required` + `context` + `attribution`), `requirements-source`, `preliminary-scope-creep`                                  | Scope        |
| `review-kit`    | `prepare-id`, `scope-id`, `review-id`, `input-shape`, `status`, `interactionMode`, `diffs`, `spec-content` (or `none`), `test-context`, `tool-inventory`                                                          | Prepare      |
| `findings`      | `analyze-id`, `prepare-id`, `scope-id`, `review-id`, `input-shape`, `status`, `interactionMode`, findings list, per-category tallies, per-severity tallies                                                        | Analyze      |
| `review-report` | `report-id`, `analyze-id`, `prepare-id`, `scope-id`, `review-id`, `input-shape`, `status`, `interactionMode`, `approval-status`, findings rollup, `recommendations`, `scope-creep-summary`                       | Report       |

## Error Categories

### Category 1: Missing Artifact

The expected input artifact was not provided by the Orchestrator or previous phase.

| Trigger                           | Recovery Action                                               | Terminate?         |
| --------------------------------- | ------------------------------------------------------------- | ------------------ |
| Artifact object is null/undefined | Ask Orchestrator to re-run previous phase                     | Yes, after 1 retry |
| Artifact file path does not exist | Log warning; ask user to locate file or re-run previous phase | No                 |
| Artifact file is empty (0 bytes)   | Re-run previous phase from its saved context                  | Yes, after 1 retry |

### Category 2: Malformed Artifact

The artifact exists but is missing required fields or has invalid structure.

| Trigger                                       | Recovery Action                                             | Terminate? |
| --------------------------------------------- | ----------------------------------------------------------- | ---------- |
| Missing required frontmatter field            | Re-run previous phase to regenerate artifact                | No         |
| `interactionMode` missing or invalid          | Default to `smart`; log warning; continue                   | No         |
| `status` field is `failed` or `pending`       | Reject; ask Orchestrator to re-run previous phase           | Yes        |
| Artifact `type` does not match expected input | Reject; ask Orchestrator to check phase ordering            | Yes        |
| YAML frontmatter has syntax errors            | Log error with line number; ask user to fix or re-run phase | No         |
| Findings coherence violated (Step 0 of Report) | Re-run Analyze — a finding lacks severity/category/location/trace | No    |

### Category 3: Invalid Review Input

Only applies to the Scope phase (Step 0) when resolving a Review Input Artifact.

| Trigger                                              | Recovery Action                                            | Terminate? |
| ---------------------------------------------------- | --------------------------------------------------------- | ---------- |
| All three input shapes empty or ambiguous            | Ask: "What would you like to review? git ref/range, work-id, or describe." | No         |
| Change-set spec parses but the repo is not a git working tree | Ask to switch to ad-hoc input                        | No         |
| Change-set diff is empty (spec touches no files)      | Record `change-boundary.empty: true`; continue (Report records nothing-to-review) | No |
| Work-linked `work-id` with no `docs/tasks/<id>/index.md` | Ask to run `/work <work-id>` first, or switch to change-set | No    |
| Work-linked Work `review-id` file missing             | Ask to switch to the `work-id` of that run                 | No         |
| Ad-hoc description maps to no concrete files/commits  | Ask the user to name a file, module, or path               | No         |

### Category 4: File System Errors

Errors encountered while saving or reading artifact files.

| Trigger                                          | Recovery Action                                                   | Terminate?         |
| ------------------------------------------------ | ----------------------------------------------------------------- | ------------------ |
| Target directory does not exist                  | Create directory (`mkdir -p`); treat counter as 0; start from 001 | No                 |
| Counter directory exists but no files match date | Start counter at 001                                              | No                 |
| File write permission denied                     | Log error; ask user to check permissions; retry once              | Yes, after 1 retry |
| `docs/review/index.md` registry missing  | Create it with a `# Reviews` header (Pre-Flight already creates; idempotent) | No     |
| `docs/tasks/<work-id>/index.md` missing (Report cross-link) | Skip the cross-link; note the absence in the report (do not fabricate a work index) | No |

### Category 5: Interaction Mode Errors

Errors related to `interactionMode` propagation.

| Trigger                                  | Recovery Action                                            | Terminate? |
| ---------------------------------------- | ---------------------------------------------------------- | ---------- |
| Mode missing from incoming artifact      | Default to "smart"; log warning; continue                  | No         |
| Mode value is not in enum                | Reject; re-prompt Orchestrator to set valid mode            | Yes        |
| User selects "Abort" during confirmation | Stop immediately; inform Orchestrator of abort with reason   | Yes        |
| User does not respond (timeout)          | Pause; ask user to retry or abort                          | No         |

### Category 6: Analysis Errors (Analyze phase)

| Trigger                                              | Recovery Action                                                    | Terminate? |
| ---------------------------------------------------- | ------------------------------------------------------------------ | ---------- |
| No review categories produced (empty Findings unexpectedly) | Re-run Analyze Step 1; confirm the kit's diffs were non-empty | No         |
| A finding lacks a `trace` or `scope-creep` flag (coherence) | Reject the findings set; re-run Analyze Steps 1–3                | No         |
| Tool corroboration fails (tool unavailable/unconfigured) | Proceed without corroboration; note it on the finding (Prepare already warned) | No |
| Scope-creep category emitted findings with `spec-content: none` | Reject; re-run Analyze — scope-creep requires requirements       | No         |

## Recovery Workflow

When a verification failure is detected in Step 0, apply this workflow:

```
1. Identify the error category (1-6) from the tables above
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
- After exhausting phase retries, terminate with a clear error suggesting the user re-run the review workflow from the start or resume from the last complete phase.

> Review is **not resume-safe** like Work execution: re-running Review re-derives findings fresh because the change set may have evolved. The retry limits above apply to within-phase recovery of a malformed/missing artifact, not to resuming an interrupted review run.

## Error Reporting Format

When reporting an error to the Orchestrator or user, use this format:

```yaml
error:
  phase: scope | prepare | analyze | report
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
| `review-id` in downstream artifact matches the Scope output           | Reject; re-run from Scope                   |
| `scope-id` in Prepare+ matches Scope output                          | Reject; re-run from Scope                   |
| `prepare-id` in Analyze+ matches Prepare output                      | Reject; re-run from Prepare                 |
| `analyze-id` in Report matches Analyze output                        | Reject; re-run from Analyze                 |
| `interactionMode` is identical across all artifacts                   | Log warning; use earliest non-default value |
| `work-id` (work-linked only) carried consistently where present      | Log warning; do not fabricate                |

## Notes

- All errors and warnings should be logged with a timestamp for debugging.
- When a phase terminates, its saved artifact (if any) should be marked `status: failed`.
- The Orchestrator is responsible for deciding whether to retry the entire workflow or re-run from the last successful phase.
- ID assignment and re-use (including recycle-on-edit) is defined in [id-generation.md](id-generation.md); this reference covers only verification and recovery.
- A `requirements-source: none` input is a **legitimate** review configuration (Category 3 handles empty/ambiguous input; `none` is the documented skip path for the scope-creep category), not an error.
- This reference is shared by all four phases; phase-specific handling is documented inline in the respective module.