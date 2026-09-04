---
title: Refine
description: Second step in the Learn workflow. Reads the Captured Entry, validates its type and frontmatter per the authoritative write contract (entry-schema), runs the duplicate + analog check against existing entries per dedup-rules, resolves any conflict (update-existing / new-slug / merge-into-canonical with lineage), and returns a Refined Entry for the Index phase.
type: module
version: 1.0
timestamp: "2026-08-08"
---

# Phase 2 - Refine

**Purpose:** Second step in the Learn workflow. Reads the [Captured Entry](../references/templates/artifacts/captured-entry.md) from Capture, validates its `type` and frontmatter per the authoritative [entry-schema.md](../references/entry-schema.md), runs the **duplicate + analog check** against existing entries per [dedup-rules.md](../references/dedup-rules.md), and resolves any conflict (update-existing / new-slug / merge-into-canonical with lineage). Returns a [Refined Entry](../references/templates/artifacts/refined-entry.md) for the Index phase. Refine validates and reconciles; it never writes the entry file or the index.

## Workflow

This is the Phase 2 pipeline for the Learn Skill. It orchestrates the following steps:

### Step 0: Verification

Run the **[Step 0 verification](../references/error-handling.md)**. Required input: a valid **Captured Entry** from Capture. Specifically verify:

1. The Captured Entry carries `capture-id`, `learn-id`, `input-shape`, `interactionMode`, `target-type`, the proposed `slug`, the drafted `frontmatter`, and the drafted `body`.
2. `target-type` is one of the four (Capture validated this; Refine re-confirms).
3. `interactionMode` is present and valid (default to `smart` if missing; log warning).
4. Cross-phase consistency: `learn-id` matches the Capture output; `interactionMode` is identical.

### Step 1: Validate the Type

1. Confirm `target-type` ∈ {`decision`, `pattern`, `gotcha`, `workflow`}. If invalid, apply Category 2 recovery (re-run Capture).
2. Confirm the drafted `body` uses the per-type section template (entry-schema.md defines the canonical sections). A `decision` must carry Problem / Solution / Decision Rationale / Application; a `gotcha` must carry Problem / Trap / Solution / Prevention; etc. Missing sections are a Refine Smart pause trigger (Step 6) — ask the user to add them, not auto-fill silently.

### Step 2: Validate the Frontmatter

Validate every frontmatter field against the authoritative **[entry-schema.md](../references/entry-schema.md)** — Refine looks it up; it does not re-encode the field list:

1. `domain` — a single primary domain (non-empty).
2. `tags` — a list of 2–6 related domains.
3. `applicability.current_project` and `applicability.general` — integers 0–10.
4. `confidence` — one of `high` / `medium` / `low`.
5. `priority` — one of `important` / `normal` (or absent → default `normal`).
6. `summary` — a 1–2 sentence summary (non-empty).
7. `source` — `{ type, reference, extracted_at }`; for a candidate input, `source.type: candidate` and `reference` points at the Work/Review report + finding id.
8. `created_at` / `updated_at` — ISO-8601; Refine leaves `created_at` as Capture set it and stamps `updated_at` to now.

On any validation failure: surface the specific field, suggest the fix, and ask the user — never silently coerce a wrong value (Category 2 recovery).

### Step 3: Duplicate + Analog Check

Run the duplicate and analog detection defined canonically in **[dedup-rules.md](../references/dedup-rules.md)** — Refine applies it; it does not re-derive the matching algorithm:

1. **Exact duplicate** — an existing entry with the same `slug` (or the same canonicalized title). This is a **re-author** case, not a new entry.
2. **Analog** — an existing entry that addresses the same conclusion (same domain + overlapping tags + the same decision/pattern/gotcha/workflow), under a different `slug`. Analogs are dedup candidates.
3. **Insignificant** — distant/loose matches; ignore (no action).

Record the matches (`dup-status: exact | analog | none`, the matched `slug`/file, and the match evidence).

#### Resolve the conflict (per dedup-rules.md):

| Match      | Resolution options the user picks from (Smart pause trigger Step 6)                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `exact`    | (a) **Update existing** — overwrite the existing entry file + index record with the refined content (idempotent on `slug`); (b) **New slug** — keep both, author under a new `slug`. |
| `analog`   | (a) **Merge into canonical** — fold this draft into the matched entry (append/consolidate the new evidence, record a lineage link to the analog's `slug`, bump `updated_at`); (b) **Keep separate** — keep this as its own entry under the proposed `slug` (the user judges the analog too distant to merge). |
| `none`     | Proceed — a genuine new entry; no resolution needed.                                                                            |

> **Lineage is preserved** on a merge: the merged entry records the analog as a `related` / lineage link, and the analog's content is not deleted — it is de-indexed (its index record removed) but its **file is kept** with a `superseded-by: <canonical-slug>` note (per [dedup-rules.md](../references/dedup-rules.md)). The `path-convention-split` gotcha is the model: a migrated/merged entry carries both the old and new knowledge, never just the new. This is why dedup **merges**, never **deletes**.

### Step 4: Allocate the refine-id

Assign a `refine-id` per [id-generation.md](../references/id-generation.md) (format `YYYY-MM-DD-NNN-refine`, saved to `docs/learn/.refine/`). Reuse it if the user later picks **Edit & Retry**. The `learn-id` umbrella is inherited unchanged.

### Step 5: Generate the Refined Entry Artifact

Produce a **Refined Entry** block (as markdown) following the schema in [refined-entry.md](../references/templates/artifacts/refined-entry.md). Include:

- `refine-id`, inherited `capture-id` and `learn-id`, `input-shape`, `interactionMode`
- the validated `type`, the resolved `slug` (may differ from Capture's proposal after a conflict resolution)
- the validated `frontmatter` and `body`
- `dup-status` (`exact` / `analog` / `none`), the matched `slug`/file + evidence, and the chosen `resolution` (`update-existing` / `new-slug` / `merge-into-canonical` / `keep-separate` / `none`)
- `lineage` — the analog `slug` + `superseded-by` note when a merge occured (else empty)
- `source-candidate` carried through from Capture

### Step 6: Present, Confirm, and Save

Apply the **[phase confirmation behavior](../references/interaction-mode-propagation.md)** for the current `interactionMode`, using these refine-specific **Smart pause triggers**:

- `dup-status: exact` (decide update-existing vs new-slug before Index writes), or
- `dup-status: analog` (decide merge-into-canonical vs keep-separate before Index writes), or
- A frontmatter field failed validation and required the user's fix (Step 2), or
- A required body section is missing (Step 1) and the user must add it.

- **Detailed:** present the Refined Entry and ask one question with options *(1) Proceed to Index, (2) Edit & Retry, (3) Abort*. On **Edit & Retry**, loop back through Steps 1–5 reusing the `refine-id`. On **Abort**, stop and inform the Orchestrator.
- **Smart:** pause only when a pause trigger above is true; otherwise auto-proceed.
- **Autopilot:** auto-proceed (no confirmation).

Then save the artifact to `docs/learn/.refine/<refine-id>.md` (ensure `interactionMode` included) and return it, with the `interactionMode` value, to the Orchestrator for the transition to Phase 3 (Index).

## Output: Refined Entry Artifact

- Verify that the Refined Entry is complete and valid: `refine-id`, `capture-id`, `learn-id`, `input-shape`, `interactionMode`, the validated `type`, the resolved `slug`, the validated `frontmatter` and `body`, and the `dup-status` + `resolution`.
- Verify that the frontmatter conforms to [entry-schema.md](../references/entry-schema.md) (every required field valid; the per-type body template present) without re-encoding the schema inline.
- Verify that the duplicate/analog check ran per [dedup-rules.md](../references/dedup-rules.md) and that any conflict was resolved with a recorded `resolution` (never silently two entries).
- Verify that a merge recorded `lineage` (the analog `slug` + `superseded-by` note) — lineage preserved, never deleted.
- Verify that the artifact is saved to `docs/learn/.refine/<refine-id>.md`.

> Pass the Refined Entry to `index` (Phase 3) to write the entry file and upsert the canonical index.