---
title: Error Handling & Recovery
description: Reference for error handling and recovery strategies in the Plan Skill phases. Provides guidance on how to handle missing or malformed artifacts, invalid user input, and other common errors.
type: reference
version: 1.2
timestamp: "2026-08-07"
---

# Error Handling & Recovery

This file documents the error handling and recovery strategies shared across all Plan Skill phases (Scope, Research, Design, Generate, Tasks). Each phase begins with a **Step 0: Verification** that validates the incoming artifact; this reference defines the validation rules, recovery actions, and termination conditions.

## Core Principle

**Fail explicitly, never silently.** When an artifact is missing, malformed, or inconsistent, the phase must surface a clear error with a recovery suggestion rather than guessing or proceeding with bad data. Silent failures cascade downstream and produce invalid plans.

## Step 0: Artifact Verification

Every phase receives an artifact from the previous phase (or the Orchestrator, for Scope). Step 0 validates the artifact before any work begins.

### Verification Procedure

```
1. Confirm the artifact exists and is non-empty
2. Confirm the required frontmatter fields are present and well-formed
3. Confirm the artifact type matches the expected phase input
4. Confirm interactionMode is present and valid (default to "smart" if missing)
5. Confirm status field indicates the previous phase completed successfully
```

### Required Fields by Artifact Type

| Artifact Type | Required Fields                                                                                                                                                                                                                            | Produced By  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| `user-input`  | `type`, `timestamp`, `source`, `status`, Task Description, Intended Behavior                                                                                                                                                               | Orchestrator |
| `scope`       | `type`, `scope-id`, `domain`, `status`, `interactionMode`, Problem, Intended Behavior, Success Criteria                                                                                                                                    | Scope        |
| `research`    | `research-id`, `scope-id`, `status`, `interactionMode`, Patterns Found, High-Risk Detection, Tech Stack                                                                                                                                    | Research     |
| `design`      | `design-id`, `scope-id`, `research-id`, `status`, `interactionMode`, `complexity`, `tier_recommended`, Approach, High-Level Technical Design, Implementation Units (each with Acceptance Criteria), Alternative Approaches, Complexity | Design       |
| `plan`        | `plan-id`, `type`, `title`, `status`, `tier`, `tier_recommended`, `complexity`, `risk`, `scope-id`, `research-id`, `design-id`, `interactionMode`, `created`, `updated`, `version`, High-Level Design, Implementation Units, Risk Analysis | Generate     |

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
| `status` field is `failed` or `pending`       | Reject; ask Orchestrator to re-run previous phase           | Yes        |
| Artifact `type` does not match expected input | Reject; ask Orchestrator to check phase ordering            | Yes        |
| YAML frontmatter has syntax errors            | Log error with line number; ask user to fix or re-run phase | No         |

### Category 3: Invalid User Input

Only applies to the Scope phase (Step 0) when validating the User Input Artifact.

| Trigger                                             | Recovery Action                                      | Terminate? |
| --------------------------------------------------- | ---------------------------------------------------- | ---------- |
| Task Description empty or > 500 chars               | Ask: "What problem are you trying to solve?"         | No         |
| Intended Behavior empty or unobservable             | Ask: "What should happen after this is implemented?" | No         |
| Context Source is not a valid enum value            | Infer from input origin; ask if ambiguous            | No         |
| Task Description AND Intended Behavior both missing | Abort; ask user to return with more context          | Yes        |

### Category 4: File System Errors

Errors encountered while saving or reading artifact files.

| Trigger                                          | Recovery Action                                                   | Terminate?         |
| ------------------------------------------------ | ----------------------------------------------------------------- | ------------------ |
| Target directory does not exist                  | Create directory (`mkdir -p`); treat counter as 0; start from 001 | No                 |
| Counter directory exists but no files match date | Start counter at 001                                              | No                 |
| File write permission denied                     | Log error; ask user to check permissions; retry once              | Yes, after 1 retry |
| Index file (`docs/plans/index.md`) missing       | Create empty index; append entry                                  | No                 |
| Index file locked or corrupted                   | Log warning; skip index update; continue with save                | No                 |

### Category 5: Interaction Mode Errors

Errors related to `interactionMode` propagation.

| Trigger                                  | Recovery Action                                            | Terminate? |
| ---------------------------------------- | ---------------------------------------------------------- | ---------- |
| Mode missing from incoming artifact      | Default to `smart`; log warning; continue                  | No         |
| Mode value is not in enum                | Reject; re-prompt Orchestrator to set valid mode           | Yes        |
| User selects "Abort" during confirmation | Stop immediately; inform Orchestrator of abort with reason | Yes        |
| User does not respond (timeout)          | Pause; ask user to retry or abort                          | No         |

## Recovery Workflow

When a verification failure is detected in Step 0, apply this workflow:

```
1. Identify the error category (1-5) from the tables above
2. Look up the specific trigger to find the recovery action
3. Execute the recovery action:
   - If recovery is "ask user": ask one question with clear options (2–4 concrete choices)
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
- After exhausting retries, terminate with a clear error message explaining what failed and suggesting the user re-run the planning workflow from the start or from the last successful phase.

## Error Reporting Format

When reporting an error to the Orchestrator or user, use this format:

```yaml
error:
  phase: scope | research | design | generate | tasks
  step: 0 | 1 | 2 | ...
  category: 1 | 2 | 3 | 4 | 5
  trigger: "[specific trigger description]"
  recovery_attempted: "[action taken]"
  outcome: recovered | terminated
  suggestion: "[next step for the user or Orchestrator]"
```

## Cross-Phase Consistency Checks

In addition to per-phase verification, the Orchestrator should verify consistency between phases:

| Check                                                | Action on Failure                           |
| ---------------------------------------------------- | ------------------------------------------- |
| `scope-id` in research artifact matches scope output | Reject research; re-run from scope          |
| `scope-id` in design artifact matches scope output   | Reject design; re-run from research         |
| `plan-id` references the correct design artifact     | Reject generate; re-run from design         |
| `interactionMode` is identical across all artifacts  | Log warning; use earliest non-default value |

## Notes

- All errors and warnings should be logged with a timestamp for debugging
- When a phase terminates, its saved artifact (if any) should be marked `status: failed`
- The Orchestrator is responsible for deciding whether to retry the entire workflow or resume from the last successful phase
- ID assignment and re-use (including recycle-on-edit) is defined in [id-generation.md](id-generation.md); this reference covers only verification and recovery
- This reference is shared by all five phases; phase-specific error handling (e.g., research's "no patterns found") is documented inline in the respective module
