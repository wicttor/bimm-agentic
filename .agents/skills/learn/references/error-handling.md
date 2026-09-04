---
title: Error Handling & Recovery
description: Reference for all Learn Skill phases (Capture, Refine, Index, Maintain). Defines the Step 0 artifact verification procedure, per-type required fields, error categories, recovery workflow, retry limits, and cross-phase consistency checks. Applies to durable knowledge curation, not transient sessions.
type: reference
version: 1.0
timestamp: "2026-08-08"
---

# Error Handling & Recovery

This file documents the error handling and recovery strategies shared across all Learn Skill phases (Capture, Refine, Index, Maintain). Each phase begins with a **Step 0: Verification** that validates the incoming artifact; this reference defines the validation rules, recovery actions, and termination conditions.

## Core Principle

**Fail explicitly, never silently.** When an artifact is missing, malformed, or inconsistent, the phase must surface a clear error with a recovery suggestion rather than guessing or proceeding with bad data. Silent failures corrupt the canonical knowledge base — a wrong `slug` collision, a silently coerced field, or a skipped duplicate check cascades into a polluted index that Plan/Work/Review then read as source of truth. The one recognized non-block is a **missing `docs/learn/` store entirely** (the Orchestrator's Pre-Flight seeds it), and a **no-op maintain step** (e.g. migration when already migrated, or no analogs to merge) which records `no-op` and proceeds — these are deliberate non-blocks with explicit notes, not silent skips.

## Step 0: Artifact Verification

Every phase receives an artifact from the previous phase (or the Orchestrator, for Capture). Step 0 validates the artifact before any work begins.

### Verification Procedure

```
1. Confirm the artifact exists and is non-empty
2. Confirm the required frontmatter fields are present and well-formed
3. Confirm the artifact type matches the expected phase input
4. Confirm interactionMode is present and valid (default to "smart" if missing)
5. Confirm cross-phase IDs match the upstream artifacts
6. Confirm routing: a "maintain" shape must not reach Capture/Refine/Index; an authoring shape must not reach Maintain
```

### Required Fields by Artifact Type

| Artifact Type      | Required Fields                                                                                                                                                                  | Produced By  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `learn-input`       | `type`, `timestamp`, `source`, `status`, input shape (`explicit: {type, text}` **or** `candidate: {ref}` **or** `maintain: true`), `interactionMode`                              | Orchestrator |
| `captured-entry`    | `capture-id`, `learn-id`, `input-shape`, `status`, `interactionMode`, `target-type` (one of the four), proposed `slug`, drafted `frontmatter`, drafted `body`, `source-candidate`   | Capture      |
| `refined-entry`     | `refine-id`, `capture-id`, `learn-id`, `input-shape`, `status`, `interactionMode`, validated `type`, resolved `slug`, validated `frontmatter`/`body`, `dup-status`, `resolution`  | Refine       |
| `index-update`      | `index-id`, `refine-id`, `capture-id`, `learn-id`, `input-shape`, `status`, `interactionMode`, `entry-path`, `slug`, `type`, `index-applicability`, `index-action`, `index-coherent` | Index        |
| `maintain-log`      | `maintain-id`, `interactionMode`, `status`, `migration`, `merges`, `refresh`, `prune`, `rebuild`, `index-coherent` (no `learn-id` umbrella — Maintain authors no new entry)         | Maintain     |

## Error Categories

### Category 1: Missing Artifact

The expected input artifact was not provided by the Orchestrator or previous phase.

| Trigger                           | Recovery Action                                               | Terminate?         |
| --------------------------------- | ------------------------------------------------------------- | ------------------ |
| Artifact object is null/undefined | Ask Orchestrator to re-run previous phase                     | Yes, after 1 retry |
| Artifact file path does not exist | Log warning; ask user to locate file or re-run previous phase | No                 |
| Artifact file is empty (0 bytes)   | Re-run previous phase from its saved context                | Yes, after 1 retry |

### Category 2: Malformed Artifact

The artifact exists but is missing required fields or has invalid structure.

| Trigger                                       | Recovery Action                                             | Terminate? |
| --------------------------------------------- | ----------------------------------------------------------- | ---------- |
| Missing required frontmatter field            | Re-run previous phase to regenerate artifact                | No         |
| `interactionMode` missing or invalid          | Default to `smart`; log warning; continue                   | No         |
| `status` field is `failed` or `pending`       | Reject; ask Orchestrator to re-run previous phase           | Yes        |
| Artifact `type` does not match expected input | Reject; ask Orchestrator to check phase ordering            | Yes        |
| YAML frontmatter has syntax errors            | Log error with line number; ask user to fix or re-run phase | No         |
| Routing: `maintain` reached Capture/Refine/Index | Reject; Orchestrator routes maintain directly to Maintain | Yes        |
| Routing: authoring shape reached Maintain      | Reject; Orchestrator should route to Capture                | Yes        |
| Target-type not one of the four (Capture Step 1) | Ask user to pick from `decision`/`pattern`/`gotcha`/`workflow` | No      |

### Category 3: Invalid Learn Input

Only applies to the Capture phase (Step 0) when resolving a Learn Input Artifact.

| Trigger                                              | Recovery Action                                            | Terminate? |
| ---------------------------------------------------- | --------------------------------------------------------- | ---------- |
| All three input shapes empty or ambiguous           | Ask: "What would you like to capture? Type + text, candidate ref, or `maintain`." | No         |
| Explicit `<type>` not one of the four                | Ask the user to pick from the four                          | No         |
| Explicit `<text>` is a bare ref that cannot be read (file/commit) | Ask the user to supply the decision in prose         | No         |
| Candidate `ref` does not resolve to a report file    | Ask the user to pick a valid Work `review-id` / Review `report-id` | No         |
| Candidate report's `learnings-to-capture` list is empty | Inform the user (no candidates to curate); stop       | No         |
| Maintain requested but `docs/learn/` and `docs/learnings/` are both absent | Inform the user; the store must exist (or legacy) before a maintain | No |

### Category 4: File System Errors

Errors encountered while saving or reading entry/index files.

| Trigger                                          | Recovery Action                                                   | Terminate?         |
| ------------------------------------------------ | ----------------------------------------------------------------- | ------------------ |
| `docs/learn/` does not exist                    | Create it (Orchestrator Pre-Flight creates; Index creates `<type>/` subdir); continue | No |
| `docs/learn/index.md` does not exist             | Seed it from [index-format.md](index-format.md) (YAML block + tables headers); continue | No |
| Phase save directory does not exist              | Create it; treat counter as 0; start from 001 (Pre-Flight creates) | No                 |
| Counter directory exists but no files match date | Start counter at 001                                              | No                 |
| File write permission denied                     | Log error; ask user to check permissions; retry once              | Yes, after 1 retry |
| De-indexing an analog whose canonical entry is itself absent | Log; revert the merge; ask the user (the lineage link is broken) | No |

### Category 5: Interaction Mode Errors

Errors related to `interactionMode` propagation.

| Trigger                                  | Recovery Action                                            | Terminate? |
| ---------------------------------------- | ---------------------------------------------------------- | ---------- |
| Mode missing from incoming artifact      | Default to "smart"; log warning; continue                  | No         |
| Mode value is not in enum                | Reject; re-prompt Orchestrator to set valid mode            | Yes        |
| User selects "Abort" during confirmation | Stop immediately; inform Orchestrator of abort with reason | Yes        |
| User does not respond (timeout)          | Pause; ask user to retry or abort                          | No         |

### Category 6: Curation Errors (Refine / Index / Maintain)

| Trigger                                              | Recovery Action                                                    | Terminate? |
| ---------------------------------------------------- | ------------------------------------------------------------------ | ---------- |
| Refine: a required body section is missing            | Ask the user to add it (never auto-fill silently)                  | No         |
| Refine: a frontmatter field has a wrong type/value    | Surface the field, suggest the fix, ask the user; never coerce      | No         |
| Refine: exact `slug` found (a re-author)              | Smart pause: update-existing vs new-slug; never silently two       | No         |
| Index: `index-coherent: false` after the upsert       | Reconcile (the file tree is source of truth); warn; suggest `/learn maintain` | No |
| Maintain: a prune candidate's canonical reference is live in `related` | Do not prune; it is referenced (lineage would break) — surface to user | No |
| Maintain: rebuild left `index-coherent: false`        | Re-run Step 5 (the rebuild); if still failing, terminate          | Yes, after 1 retry |

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
- After exhausting phase retries, terminate with a clear error suggesting the user re-run the Learn run from the start or resume from the last complete phase.

> An authoring run (`/learn <type> <text>`) is **not resume-safe**: re-running over the same content upserts on `slug` (idempotent — better than resuming). A maintain run is idempotent and self-gating (the migration is one-time, no-op thereafter).

## Error Reporting Format

When reporting an error to the Orchestrator or user, use this format:

```yaml
error:
  phase: capture | refine | index | maintain
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
| `learn-id` in downstream artifact matches the Capture output          | Reject; re-run from Capture                |
| `capture-id` in Refine+ matches Capture output                       | Reject; re-run from Capture                 |
| `refine-id` in Index matches Refine output                            | Reject; re-run from Refine                  |
| `interactionMode` is identical across all artifacts                   | Log warning; use earliest non-default value |
| `maintain-id` standalone (no `learn-id` expected for a maintain run)  | If a `learn-id` is present on a maintain artifact, log warning; treat as orphan | 
| Routing: authoring shape produces Capture→Refine→Index; `maintain` shape produces only Maintain | Reject; surface routing bug |

## Notes

- All errors and warnings should be logged with a timestamp for debugging.
- When a phase terminates, its saved artifact (if any) should be marked `status: failed`.
- The Orchestrator is responsible for deciding whether to retry the entire workflow or resume from the last successful phase.
- ID assignment and re-use (including recycle-on-edit) is defined in [id-generation.md](id-generation.md); this reference covers only verification and recovery.
- The per-entry frontmatter schema (the write contract) is defined in [entry-schema.md](entry-schema.md); the index format is defined in [index-format.md](index-format.md); the duplicate/merge logic is defined in [dedup-rules.md](dedup-rules.md); the one-time migration is defined in [migration-bootstrap.md](migration-bootstrap.md). This reference covers only verification/recovery and never re-encodes those contracts.
- This reference is shared by all four phases; phase-specific handling is documented inline in the respective module.