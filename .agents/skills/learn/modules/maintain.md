---
title: Maintain
description: On-demand fourth step of the Learn workflow. Reconciles the canonical knowledge base from the file tree: runs the one-time legacy-to-canonical migration (migration-bootstrap), dedups analogs across the whole base with lineage preserved (dedup-rules), refreshes stale frontmatter against the current entry-schema, prunes obsolete entries (confirm each, never silent), and rebuilds docs/learn/index.md as a full reconcile. Maintain allocates its own maintain-id (no learn-id umbrella) and produces a Maintain Log.
type: module
version: 1.0
timestamp: "2026-08-08"
---

# Phase 4 - Maintain

**Purpose:** On-demand fourth step of the Learn workflow. Reconciles the canonical knowledge base (`docs/learn/`) from the on-disk file tree. Runs the one-time legacy `docs/learnings/` → `docs/learn/` migration (via [migration-bootstrap.md](../references/migration-bootstrap.md)), dedups analogs **across the whole base** with lineage preserved (per [dedup-rules.md](../references/dedup-rules.md)), refreshes stale entry frontmatter against the current [entry-schema.md](../references/entry-schema.md), prunes obsolete entries (each confirmed — never silent), and **rebuilds** `docs/learn/index.md` as a full reconcile (the file tree is the source of truth). Produces a [Maintain Log](../references/templates/artifacts/maintain-log.md) recording every operation. Maintain allocates its own `maintain-id` — there is no `learn-id` umbrella (Maintain does not author one new entry).

## Workflow

This is the Phase 4 pipeline for the Learn Skill. It orchestrates the following steps. **Control flow:** a `/learn maintain` run executes Steps 1→5 (each step is idempotent and self-gating — a step with nothing to do records `no-op` and proceeds). Steps run in order; the user confirms destructive operations (prune; migration rewrite) per the interaction mode.

### Step 0: Verification

Run the **[Step 0 verification](../references/error-handling.md)**. Required input: a valid **Learn Input Artifact** from the Orchestrator with the `maintain` flag set. Specifically verify:

1. The Learn Input Artifact carries `shape: maintain` (not explicit or candidate). If it carries an authoring shape, the Orchestrator routed incorrectly — surface a routing error (Category 2).
2. `interactionMode` is present and valid (default to `smart` if missing; log warning).
3. `docs/learn/` exists (the Orchestrator's Pre-Flight Check ensures this); if only the legacy `docs/learnings/` exists and `docs/learn/` is empty/absent, the migration in Step 1 creates `docs/learn/`.

### Step 1: Migrate the Legacy Store (one-time, self-gating)

Run the one-time migration defined canonically in **[migration-bootstrap.md](../references/migration-bootstrap.md)** — Maintain invokes it; it does not re-derive the procedure:

1. **Self-gate:** if `docs/learnings/` does not exist, or `docs/learn/` already contains the migrated entries (detected by a `docs/learn/.migrated` marker or by slug-set parity), record `migration: no-op (already migrated)` and skip to Step 2.
2. Otherwise: copy each `docs/learnings/<type>/<file>.md` to `docs/learn/<type>/<slug>.md` (slug = normalized from the legacy filename: kebab-case, date kept as suffix when the legacy file used it), rewrite any legacy `docs/learnings/...` cross-references in the entry **and its `related` links** to the canonical `docs/learn/...` paths, then write the `docs/learn/.migrated` marker.
3. **Lineage preserved:** each migrated entry's frontmatter records `migrated-from: docs/learnings/<type>/<file>.md` so the old path knowledge is not lost (the `path-convention-split` gotcha is the model — a migrated entry carries both the old and new path).
4. Record `migration: <N> entries migrated` in the log.

> Maintain does **not** delete `docs/learnings/` after migration. The legacy store stays on disk (read-only, superseded) until the user explicitly removes it — a destructive prune (Step 4) the user confirms. The canonical `docs/learn/` is the source of truth going forward; `docs/learnings/` is vestigial.

### Step 2: Dedup Across the Whole Base

Apply the analog detection from **[dedup-rules.md](../references/dedup-rules.md)** across **all** entries in `docs/learn/` — not just one (Refine applied it per-entry; Maintain applies it base-wide):

1. Scan all `docs/learn/<type>/*.md`; for each pair of entries with the same `domain` + overlapping `tags` + the same decision/pattern/gotcha/workflow conclusion, flag an analog pair.
2. For each analog pair, propose a **merge into canonical** (pick the canonical `slug` — prefer the older/higher-priority entry; the analog carries `superseded-by`).
3. Confirm each merge with the user (a destructive dedup Smart pause trigger — Step 7); on confirmation, fold the analog's evidence into the canonical entry, write `superseded-by: <canonical-slug>` into the analog file (de-index, keep file), and record the lineage link in the canonical entry's `related`.
4. Record each merge in the log (`merge: <analog-slug> → <canonical-slug>`).

### Step 3: Refresh (non-destructive)

Re-validate every entry's frontmatter against the current **[entry-schema.md](../references/entry-schema.md)** — the schema may have evolved since the entry was written:

1. For each entry: check every required field is present and well-typed; check the per-type body sections are present.
2. **Non-destructive fixes** allowed without confirmation: add a missing default (`priority: normal`, `confidence: medium`), normalize casing (`applicability` enum), stamp `updated_at` if any field was normalized.
3. **Destructive changes** (rewriting a field's value, deleting a section) require confirmation — these are flagged, not auto-applied. The user decides.
4. Record `refresh: <N> entries normalized, <M> entries flagged for review`.

### Step 4: Prune (destructive, confirm each)

Remove obsolete entries. **Obsolescence is explicit, never inferred silently:**

1. An entry is **obsolete** iff: the user marks it obsolete, **or** it is `superseded-by` another entry **and** no other entry references it in `related` (a fully-absorbed analog).
2. For each prune candidate, ask the user one question: keep (de-index only — the recommended default) **or** delete the file (truly destructive). Never delete without explicit confirmation.
3. On **delete**: remove the file. On **de-index**: remove the index record, keep the file with `status: obsolete` in frontmatter. Both remove the entry from `docs/learn/index.md`.
4. Record `prune: <slug> (deleted | de-indexed)` in the log.

> Prune is the only step that can delete a file. Every deletion is confirmed. A de-index (keep the file, mark obsolete) is the recommended default — knowledge is rarely deleted, it is superseded.

### Step 5: Rebuild the Index (full reconcile)

Rebuild `docs/learn/index.md` from the on-disk file tree — the file tree is the source of truth, never the existing index:

1. Re-scan `docs/learn/<type>/*.md` (all four types); parse each entry's frontmatter.
2. Regenerate the YAML `entries:` block per [index-format.md](../references/index-format.md) — re-derive each record's `index-applicability` enum from the per-entry numeric scores (the same derivation Index Step 1 uses).
3. Regenerate the By Category / By Domain markdown tables; recompute the per-type count headings.
4. **Exclude** de-indexed entries (those with `status: obsolete` or a `superseded-by` note whose canonical entry is present) from the YAML block and tables.
5. Write `docs/learn/index.md`. Record `rebuild: <N> entries indexed` and any coherence fixes applied.

### Step 6: Allocate the maintain-id

Assign a `maintain-id` per [id-generation.md](../references/id-generation.md) (format `YYYY-MM-DD-NNN-maintain`, saved to `docs/learn/.maintain/`). Maintain has **no `learn-id` umbrella** (it authors no new entry). Reuse the `maintain-id` if the user picks **Edit & Retry**.

### Step 7: Generate the Maintain Log Artifact

Produce a **Maintain Log** block (as markdown) following the schema in [maintain-log.md](../references/templates/artifacts/maintain-log.md). Include:

- `maintain-id`, `interactionMode`, `status`
- `migration` (`no-op` | `<N> entries migrated`)
- `merges` — the list of `analog-slug → canonical-slug` merges performed
- `refresh` — entries normalized vs flagged-for-review counts + the flagged list
- `prune` — each `slug (deleted | de-indexed)`
- `rebuild` — `<N> entries indexed`, coherence fixes applied
- `index-coherent: true` — the rebuilt YAML length matches the on-disk count

### Step 8: Present, Confirm, and Save

Apply the **[phase confirmation behavior](../references/interaction-mode-propagation.md)** for the current `interactionMode`, using these maintain-specific **Smart pause triggers**:

- The migration would rewrite legacy paths (Step 1) — confirm before running (it rewrites 28 entry paths + cross-refs), or
- A prune would delete or de-index an entry (Step 4) — confirm each prune candidate, or
- A merge would absorb an entry (Step 2) — confirm each analog merge, or
- `index-coherent: false` after rebuild (a bug — the rebuild did not reconcile; re-run Step 5).

- **Detailed:** present the Maintain Log and ask one question with options *(1) Finalize, (2) Edit & Retry, (3) Abort*. On **Edit & Retry**, loop back through Steps 1–7 reusing the `maintain-id`. On **Abort**, stop and inform the Orchestrator.
- **Smart:** pause only when a pause trigger above is true; otherwise auto-proceed (but destructive operations — migration, prune, merge — always surface for confirmation even in Smart, per the principle that destructive writes are never silent).
- **Autopilot:** auto-proceed for non-destructive steps (refresh, rebuild); **still pause** for destructive operations (migration, prune) — Autopilot never silently deletes or rewrites paths.

Then save the artifact to `docs/learn/.maintain/<maintain-id>.md` (ensure `interactionMode` included) and return it to the Orchestrator. The Orchestrator marks the Maintain run complete — the canonical knowledge base is reconciled.

## Output: Maintain Log Artifact

- Verify that the Maintain Log is complete and valid: `maintain-id`, `interactionMode`, `status`, and the `migration` / `merges` / `refresh` / `prune` / `rebuild` sections.
- Verify that the migration (if it ran) preserved lineage (`migrated-from` per entry) and did not delete the legacy store.
- Verify that every merge recorded lineage (`superseded-by` in the analog; `related` link in the canonical) — de-indexed, not deleted — per [dedup-rules.md](../references/dedup-rules.md).
- Verify that every prune was explicitly confirmed (no silent deletion); a delete leaves no file; a de-index keeps the file with `status: obsolete`.
- Verify **index coherence** (orchestrator gate #5): the rebuilt `docs/learn/index.md` YAML length matches the on-disk entry-file count; per-type totals consistent; no duplicate rows.
- Verify that the rebuild was **applied from** [index-format.md](../references/index-format.md) (and the applicability-enum derivation) rather than re-encoded inline.
- Verify that the artifact is saved to `docs/learn/.maintain/<maintain-id>.md`.

> The Maintain Log is the Maintain run's deliverable. The Orchestrator marks the workflow complete; the canonical knowledge base at `docs/learn/` is reconciled and `docs/learn/index.md` reflects the on-disk truth.