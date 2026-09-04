---
title: Analyze
description: Third step in the Review workflow. Runs the review categories (quality / security / tests / documentation / integration / scope-creep) across the Review Kit's diffs, assigns each finding a severity (blocker / major / minor / nit) per the authoritative severity rubric, attaches a requirement trace or a scope-creep flag to every finding, and aggregates the tallies. Returns Findings for the Report phase.
type: module
version: 1.0
timestamp: "2026-08-08"
---

# Phase 3 - Analyze

**Purpose:** Third step in the Review workflow. Reads the [Review Kit](../references/templates/artifacts/review-kit.md) from Prepare, runs the review **categories** (quality / security / tests / documentation / integration / scope-creep) across the diffs, assigns each finding a **severity** (`blocker` / `major` / `minor` / `nit`) per the authoritative rubric, attaches a **requirement trace** or a **scope-creep flag** to every finding, and aggregates the tallies. Returns [Findings](../references/templates/artifacts/findings.md) for the Report phase. Analyze reviews the diffs; it does not edit the code under review (Review is read-only).

## Workflow

This is the Phase 3 pipeline for the Review Skill. It orchestrates the following steps:

### Step 0: Verification

Run the **[Step 0 verification](../references/error-handling.md)**. Required input: a valid **Review Kit** from Prepare. Specifically verify:

1. The Review Kit carries `prepare-id`, `scope-id`, `review-id`, `input-shape`, `interactionMode`, the `diffs`, `spec-content` (or `none`), `test-context`, and `tool-inventory`.
2. `interactionMode` is present and valid (default to `smart` if missing; log warning).
3. Cross-phase consistency: `review-id`, `scope-id` match the upstream artifacts; `interactionMode` is identical.

If the kit records `diffs: none` (the empty nothing-to-review case carried from Scope), Analyze produces an empty Findings set (Step 5) and returns — do not fabricate findings.

### Step 1: Run Review Categories

Run the six review categories across the kit's diffs. The category definitions and per-category checks are authoritative in **[review-categories.md](../references/review-categories.md)** — Analyze looks them up, it does not re-derive them:

- **quality** — design, clarity, DRY, naming, error handling, and structural soundness of the changed code.
- **security** — input validation, authn/authz, secret leakage, injection, and unsafe patterns introduced by the change.
- **tests** — **Test the tests:** coverage of changed behavior (from `test-context`), assertion correctness (do tests assert the intended behavior?), flakiness, test smells, and whether production-code changes ship without tests.
- **documentation** — public API docs, README, inline comments, and changelog entries for changed behavior.
- **integration** — caller/contract impact (use the kit's `context` callers), module-boundary and convention conformance, and whether the change breaks consumers.
- **scope-creep** — **only when** `spec-content` is not `none`: confirm Scope's `preliminary-scope-creep` candidates with severity, and detect any further changes beyond the requirements. When `spec-content: none`, record this category as **skipped** with the note `skipped (no requirements)` and emit no scope-creep findings (Review does not invent requirements).

Optionally run the available tools captured in `tool-inventory` (linters / type-checkers / the test suite) to **corroborate** a finding — but tools are corroborative, not authoritative: a finding must be warranted by the change, not by a pre-existing repo-wide condition outside the change boundary.

### Step 2: Assign Severity

For each finding, assign a severity per **[severity-rubric.md](../references/severity-rubric.md)** (authoritative) — Analyze assigns; it does not re-encode the rubric:

- **blocker** — must fix before merge: a security hole, data-loss risk, a broken core flow, or a regression in a green-baseline suite.
- **major** — should fix: a significant quality / test / integration issue that will cause maintenance pain.
- **minor** — nice to fix: a small quality or documentation issue.
- **nit** — style / preference; optional.

If a finding's severity is borderline, default to the **lower** severity (do not over-escalate); Report derives the approval status from the tallies.

### Step 3: Attach a Requirement Trace or a Scope-Creep Flag

Every finding must carry either a **requirement trace** or a **scope-creep flag** (the orchestrator's gate #5 requires this):

1. **Requirement trace** — for findings inside the intended scope: reference the requirement/expected-behavior from `spec-content` the finding relates to (by criterion id or short label). Format: `trace: <criterion>` (or `trace: general-quality` for quality findings that are not tied to a specific criterion but are within the change's intent — acceptable as a trace).
2. **Scope-creep flag** — for findings the change **goes beyond** the requirements: set `scope-creep: true` (no requirement trace). These findings describe the creep, not a defect in the intended change. When `spec-content: none`, all findings carry `trace: no-requirements` (scope-creep cannot be assessed) — never `scope-creep: true` without a spec.

This makes the findings set self-describing for Report's scope-creep summary and approval derivation.

### Step 4: Optionally Run Tools to Corroborate

When a finding would be strengthened by tool evidence, run the relevant configured tool from `tool-inventory`:

- Re-run the **test suite** to confirm a claimed regression (Analyze runs the changed file's covering tests, or the targeted suite) — record the result as corroboration on the finding.
- Run a **linter / type-checker** on the changed files to surface corroborated quality/security issues; attach the tool output (message + rule id) to the finding.

Tools never **create** a finding on their own outside the change boundary; they only corroborate an already-warranted finding or sharpen its severity. If a tool is unconfigured, proceed without it (Prepare already warned).

### Step 5: Aggregate Tallies and Generate the Findings Artifact

1. **Aggregate** findings by category and count by severity. Compute preliminary tallies (Report derives the final approval status from these — Analyze does not pre-derive approval).
2. **Assign an `analyze-id`** per [id-generation.md](../references/id-generation.md) (format `YYYY-MM-DD-NNN-analyze`, saved to `docs/review/.analyze/`). Reuse it if the user later picks **Edit & Retry**.
3. Produce a **Findings** block (as markdown) following the schema in [findings.md](../references/templates/artifacts/findings.md). Include:
   - `analyze-id`, inherited `prepare-id`, `scope-id`, `review-id`, `input-shape`, `interactionMode`
   - the findings list: per finding — `id`, `severity`, `category`, `location` (repository-relative `file:line` or `file:hunk`), `message`, `trace` **or** `scope-creep: true`, and an optional non-binding `suggested-fix` (Review is read-only — suggestions are informational, never applied)
   - per-category and per-severity tallies
   - a note whether the scope-creep category ran or was `skipped (no requirements)`
   - `work-id` carried (work-linked only)

### Step 6: Present, Confirm, and Save

Apply the **[phase confirmation behavior](../references/interaction-mode-propagation.md)** for the current `interactionMode`, using these analyze-specific **Smart pause triggers**:

- Any **blocker** finding was detected (pause before auto-continuing to Report), or
- Any **major** finding was detected (smart mode), or
- A finding was flagged `scope-creep: true` (confirm the creep is real before finalizing), or
- The scope-creep category ran and the count of confirmed creep findings differs from Scope's `preliminary-scope-creep` (sanity-check the delta).

- **Detailed:** present the Findings and ask one question with options *(1) Proceed to Report, (2) Edit & Retry, (3) Abort*. On **Edit & Retry**, loop back through Steps 1–5 reusing the `analyze-id`. On **Abort**, stop and inform the Orchestrator.
- **Smart:** pause only when a pause trigger above is true; otherwise auto-proceed.
- **Autopilot:** auto-proceed (no confirmation).

Then save the artifact to `docs/review/.analyze/<analyze-id>.md` (ensure `interactionMode` included) and return it, with the `interactionMode` value, to the Orchestrator for the transition to Phase 4 (Report).

## Output: Findings Artifact

- Verify that the Findings are complete and valid: `analyze-id`, `prepare-id`, `scope-id`, `review-id`, `input-shape`, `interactionMode`, the findings list, and the per-category / per-severity tallies.
- Verify **findings coherence** (orchestrator gate #5): every finding has a `severity`, a `category`, a repository-relative `location`, and either a `trace` or `scope-creep: true`.
- Verify the **scope-creep** category either ran (with `spec-content` not `none`) or is recorded `skipped (no requirements)` — never silently absent, never inventing requirements.
- Verify severities were **assigned from** [severity-rubric.md](../references/severity-rubric.md) rather than re-defined inline (no second rubric contradicting the authoritative reference).
- Verify the category checks were **run from** [review-categories.md](../references/review-categories.md) rather than re-encoded inline.
- Verify that the artifact is saved to `docs/review/.analyze/<analyze-id>.md`.

> Pass the Findings to `report` (Phase 4) for the approval-status derivation, the report write, and the registry / work-index cross-link.