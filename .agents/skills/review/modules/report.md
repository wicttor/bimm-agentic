---
title: Report
description: Fourth and final step in the Review workflow. Derives the final approval status (approved / changes-requested / rejected) from the Findings per the authoritative approval criteria, composes non-binding recommendations, generates the Review Report, registers it in docs/review/index.md, and (work-linked only) appends a distinct ## Review Report — <report-id> block to the work task index. Returns the Review Report as the Review skill's final deliverable.
type: module
version: 1.0
timestamp: "2026-08-08"
---

# Phase 4 - Report

**Purpose:** Fourth and final step in the Review workflow. Reads the [Findings](../references/templates/artifacts/findings.md) from Analyze, derives the final **approval status** (`approved` / `changes-requested` / `rejected`) per the authoritative criteria, composes non-binding recommendations, writes the [Review Report](../references/templates/artifacts/review-report.md), registers it in `docs/review/index.md`, and — for work-linked input only — appends a distinct `## Review Report — <report-id>` block to `docs/tasks/<work-id>/index.md` (clearly separate from Work's own `## Work Report` block). Returns the Review Report as the Review skill's final deliverable.

## Workflow

This is the Phase 4 pipeline for the Review Skill. It orchestrates the following steps:

### Step 0: Verification

Run the **[Step 0 verification](../references/error-handling.md)**. Required input: valid **Findings** from Analyze. Specifically verify:

1. The Findings carry `analyze-id`, `prepare-id`, `scope-id`, `review-id`, `input-shape`, `interactionMode`, the findings list, and the per-category / per-severity tallies.
2. **Findings coherence** (orchestrator gate #5): every finding has a `severity`, a `category`, a repository-relative `location`, and either a `trace` or `scope-creep: true`. Report refuses to proceed (Category 2 recovery per [error-handling.md](../references/error-handling.md)) if not — re-run Analyze.
3. `interactionMode` is present and valid (default to `smart` if missing; log warning).
4. Cross-phase consistency: `review-id`, `scope-id`, `prepare-id`, `analyze-id` match the upstream artifacts.

If the Findings set is empty (the nothing-to-review case, or a genuinely clean review), Report still produces a Review Report recording the clean outcome — do not abort.

### Step 1: Derive the Approval Status

The approval criteria are authoritative in **[approval-criteria.md](../references/approval-criteria.md)** — Report looks them up, it does not re-encode them:

- **approved** — no `blocker`, no `major` (any number of `minor`/`nit` acceptable). The change is mergeable.
- **changes-requested** — at least one `major`, **no** `blocker`; **or** any finding flagged `scope-creep: true`. Fix before merge.
- **rejected** — at least one `blocker`. Do not merge.

Derive the status deterministically from the tallies (count of `blocker`/`major` findings and whether any finding carries `scope-creep: true`). Record `approval-status` and a one-line rationale tied to the tallies.

### Step 2: Compose Recommendations

1. For **changes-requested / rejected**, list the actionable `blocker`/`major` findings as recommended next steps, each referencing the finding id and `location`. These are **non-binding** — Review is read-only; the user turns them into a follow-up `/plan` + `/work`, or manual fixes.
2. For **approved** with `minor`/`nit` findings, optionally list them as non-blocking polish suggestions.
3. Summarize the **scope-creep** outcome: if the scope-creep category ran, summarize the confirmed creep findings (or `none`); if it was `skipped (no requirements)`, record that.
4. Surface **learnings to capture** — confirmed patterns, gotchas, or forced decisions discovered during Analyze — as candidates (with title, domain, source finding id, and a 1–2 sentence summary). Review does not write `docs/learn/` directly; these are handed to the Learn skill (`/learn`).

### Step 3: Generate the Review Report Artifact

1. **Assign a `report-id`** per [id-generation.md](../references/id-generation.md) (format `YYYY-MM-DD-NNN-report`, saved to `docs/review/.report/`). Reuse it if the user later picks **Edit & Retry**.

2. Produce a **Review Report** block (as markdown) following the schema in [review-report.md](../references/templates/artifacts/review-report.md). Include:
   - `report-id`, inherited `analyze-id`, `prepare-id`, `scope-id`, `review-id`, `input-shape`, `interactionMode`
   - the `approval-status` and rationale
   - the findings rollup (counts by severity and by category)
   - `recommendations` (actionable for changes-requested/rejected; polish for approved)
   - `scope-creep-summary` (confirmed findings, `none`, or `skipped (no requirements)`)
   - `learnings-to-capture` (candidates) and any `learning-gaps`
   - `work-id` carried (work-linked only, for the index cross-link)

### Step 4: Register in the Review Registry

Append a registry row to `docs/review/index.md`:

```
- <report-id> — <target-summary> — <approval-status> — docs/review/.report/<report-id>.md
```

Create the index with a registry header (`# Reviews`) if it does not yet exist. The row is **idempotent on `report-id`**: a re-run overwrites the row with the same id, never duplicates it.

### Step 5: Cross-Link the Work Index (work-linked only)

When `input-shape: work-linked`, append a **distinct** status block to `docs/tasks/<work-id>/index.md` — clearly labeled to never collide with Work's own `## Work Report` block:

```markdown
## Review Report — <report-id>

- **Status:** approved | changes-requested | rejected
- **Findings:** <blocker> blocker, <major> major, <minor> minor, <nit> nit
- **Scope creep:** none | <count> | skipped (no requirements)
- **Learnings to capture:** <count> (run `/learn` to persist)
- **Review Report:** docs/review/.report/<report-id>.md
```

The block is **append-only** and **idempotent on `report-id`** (a re-run overwrites the block with the same id, never duplicates it). If the work index does not exist, skip the cross-link and note it in the report (do not fabricate a work index).

### Step 6: Present, Confirm, and Save

Apply the **[phase confirmation behavior](../references/interaction-mode-propagation.md)** for the current `interactionMode`, using these report-specific **Smart pause triggers**:

- `approval-status` is `changes-requested` or `rejected` (confirm the user wants to finalize vs. re-analyze), or
- `learnings-to-capture` is non-empty and the user may want to capture them now via `/learn` before closing.

- **Detailed:** present the Review Report and ask one question with options *(1) Finalize Review, (2) Edit & Retry, (3) Abort*. On **Edit & Retry**, loop back through Steps 1–5 reusing the `report-id` (the registry row and work-index block are overwritten, not duplicated, because they key on `report-id`). On **Abort**, stop and inform the Orchestrator.
- **Smart:** pause only when a pause trigger above is true; otherwise auto-proceed.
- **Autopilot:** auto-proceed (no confirmation).

Then save the artifact to `docs/review/.report/<report-id>.md` (ensure `interactionMode` included).

### Step 7: Return to Orchestrator

Return the Review Report to the Orchestrator — `path`, `report-id`, `review-id`, `approval-status`, `work-id` (if work-linked), `interactionMode`, and `learnings-to-capture` count. The Orchestrator marks the Review workflow complete. Optionally chain to the Learn skill (`/learn`) when `learnings-to-capture` is non-empty; otherwise the session ends. **No GitHub sync is performed** — findings live on disk only; outbound posting is left to a separate, optional step the user may add later.

## Output: Review Report Artifact

- Verify that the Review Report is complete and valid: `report-id`, `analyze-id`, `prepare-id`, `scope-id`, `review-id`, `input-shape`, `interactionMode`, `approval-status`, the findings rollup, `recommendations`, `scope-creep-summary`, and `learnings-to-capture`.
- Verify that **findings coherence** held (re-verified in Step 0): every finding has a severity, category, repo-relative location, and a `trace` or `scope-creep: true`.
- Verify that the approval status was **derived from** [approval-criteria.md](../references/approval-criteria.md) rather than re-defined inline (no second rule contradicting the authoritative reference).
- Verify the registry row was appended to `docs/review/index.md` (idempotent on `report-id`), and — for work-linked input — the distinct `## Review Report — <report-id>` block was appended to `docs/tasks/<work-id>/index.md` (idempotent, never colliding with Work's `## Work Report` block).
- Verify that the artifact is saved to `docs/review/.report/<report-id>.md`.

> The Review Report is the primary deliverable of the Review Skill. The Orchestrator marks the workflow complete; optionally chains to `/learn` when learnings were surfaced.