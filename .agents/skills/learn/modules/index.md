---
title: Index
description: Third step in the Learn workflow. Reads the Refined Entry, derives the index-record applicability enum from the per-entry numeric scores, writes the entry file to docs/learn/<type>/<slug>.md (upsert on slug), and upserts docs/learn/index.md (the canonical YAML-entries block + By Category / By Domain tables, per the authoritative index-format). Returns an Index Update for the Orchestrator's final output.
type: module
version: 1.0
timestamp: "2026-08-08"
---

# Phase 3 - Index

**Purpose:** Third step in the Learn workflow. Reads the [Refined Entry](../references/templates/artifacts/refined-entry.md) from Refine, derives the index-record `applicability` enum from the per-entry numeric scores (the read-side contract Plan/Work/Review's [learnings-gate-logic.md](../../plan/references/learnings-gate-logic.md) parses), **writes** the entry file to `docs/learn/<type>/<slug>.md` (upsert on `slug`), and **upserts** `docs/learn/index.md` — the canonical YAML `entries:` block + the By Category / By Domain markdown tables — per the authoritative [index-format.md](../references/index-format.md). Returns an [Index Update](../references/templates/artifacts/index-update.md) as the Orchestrator's final output for the run. Index is the only authoring-phase writer of the entry file and the index.

## Workflow

This is the Phase 3 pipeline for the Learn Skill. It orchestrates the following steps:

### Step 0: Verification

Run the **[Step 0 verification](../references/error-handling.md)**. Required input: a valid **Refined Entry** from Refine. Specifically verify:

1. The Refined Entry carries `refine-id`, `capture-id`, `learn-id`, `input-shape`, `interactionMode`, the validated `type`, the resolved `slug`, the validated `frontmatter` and `body`, and the `dup-status` + `resolution`.
2. `interactionMode` is present and valid (default to `smart` if missing; log warning).
3. Cross-phase consistency: `learn-id`, `capture-id`, `refine-id` match the upstream artifacts; `interactionMode` is identical.

If Refine recorded a `resolution: merge-into-canonical`, Index additionally de-indexes the analog (Step 3) — it does **not** delete the analog's file (lineage preserved per [dedup-rules.md](../references/dedup-rules.md)).

### Step 1: Derive the Index-Record Applicability Enum

The per-entry frontmatter carries numeric `applicability: { current_project: N, general: N }` (the write side). The index-record (in `docs/learn/index.md`) carries the enum `applicability: DIRECT | RECOMMENDED | CONTEXTUAL | HISTORICAL | INFORMATIONAL` — the read-side contract the gate-logic parses. The derivation rule is authoritative in **[index-format.md](../references/index-format.md)** — Index looks it up, it does not re-encode the mapping:

- `current_project ≥ 8 AND general ≥ 7` → `DIRECT`
- `current_project ≥ 5 AND general ≥ 5` → `RECOMMENDED`
- `general ≥ 5` → `CONTEXTUAL`
- `general ≥ 3` → `HISTORICAL`
- otherwise → `INFORMATIONAL`

Record the derived enum as `index-applicability` for the index-record. The per-entry frontmatter keeps its numeric scores (the write side stays richer; the enum is a derived projection for readers).

### Step 2: Write the Entry File (upsert on slug)

1. Resolve the path `docs/learn/<type>/<slug>.md`. Create `docs/learn/<type>/` if missing.
2. **Upsert** — if the file exists (re-author / update-existing), overwrite it in place; if not, create it. Both operations key on `slug` (idempotent — never a duplicate file).
3. Write the entry as markdown: the frontmatter block, then the per-type body from the Refined Entry.
4. For a merge resolution: **do not** delete the analog file. Instead, write the analog's `superseded-by: <canonical-slug>` note into the analog's frontmatter (a non-destructive lineage record); the analog's index record is removed in Step 3.

### Step 3: Upsert docs/learn/index.md (canonical format)

Update `docs/learn/index.md` per the authoritative **[index-format.md](../references/index-format.md)** — the canonical hybrid format (YAML `entries:` block + By Category / By Domain markdown tables). Index applies the format; it does not re-encode it:

1. **YAML `entries:` block** — upsert (by `filename`) the one record for this entry: `filename: docs/learn/<type>/<slug>.md`, `domain`, `tags`, `applicability: <derived enum>`, `summary`. If the entry already exists in the block (update-existing), overwrite that record in place; never append a second.
2. **By Category table** — upsert (by `slug`) the row under the entry's `<type>` section (`### Decision` / `### Pattern` / `### Gotcha` / `### Workflow`). Update the per-type count heading (`### Gotcha (N)`).
3. **By Domain table** — upsert (by `slug`) the entry under its primary `domain` bullet.
4. **Merge** — on a `merge-into-canonical` resolution: **remove** the analog's record from the YAML block and both tables (it is de-indexed, not deleted), and ensure the canonical entry's record now reflects the merged content.
5. **Totals coherence** — the per-type count headings must match the `entries:` block length per type, and the YAML `entries:` block length must match the on-disk entry-file count in `docs/learn/`. If a prior index drifted, Index **reconciles** it (the file tree is the source of truth) — this is a non-destructive reconcile, not a rebuild (rebuild is Maintain).

### Step 4: Allocate the index-id

Assign an `index-id` per [id-generation.md](../references/id-generation.md) (format `YYYY-MM-DD-NNN-index`, saved to `docs/learn/.index/`). Reuse it if the user later picks **Edit & Retry**. The `learn-id` umbrella is inherited unchanged.

### Step 5: Generate the Index Update Artifact

Produce an **Index Update** block (as markdown) following the schema in [index-update.md](../references/templates/artifacts/index-update.md). Include:

- `index-id`, inherited `refine-id`, `capture-id`, `learn-id`, `input-shape`, `interactionMode`
- `entry-path` (`docs/learn/<type>/<slug>.md`), `slug`, `type`, the derived `index-applicability`
- `index-action` (`created` / `updated` / `merged`), and (for a merge) the analog's `slug` + the de-index action taken
- `index-coherent: true` — the YAML length matches the on-disk count, totals are consistent (the orchestrator's quality gate #5)
- `source-candidate` carried through

### Step 6: Present, Confirm, and Save

Apply the **[phase confirmation behavior](../references/interaction-mode-propagation.md)** for the current `interactionMode`, using these index-specific **Smart pause triggers**:

- `index-action: created` on a destructive first write (overwriting an existing `slug` the user may not expect — confirm before overwriting), or
- `index-action: merged` (a merge de-indexed an analog — confirm the lineage note and de-index before finalizing), or
- Totals were incoherent prior to Index and Index had to reconcile (warn the index drifted; suggest `/learn maintain` for a full rebuild).

- **Detailed:** present the Index Update and ask one question with options *(1) Finalize, (2) Edit & Retry, (3) Abort*. On **Edit & Retry**, loop back through Steps 1–5 reusing the `index-id`. On **Abort**, stop and inform the Orchestrator.
- **Smart:** pause only when a pause trigger above is true; otherwise auto-proceed.
- **Autopilot:** auto-proceed (no confirmation).

Then save the artifact to `docs/learn/.index/<index-id>.md` (ensure `interactionMode` included) and return it to the Orchestrator. The Orchestrator marks the authoring run complete — the durable entry now lives at `docs/learn/<type>/<slug>.md` and `docs/learn/index.md` reflects it.

## Output: Index Update Artifact

- Verify that the Index Update is complete and valid: `index-id`, `refine-id`, `capture-id`, `learn-id`, `input-shape`, `interactionMode`, `entry-path`, `slug`, `type`, `index-applicability`, and `index-action`.
- Verify that the entry file was written to `docs/learn/<type>/<slug>.md` and the upsert keyed on `slug` (no duplicate file).
- Verify that `docs/learn/index.md` was upserted in **both** the YAML `entries:` block and the By Category / By Domain tables, per [index-format.md](../references/index-format.md).
- Verify **index coherence** (orchestrator gate #5): the YAML block length matches the on-disk entry-file count; the per-type count headings match; no duplicate index rows.
- Verify that a merge **de-indexed** (not deleted) the analog and recorded the `superseded-by` lineage in the analog's file — lineage preserved per [dedup-rules.md](../references/dedup-rules.md).
- Verify that the derived `index-applicability` enum was **read from** [index-format.md](../references/index-format.md) (the derivation rule) rather than re-encoded inline.
- Verify that the artifact is saved to `docs/learn/.index/<index-id>.md`.

> The Index Update is the authoring run's final artifact. The Orchestrator marks the workflow complete; the durable knowledge entry lives at `docs/learn/<type>/<slug>.md` and is discoverable via `docs/learn/index.md` (the source-of-truth index Plan/Work/Review search).