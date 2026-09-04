---
title: Interaction Mode Propagation
description: Reference for how `interactionMode` propagates through the Learn pipeline (Capture -> Refine -> Index -> Maintain). Set at the Orchestrator; each phase reads and applies mode-specific behavior. The Learn skill has no execution mode — only interactionMode.
type: reference
version: 1.0
timestamp: "2026-08-08"
---

# Interaction Mode Propagation

Reference for how `interactionMode` propagates through the Learn pipeline (`Capture → Refine → Index → Maintain`). Set at the Orchestrator; each phase reads and applies mode-specific behavior.

> `interactionMode` governs **when to pause for the user**. Like Review, the Learn skill has **no execution mode** — curation is a single forward pass per entry (or a reconcile pass for Maintain), not a multi-task run, so there is no `executionMode` selector. Only `interactionMode` is carried through every artifact.

## Modes

| Mode          | Behavior                                              | Use Case                             |
| ------------- | ----------------------------------------------------- | ------------------------------------ |
| **Detailed**  | Pause at each phase; present artifacts; require approval | Authoritative decisions, sensitive maintenance, unfamiliar curation |
| **Smart**     | Auto-proceed; pause only on destructive/ambiguous operations (a likely-duplicate, a merge, a prune, a migration rewrite, a draft inferred from a short text) | Most routine curation |
| **Autopilot** | Auto-proceed for non-destructive steps; **still pause** for destructive operations (migration, prune, merge — never silently delete or rewrite paths) | Routine, well-scoped entries |

## Phase Behavior by Mode

| Phase        | Detailed                                         | Smart                                                                                                       | Autopilot                         |
| ------------ | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | --------------------------------- |
| **Capture**  | Present captured entry; ask Proceed/Edit/Abort   | Auto-proceed; pause if candidate/inferred draft (inferred type, domain, tags, body), or a bare ref that could not be read | Auto-proceed (still confirms inferred content per below) |
| **Refine**   | Present refined entry; ask Proceed/Edit/Abort    | Auto-proceed; pause on `dup-status: exact` (update vs new-slug), `dup-status: analog` (merge vs keep), a failed frontmatter field, or a missing body section | Auto-proceed (still surfaces duplicate/merge conflicts — destructive, never silent) |
| **Index**    | Present index update; ask Finalize/Edit/Abort    | Auto-proceed; pause on `index-action: created` (overwrite of existing `slug`), `index-action: merged` (analog de-index), or an incoherent prior index that needed reconcile | Auto-proceed (still confirms overwrite + merge — destructive) |
| **Maintain** | Present maintain log; ask Finalize/Edit/Abort     | Auto-proceed for non-destructive (refresh, rebuild); pause for migration rewrite, prune, merge, or incoherent rebuild | Auto-proceed for non-destructive; **still pauses** for migration/prune/merge (destructive — Autopilot never silently deletes or rewrites 28 paths) |

**Smart mode pauses only on each phase's documented triggers above** (the canonical list lives in each module's confirmation step; this table is a summary).

**Destructive operations are never silent, even in Autopilot.** This is the Learn skill's guardrail against corrupting the canonical knowledge base: a migration that rewrites 28 entry paths, a prune that deletes a file, and a merge that de-indexes an analog all surface for user confirmation regardless of the interaction mode. Non-destructive curation (drafting a new entry, refreshing frontmatter defaults, rebuilding the index from the file tree) automates freely.

## Artifact Schema

All phase artifacts include `interactionMode`:

```yaml
interactionMode: detailed | smart | autopilot # Passed from previous phase
status: pending | complete | failed
```

## Implementation

**Each phase must:**

1. Read `interactionMode` from the incoming artifact (or context, for Capture).
2. Apply mode-specific behavior per the table above.
3. Include `interactionMode` in the output artifact.

## Example

**SMART mode on an explicit decision author:**

- Capture reads user-provided prose grounded in a commit ref (not inferred) → auto-proceeds
- Refine finds no exact/analog duplicate → auto-proceeds
- Index creates a new entry file (no overwrite) and upserts the index → auto-proceeds (the `created` action was not an overwrite)
- Result: a durable decision entry written with no pause; faster than Detailed, safe because the run was non-destructive

**AUTOPilot mode on a `/learn maintain` after the store drifted:**

- Maintain Step 1 migration: skips (`no-op, already migrated`)
- Maintain Step 2 dedup: finds an analog pair → **pauses** (merge is destructive — Autopilot confirms)
- User confirms the merge → Maintain de-indexes the analog with lineage
- Maintain Step 3 refresh: auto-proceeds (non-destructive)
- Maintain Step 4 prune: finds an obsolete entry → **pauses** (prune is destructive — Autopilot confirms; default = de-index, not delete)
- Maintain Step 5 rebuild: auto-proceeds (non-destructive)

**Result:** Paused only for the two destructive operations; the non-destructive refresh/rebuild ran automatically.

## No Execution Mode (contrast with Work)

Learn deliberately has **no** `executionMode`:

- Work's `executionMode` (`inline`/`serial`/`parallel`) governs how multiple independent **tasks** run — Learn has no multi-task concept; curation is one entry per run (or a reconcile pass).
- The orchestrator's quality gate #2 for Learn cross-checks **only** `interactionMode` (not `interactionMode` + `executionMode` as in Work).
- A duplicate/migration/prune is the Learn analog of Work's HIGH-risk flag: it triggers pause behavior via `interactionMode`'s Smart triggers, not a separate mode.

## Error Handling

| Scenario                    | Recovery                              |
| --------------------------- | ------------------------------------- |
| Mode missing                | Default to "smart"; log warning       |
| Invalid mode value          | Reject; re-prompt Orchestrator        |
| Artifact missing mode field | Assume "smart"; log warning; continue |
| User selects "Abort"        | Stop immediately; inform Orchestrator |
| Timeout/connection lost     | Pause; ask user to retry or abort     |