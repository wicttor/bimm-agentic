---
title: Scope
description: Entry point to the Review workflow. Classifies the incoming review target (a git change-set, a /work run via work-id or Work review-id, or an ad-hoc description), resolves it to a concrete change boundary (required + optional-context files), resolves the optional requirements ref, allocates the review-id, runs a scope-creep pre-check against the requirements, and pulls related learnings. Returns a Review Scope for the Prepare phase.
type: module
version: 1.0
timestamp: "2026-08-08"
---

# Phase 1 - Scope

**Purpose:** Entry point to the Review workflow. Classifies the incoming review target (a git change-set, a `/work` run via `work-id` / Work `review-id`, or an ad-hoc description), resolves it to a concrete **change boundary** — a `required` file list (files the change actually touches) plus an optional `context` file list (files recommended for reviewer context) — resolves the optional requirements ref, allocates the `review-id`, runs a scope-creep **pre-check** against the requirements, and pulls related learnings. Returns a [Review Scope](../references/templates/artifacts/review-scope.md) for the Prepare phase.

## Workflow

This is the Phase 1 pipeline for the Review Skill. It orchestrates the following steps:

### Step 0: Verification

Run the **[Step 0 verification](../references/error-handling.md)**. Required input: a valid **Review Input Artifact** (see [review-input.md](../references/templates/artifacts/review-input.md)) from the Orchestrator. Specifically verify:

1. The Review Input Artifact carries exactly one of: a `change-set` spec, a `work-id` (or Work `review-id`), or an `ad-hoc` description.
2. `interactionMode` is present and valid (default to `smart` if missing; log warning).
3. The required folders already exist (the Orchestrator's Pre-Flight Check is responsible for creation); do not re-create them here.

If the input is empty or ambiguous between shapes, ask the user one question: "What would you like to review? Provide a git ref/range, a work-id, or describe a target."

### Step 1: Classify Input Shape

Determine which of the three input shapes applies, by precedence:

1. **Work-linked** — the input matches an existing `docs/tasks/<work-id>/index.md` (the value is a `YYYY-MM-DD-NNN` work-id), or a Work `review-id` resolving to `docs/plans/.work/.review/<review-id>.md`.
2. **Change-set** — the input is, or contains, a git ref/range (`<base>..<head>`, `A..B`, `HEAD`, staged, a branch-vs-base diff) or a set of paths/globs.
3. **Ad-hoc** — a free-text description that matches neither of the above.

Record `input-shape: work-linked | change-set | ad-hoc`. If classification is ambiguous (e.g., a string that could be a work-id or a description), ask the user one question with the candidate shapes as options.

### Step 2: Resolve the Change Boundary (by Shape)

Resolve the classified input into a concrete **change boundary** — `required` files (files the change actually touches — added/modified/deleted/renamed) plus an optional `context` list (files recommended for reviewer context, e.g. key callers — Prepare enriches this; Scope seeds it lightly). The resolution rules are authoritative in **[change-set-resolution.md](../references/change-set-resolution.md)** — this step looks them up, it does not re-derive them.

#### 2a. Change-set

1. Parse the spec into a concrete `git diff` invocation (`<base>..<head>`, a commit range, `HEAD`/staged, or paths/globs).
2. List the files the diff touches with their status (added/modified/deleted/renamed). These are the `required` files.
3. Seed `context` lightly: for modified files, optionally note immediate callers/importers of changed public symbols (Prepare expands this); leave `context` empty if caller discovery is non-trivial here.
4. If the diff is empty (spec parses but touches no files), record `change-boundary.empty: true` and proceed — the Review Report will record a nothing-to-review outcome. Do not abort.

#### 2b. Work-linked

1. Locate the `work-id` (or, given a Work `review-id`, read `docs/plans/.work/.review/<review-id>.md` to recover the `work-id`).
2. Read `docs/tasks/<work-id>/index.md` and each task file's `files.create` / `files.modify`. The union of these is the `required` set.
3. Filter by task outcomes from the Work Report: include files from `completed` tasks; include `blocked`/`skipped` tasks' files but mark them `tentative` (their changes may be partial). Never include files from tasks that were not part of the run.
4. Optionally bound to commits attributable to the run (e.g., commits whose message references the `work-id`) — best-effort heuristic; if not discoverable, fall back to the working-tree diff of the `required` files. Note which source was used (`attribution: commits | working-tree | task-files`).
5. Seed `context` lightly as in 2a.

#### 2c. Ad-hoc

1. Map the description to concrete paths: locate matching files by path/glob and, where the description names a module/symbol, the files defining it.
2. Where applicable, find the commits that most recently touched those files (e.g. the last commit per file, or a shallow range) to derive an actual diff. If no committable diff exists, treat the current file contents as the review target and mark `attribution: current-contents`.
3. The matched files are `required`; `context` is seeded lightly (callers/importers).

### Step 3: Resolve Optional Requirements

Accept an optional requirements ref — a `/plan` plan-id, a task's `## Acceptance Criterion`, a markdown spec, or a referenced doc. This sharpens scope-creep detection (Step 4 + Analyze):

1. **If provided:** record `requirements-source` (type `plan-id | task-criterion | spec-doc | none` + path). Parse it into a structured list of criteria / expected behaviors. Scope-creep detection runs against it.
2. **If absent:** record `requirements-source: none` and continue. Analyze will **skip** the scope-creep-vs-requirements category (noting it) — Scope does not invent requirements.
3. If the ref is a `plan-id`, read `docs/plans/<plan-id>...` or `docs/tasks/<plan-id>/index.md` for the Acceptance Criteria and expected behaviors.
4. If the ref resolves ambiguously (multiple candidate specs), this is a Smart pause trigger (Step 7) — ask the user which to use.

### Step 4: Scope-Creep Pre-Check

When `requirements-source` is not `none`, run a **preliminary** scope-creep check. The detection logic is authoritative in **[scope-creep-detection.md](../references/scope-creep-detection.md)** — this step applies it, it does not re-derive it:

1. Compare the `required` file list and changed behaviors against the resolved requirements.
2. Flag any changed file/behavior **not traceable to a requirement** as a preliminary scope-creep candidate (file + the candidate reason).
3. Record `preliminary-scope-creep: [...]` (or `none`). Analyze confirms these with severity in its scope-creep category.

When `requirements-source: none`, **skip** this step and record `preliminary-scope-creep: skipped (no requirements)`.

### Step 5: Learnings Index Gate

Search `docs/learn/index.md` for entries relevant to the review domains (the changed files' domains and the requirements' domains). For the matching logic (keyword extraction, exact + fuzzy match, HIGH/MEDIUM/LOW relevance scoring, gap identification), defer to the Plan skill's **[learnings-gate-logic.md](../../plan/references/learnings-gate-logic.md)**.

- Add HIGH and MEDIUM relevance learnings to the Review Scope's `Related Learnings`. Unlike Work (which scopes learnings per task), Review scopes them to the **whole change boundary** — a learning applies to the review, not to a single file.
- Identify and document any `Learning Gaps`.

> This gate reuses the Plan skill's learnings-matching algorithm; it does not duplicate it. If `docs/learn/index.md` does not exist (arreio-init not yet run), set `Related Learnings` to empty and continue — do not block the review pipeline on a missing learnings index. But log a single explicit warning so the absence is visible rather than silently no-op'd.

### Step 6: Allocate review-id and Generate the Review Scope Artifact

1. **Allocate a `review-id`** of the form `YYYY-MM-DD-NNN` per [id-generation.md](../references/id-generation.md), counting existing `docs/review/.scope/YYYY-MM-DD-NNN-scope.md` files (or registry rows) for today. This is the pipeline umbrella id (distinct from any Work `review-id` for work-linked input — the two skills produce independent artifacts; the `work-id` is carried alongside for traceability).

2. **Assign a `scope-id`** per [id-generation.md](../references/id-generation.md) (format `YYYY-MM-DD-NNN-scope`, saved to `docs/review/.scope/`). Reuse it if the user later picks **Edit & Retry**.

3. Produce a **Review Scope Artifact** block (as markdown) following the schema in [review-scope.md](../references/templates/artifacts/review-scope.md). Include:
   - `scope-id`, `review-id`, `input-shape`, `interactionMode`
   - the `change-boundary` (`required` file list with status, plus `context` and `attribution`)
   - `requirements-source` (type + path, or `none`) and the parsed criteria when present
   - `preliminary-scope-creep` (candidates, `none`, or `skipped (no requirements)`)
   - `Related Learnings` (scoped to the change boundary) and `Learning Gaps`
   - `work-id` carried (work-linked only)

### Step 7: Present, Confirm, and Save

Apply the **[phase confirmation behavior](../references/interaction-mode-propagation.md)** for the current `interactionMode`, using these scope-specific **Smart pause triggers**:

- `input-shape` is `ad-hoc` (the change boundary was **inferred**, not user-specified — confirm it matches intent), or
- `requirements-source` resolved ambiguously (Step 3, multiple candidate specs), or
- Preliminary scope-creep candidates were detected (Step 4) and the user may want to reconsider what's in scope.

- **Detailed:** present the Review Scope and ask one question with options *(1) Proceed to Prepare, (2) Edit & Retry, (3) Abort*. On **Edit & Retry**, loop back through Steps 1–6 reusing the `scope-id` (and re-allocating `review-id` only if the input shape itself changed). On **Abort**, stop and inform the Orchestrator.
- **Smart:** pause only when a pause trigger above is true; otherwise auto-proceed.
- **Autopilot:** auto-proceed (no confirmation).

Then save the artifact to `docs/review/.scope/<scope-id>.md` (ensure `interactionMode`, `input-shape`, and `review-id` are included) and return it, with the `interactionMode` value, to the Orchestrator for the transition to Phase 2 (Prepare).

## Output: Review Scope Artifact

- Verify that the Review Scope is complete and valid: `scope-id`, `review-id`, `input-shape`, `interactionMode`, the `change-boundary` (non-empty `required` list or explicitly `empty`), `requirements-source`, and `preliminary-scope-creep`.
- Verify that the change boundary is in **dependency-safe** form: `required` files are repository-relative and carry a status; `context` is separated from `required`.
- Verify that `review-id` was allocated (scope is the allocating phase) and that `work-id` is carried for work-linked input.
- Verify that scope-creep detection was run only when requirements were present (else explicitly skipped with a note), per [scope-creep-detection.md](../references/scope-creep-detection.md).
- Verify that the artifact is saved to `docs/review/.scope/<scope-id>.md`.

> Pass the Review Scope to `prepare` (Phase 2) to gather the diffs, spec content, test context, and tool inventory.