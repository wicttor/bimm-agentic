---
title: Prepare
description: Second step in the Review workflow. Reads the Review Scope, gathers the diffs/hunks for the change boundary, resolves the spec content (when requirements are present), derives test context (which tests cover the changed files and whether the change ships its own tests), and inventories available static-analysis tools. Returns a Review Kit for the Analyze phase.
type: module
version: 1.0
timestamp: "2026-08-08"
---

# Phase 2 - Prepare

**Purpose:** Second step in the Review workflow. Reads the [Review Scope](../references/templates/artifacts/review-scope.md) from Scope, gathers the actual diffs/hunks for the change boundary's `required` files (and enriches the `context` list with key callers/importers), resolves the spec content when `requirements-source` is present, derives the **test context** (which tests cover the changed files, and whether the change ships its own tests), and inventories the available static-analysis tools (linters / type-checkers / test runner) for Analyze to optionally corroborate findings. Returns a [Review Kit](../references/templates/artifacts/review-kit.md) for the Analyze phase. Prepare gathers materials; it does not run the analysis.

## Workflow

This is the Phase 2 pipeline for the Review Skill. It orchestrates the following steps:

### Step 0: Verification

Run the **[Step 0 verification](../references/error-handling.md)**. Required input: a valid **Review Scope** from Scope. Specifically verify:

1. The Review Scope carries `scope-id`, `review-id`, `input-shape`, `interactionMode`, the `change-boundary` (`required` + `context` + `attribution`), `requirements-source`, and `preliminary-scope-creep`.
2. `interactionMode` is present and valid (default to `smart` if missing; log warning).
3. Cross-phase consistency: `review-id` matches the Scope output; `interactionMode` is identical across artifacts.

If the change boundary is explicitly `empty` (Scope recorded a nothing-to-review case), Prepare still produces a minimal Review Kit recording `diffs: none` — do not abort; Analyze will record an empty findings set.

### Step 1: Gather the Diffs and Enrich Context

1. For each `required` file in the change boundary, gather the actual diff/hunks using the `attribution` source recorded in the Scope:
   - `commits` — `git diff <base>..<head> -- <files>` (or the per-file range).
   - `working-tree` — `git diff -- <files>` (and `git diff --cached -- <files>` for staged portions).
   - `task-files` (work-linked, no attributable commits) — the working-tree diff of the `required` files; note `diff-source: working-tree-fallback`.
   - `current-contents` (ad-hoc, no diff) — record the file's current contents as the review target (`diff-source: current-contents`); no hunks.
2. Capture per file: status (added/modified/deleted/renamed), line counts (`+N / -M`), and the hunks. Deleted files record the deletion (no hunks to review).
3. **Enrich `context`:** for each modified `required` file, discover key callers/importers of changed public symbols (best-effort: grep import/usage). Record them in `context` with a one-line role ("caller of `foo()`"). Keep this bounded — `context` is reviewer aid, not a second `required` set.

> This step gathers diffs; it does not edit anything. Prepare is read-only with respect to the code under review.

### Step 2: Resolve the Spec Content (when requirements present)

If `requirements-source` is **not** `none`, resolve the source into a structured spec excerpt Analyze will test the change against:

1. `plan-id` — read the final plan at `docs/plans/<plan-id>*.md` and/or `docs/tasks/<plan-id>/index.md`; extract the relevant Acceptance Criteria and expected behaviors.
2. `task-criterion` — read the single task's `## Acceptance Criterion` (and its expected behavior).
3. `spec-doc` — read the referenced markdown/doc and extract the relevant sections.
4. Record `spec-content` as a structured list (`criterion` + `expected-behavior` per item). If the source exists but the relevant content could not be fully located (partial), that is a Smart pause trigger (Step 6).

If `requirements-source: none`, record `spec: none` and skip — Analyze will skip the scope-creep-vs-requirements category accordingly.

### Step 3: Derive the Test Context

For each `required` file, identify tests that cover it — Analyze's **tests** category uses this to judge coverage and assertion correctness:

1. **Detect the test runner** from config files in repository root using standard signals (`package.json` + `package-lock.json`/`pnpm-lock.yaml` → npm/pnpm with `jest`/`vitest`/`mocha`; `pyproject.toml`/`pytest.ini` → pytest; `go.mod` + `*_test.go` → go test; `Cargo.toml` → cargo test; `Gemfile` → rspec; `composer.json` → phpunit; `pom.xml`/`build.gradle` → mvn/gradle). Record `test-runner` (and `packageManager` for Node.js). This is informational context, not an authoritative gate.
2. **Find covering tests** for each changed file by: (a) naming-convention match (`foo.ts` → `foo.test.ts`; `test_foo.py`; `foo_test.go`), and (b) grepping test files for imports of the changed module/symbol. Record, per changed file, the covering test files (possibly empty).
3. **Note whether the change ships its own tests** — i.e. whether any test files appear in the `required` (added/modified) set. A change that adds production code with **no** accompanying test is itself a finding candidate Analyze will evaluate.

### Step 4: Inventory Static-Analysis Tools

Detect available static analysis Analyze may optionally run to corroborate findings (corroborative, not authoritative — Analyze frames findings against the change, not the whole repo). Record the tool inventory (name + command + `configured: true|false` for this repo):

- **Linters** — `eslint` (`.eslintrc*`), `ruff` (`pyproject.toml`), `golangci-lint` (`.golangci.yml`), `rubocop` (`.rubocop.yml`), `clippy` (`Cargo.toml`), `phpstan`, `checkstyle`.
- **Type-checkers** — `tsc` (`tsconfig.json`), `mypy`/`pyright`, `gotype`.
- **Formatters** — `prettier`, `black`, `gofmt` (informational only).
- **Test runner** — carried from Step 3 (Analyze may re-run the suite to confirm a claimed regression).

If **no** linter/type-checker is configured for the repo, that is a Smart pause trigger (warn, do not block — Analyze proceeds with manual analysis and notes the absence). The inventory is informational; Prepare does not run these tools.

### Step 5: Generate the Review Kit Artifact

1. **Assign a `prepare-id`** per [id-generation.md](../references/id-generation.md) (format `YYYY-MM-DD-NNN-prepare`, saved to `docs/review/.prepare/`). Reuse it if the user later picks **Edit & Retry**.

2. Produce a **Review Kit** block (as markdown) following the schema in [review-kit.md](../references/templates/artifacts/review-kit.md). Include:
   - `prepare-id`, inherited `scope-id` and `review-id`, `input-shape`, `interactionMode`
   - the `diffs` (per-file status, line counts, hunks; `diff-source`) plus the enriched `context` (callers/importers)
   - `spec-content` (the structured criteria list, or `none`)
   - `test-context` (per changed file: covering tests; whether the change ships its own tests)
   - `tool-inventory` (linters/type-checkers/test runner with `configured` flags)
   - `work-id` carried (work-linked only)

### Step 6: Present, Confirm, and Save

Apply the **[phase confirmation behavior](../references/interaction-mode-propagation.md)** for the current `interactionMode`, using these prepare-specific **Smart pause triggers**:

- `requirements-source` was present but `spec-content` resolved only partially (Step 2), or
- A `required` file has **no** covering test **and** the change ships **no** accompanying test (Step 3) — a likely test-gap, confirm before Analyze flags it, or
- No linter/type-checker is configured for the repo (Step 4) — warn and continue; do not block.

- **Detailed:** present the Review Kit and ask one question with options *(1) Proceed to Analyze, (2) Edit & Retry, (3) Abort*. On **Edit & Retry**, loop back through Steps 1–4 reusing the `prepare-id`. On **Abort**, stop and inform the Orchestrator.
- **Smart:** pause only when a pause trigger above is true; otherwise auto-proceed.
- **Autopilot:** auto-proceed (no confirmation).

Then save the artifact to `docs/review/.prepare/<prepare-id>.md` (ensure `interactionMode` included) and return it, with the `interactionMode` value, to the Orchestrator for the transition to Phase 3 (Analyze).

## Output: Review Kit Artifact

- Verify that the Review Kit is complete and valid: `prepare-id`, `scope-id`, `review-id`, `input-shape`, `interactionMode`, the `diffs`, `spec-content` (or `none`), `test-context`, and `tool-inventory`.
- Verify that every `required` file has a diff entry (or is recorded as deleted / `current-contents`) and that `context` is separated from `required`.
- Verify that `test-context` records covering tests per changed file and whether the change ships its own tests.
- Verify that `requirements-source: none` propagated as `spec: none` (so Analyze skips the requirements-vs-scope-creep category rather than guessing).
- Verify that the artifact is saved to `docs/review/.prepare/<prepare-id>.md`.

> Pass the Review Kit to `analyze` (Phase 3) for the categorized, severity-graded review of the diffs.