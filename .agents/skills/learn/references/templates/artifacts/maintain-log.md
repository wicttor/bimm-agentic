---
title: Maintain Log Artifact
description: Template for the Maintain Log Artifact produced by the Maintain phase. Carries the one-time migration result (no-op or N entries migrated), the base-wide dedup merges performed, the refresh normalization/flag counts, the explicit prune decisions, the rebuilt index state, and the index-coherence flag. Maintain's only deliverable; the canonical knowledge base is reconciled.
type: template
version: 1.0
timestamp: "2026-08-08"
---

# Maintain Log Artifact

The product of the **Maintain** phase is the Maintain Log — the Maintain run's only deliverable. It records the one-time **migration** result (a self-gating no-op when already migrated, or `<N> entries migrated`), the **base-wide dedup** merges performed, the **refresh** (frontmatter normalization + flagged-for-review entries), the explicit **prune** decisions (deletes and de-indexes, each confirmed), and the rebuilt **index** state. The canonical knowledge base at `docs/learn/` is reconciled; `docs/learn/index.md` is rebuilt from the on-disk file tree (the source of truth). Maintain allocates its own `maintain-id` — there is no `learn-id` umbrella (Maintain authors no new entry).

## Schema

```yaml
maintain-id: YYYY-MM-DD-NNN-maintain       # standalone; no learn-id umbrella (Maintain authors no new entry)
interactionMode: detailed | smart | autopilot
status: complete
timestamp: ISO-8601 timestamp

migration:
  ran: true | false                         # false when self-gated (no-op)
  result: "no-op (already migrated)" | "<N> entries migrated"
  marker-written: true | false             # the .migrated marker at docs/learn/.migrated
  legacy-store-deleted: false               # ALWAYS false — migration never deletes docs/learnings/; removal is a separate prune

merges:                                     # base-wide dedup performed (Step 2)
  - analog-slug: <the analog folded>
    canonical-slug: <the canonical entry>
    analog-file: "docs/learn/<type>/<analog-slug>.md"
    analog-kept: true                       # the analog file is KEPT (de-indexed, not deleted)
    analog-superseded-note-written: true    # superseded-by + status:obsolete into the analog's frontmatter
    canonical-related-updated: true         # analog-slug added to the canonical's related list
  []

refresh:
  normalized-count: <N>                     # entries with non-destructive fixes applied (priority default, casing, updated_at)
  flagged-for-review-count: <N>             # entries with destructive changes needed (field-rewrite, missing sections) — NOT auto-applied
  flagged-entries: [ "<slug>", ... ]

prune:                                      # each prune was explicitly confirmed (destructive never silent, even in Autopilot)
  - slug: <slug>
    action: deleted | de-indexed            # deleted: file removed; de-indexed: file kept, status:obsolete, index record removed (recommended default)
    reason: "<user-confirmed rationale>"
  []

rebuild:
  ran: true
  entries-indexed: <N>                      # the count of on-disk non-de-indexed entries in the rebuilt index
  coherence-fixes-applied: <N>              # any (YAML length vs file count) drift reconciled (should be 0 on a clean store)

index-coherent: true                        # the rebuilt YAML entries: length == on-disk entry-file count;
                                           # per-type (N) counts consistent; no duplicate rows; the orchestrator's gate #5

summary:                                    # a one-line human-readable summary
  "<N> entries migrated; <M> merged; <R> normalized, <F> flagged; <P> pruned; <I> indexed"
```

Also save the Maintain Log Artifact to `docs/learn/.maintain/<maintain-id>.md`.

## Validation Rules

- **maintain-id:** Required. Format `YYYY-MM-DD-NNN-maintain` per [id-generation.md](../../id-generation.md). A maintain artifact **never** carries a `learn-id` (a `learn-id` here is treated as an orphan and logged per [error-handling.md](../../error-handling.md) Cross-Phase Consistency Checks).
- **interactionMode:** Required, propagated from the Learn Input Artifact.
- **status:** Required. `complete` (a partial maintain is `failed`; the user re-runs `/learn maintain` — runs are idempotent).
- **migration:** Required. `ran: false` with `result: "no-op (already migrated)"` (self-gated; the fast path is the `.migrated` marker, the robust path is slug-set parity per [migration-bootstrap.md](../../migration-bootstrap.md)). When `ran: true`: `result: "<N> entries migrated"`, `marker-written: true`. `legacy-store-deleted` is **always false** — the migration never deletes `docs/learnings/` (its removal is a separate prune the user explicitly runs if desired).
- **merges:** Required (may be `[]`). Each merge has `analog-slug`, `canonical-slug`, `analog-file`, `analog-kept: true`, `analog-superseded-note-written: true`, `canonical-related-updated: true`. **The analog file is never deleted** (lineage preserved per [dedup-rules.md](../../dedup-rules.md)).
- **refresh:** Required. `normalized-count` (non-destructive fixes; counted), `flagged-for-review-count`, `flagged-entries` (the slug list needing destructive changes — these are **not** auto-applied; the user decides).
- **prune:** Required (may be `[]`). Each prune has `slug`, `action` (`deleted` or `de-indexed`), and a `reason`. Each prune was **explicitly confirmed** by the user (destructive never silent, even in Autopilot). A deleted entry's file is gone; a de-indexed entry's file is kept with `status: obsolete`.
- **rebuild:** Required. `ran: true`, `entries-indexed: <N>` (the count of non-de-indexed on-disk entries), `coherence-fixes-applied: <N>` (should be 0 on a clean store; the rebuild reconciles any prior drift).
- **index-coherent:** Required. `true` — the orchestrator's quality gate #5; the rebuilt `docs/learn/index.md` YAML block length matches the on-disk entry-file count, per-type `(N)` counts are consistent, and no duplicate rows.
- **summary:** Required. A one-line human-readable record of what Maintain did.

## Example (first-run maintain after the legacy store exists — migration + a merge + a prune)

```yaml
maintain-id: 2026-08-08-001-maintain
interactionMode: smart
status: complete
timestamp: 2026-08-08T16:00:00Z
migration:
  ran: true
  result: "28 entries migrated"
  marker-written: true
  legacy-store-deleted: false
merges:
  - analog-slug: redis-ttl-set-vs-expire
    canonical-slug: ttl-must-propagate-to-redis-set
    analog-file: docs/learn/gotcha/redis-ttl-set-vs-expire.md
    analog-kept: true
    analog-superseded-note-written: true
    canonical-related-updated: true
refresh:
  normalized-count: 14                       # the older-layout pattern/workflow entries normalized to the canonical schema
  flagged-for-review-count: 2
  flagged-entries: [ cross-phase-id-chaining-2026-07-04, capability-described-not-tool-named-2026-08-07 ]
prune:
  - slug: deprecated-skill-format-2026-06-01
    action: de-indexed                       # the recommended default — file kept, status:obsolete, index record removed
    reason: "Superseded by the canonical skill-format convention; user confirmed de-index."
rebuild:
  ran: true
  entries-indexed: 27
  coherence-fixes-applied: 0
index-coherent: true
summary: "28 entries migrated; 1 merged; 14 normalized, 2 flagged; 1 pruned; 27 indexed"
```

## Example (steady-state maintain — no migration, just a refresh + rebuild)

```yaml
maintain-id: 2026-08-25-003-maintain
interactionMode: autopilot
status: complete
timestamp: 2026-08-25T10:00:00Z
migration:
  ran: false
  result: "no-op (already migrated)"
  marker-written: false
  legacy-store-deleted: false
merges: []
refresh:
  normalized-count: 0
  flagged-for-review-count: 0
  flagged-entries: []
prune: []
rebuild:
  ran: true
  entries-indexed: 31
  coherence-fixes-applied: 0
index-coherent: true
summary: "0 entries migrated; 0 merged; 0 normalized, 0 flagged; 0 pruned; 31 indexed"
```

## Notes

- Maintain is **on-demand** (`/learn maintain`); it authors no new entry, hence the standalone `maintain-id` (no `learn-id` umbrella).
- The **migration is one-time and self-gating** — the `.migrated` marker is the fast path; slug-set parity is the robust path. A steady-state maintain records `migration.ran: false` with `result: "no-op (already migrated)"`.
- **Destructive operations are never silent**, even in Autopilot (per [interaction-mode-propagation.md](../../interaction-mode-propagation.md)): the migration rewrite, each merge, and each prune surface for user confirmation. Non-destructive refresh and the rebuild auto-proceed.
- **Lineage is preserved everywhere**: a merge keeps the analog's file with `superseded-by` + `status: obsolete`; the recommended prune action is `de-indexed` (keep the file, mark obsolete), not `deleted`. The legacy store is **never deleted by the migration** — removal is a separate, explicit prune the user runs.
- **`index-coherent: true`** is the orchestrator's quality gate #5; Maintain is responsible for leaving the rebuilt index coherent (the file tree is the source of truth, the YAML block and the markdown tables are two projections in lockstep).
- This artifact is Maintain's only **deliverable** — it describes what was reconciled, never a session transcript. The canonical knowledge base at `docs/learn/` is the durable source-of-truth outcome.