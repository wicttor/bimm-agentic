---
title: Prepare
description: Set up the execution environment, assemble the ordered execution list from the Work Manifest, select an execution mode (inline/serial/parallel), select the per-task gates from task-execution-rules, and return an Execution Plan for the Execute phase.
type: module
version: 1.0
timestamp: "2026-08-07"
---

# Phase 2 - Prepare

**Purpose:** Second step in the Work workflow. Reads the [Work Manifest](../references/templates/artifacts/work-manifest.md) from Triage, verifies the test execution environment and establishes a green baseline, assembles the ordered execution list from the manifest's `ready-tasks`, selects an execution mode, and selects the per-task quality gates (Red → Green → Refactor) and resume/blocked/skip policy from their authoritative references — without re-encoding them. Returns an [Execution Plan](../references/templates/artifacts/execution-plan.md) that the Execute phase consumes.

## Workflow

This is the Phase 2 pipeline for the Work Skill. It orchestrates the following steps:

### Step 0: Verification

Run the **[Step 0 verification](../references/error-handling.md)**. Required input: a valid **Work Manifest** from Triage. Specifically verify:

1. The Work Manifest carries `triage-id`, `work-id`, `input-shape`, `interactionMode`, the resolved task list, and `ready-tasks`.
2. Every manifest task preserves the `/plan` invariants (one Acceptance Criterion → one `files.test` → Red → Green → Refactor steps).
3. `interactionMode` is present and valid (default to `smart` if missing; log warning).
4. Cross-phase consistency: `work-id` matches the Triage output; `interactionMode` is identical across artifacts.

If the manifest reports `work-state: nothing-ready` (no runnable task), do **not** abort — Prepare still runs Steps 1–4 to produce an Execution Plan that records the empty run; the Review phase handles the outcome.

### Step 1: Verify the Test Execution Environment

1. **Detect the test runner** from config files in repository root:

   | Tech Stack | Config File(s)                        | Test Command (capability)          |
   | ---------- | ------------------------------------- | ----------------------------------- |
   | Node.js (npm)  | `package.json` + `package-lock.json`; `scripts.test`, or `jest`/`vitest`/`mocha` in deps | `npm test` / `npx jest` / `npx vitest` |
   | Node.js (pnpm) | `package.json` + `pnpm-lock.yaml`; `scripts.test`, or `jest`/`vitest`/`mocha` in deps | `pnpm test` / `pnpm exec jest` / `pnpm exec vitest` |
   | Python     | `pyproject.toml` / `pytest.ini` / `setup.cfg` | `pytest`                            |
   | Go         | `go.mod` + `*_test.go`                | `go test ./...`                     |
   | Rust       | `Cargo.toml`                          | `cargo test`                        |
   | Ruby       | `Gemfile` (rspec/minitest)            | `bundle exec rspec`                 |
   | PHP        | `composer.json` (phpunit)             | `vendor/bin/phpunit`                |
   | Java/Kotlin | `pom.xml` / `build.gradle`            | `mvn test` / `gradle test`          |

   **Node.js package manager detection:** read lockfiles to pick npm vs pnpm — `package-lock.json` → npm; `pnpm-lock.yaml` → pnpm. If both lockfiles exist, prefer the one that matches `package.json`'s `packageManager` field; if that is also unset, ask the user which to use. Record `packageManager: npm | pnpm` for Execute so every test/install command uses it consistently.

   If NO config files match, record `runner: unknown` and ask the user for the project's test command before proceeding.

2. **Establish a green baseline.** Run the existing test suite (or the targeted test path covering the tasks in scope) to confirm the suite runs and is green. Record `baseline: green` (exit clean) or `baseline: red` (pre-existing failures).
   - **If `baseline: red`:** do not proceed silently. This is a Smart pause trigger — ask the user one question:
     ```
     The existing test suite is currently red (<N> failures), so later regressions cannot be detected reliably.
     What would you like to do?
      - Fix baseline first: Resolve the pre-existing failures before running Work
      - Snapshot & continue: Record the currently-failing tests as the known-baseline; Execute only flags *new* regressions
      - Abort: Stop and return to the Orchestrator
     ```
   - On **Snapshot & continue**, record the set of known-failing tests in the Execution Plan so Execute's regression gate ignores them (per the `snapshot & continue` policy in [task-execution-rules.md](../references/task-execution-rules.md)).

3. **Verify each `files.test` path resolves** against the working directory (or will be created by Red — a not-yet-existing test path is valid for a Red step). Only surface a problem if the *directory* the test should live in doesn't exist and can't be created. Do not create files here; Execute writes tests.

### Step 2: Assemble the Ordered Execution List

1. **Take `ready-tasks`** from the Work Manifest (already dependency-filtered in Triage Step 4). Preserve the manifest's dependency order — do not re-sort.
2. **Group into execution waves** (used only if Step 3 selects `parallel`):
   - **Wave 0** — tasks with all dependencies already `completed` (the manifest's `ready-tasks` with satisfied deps).
   - **Wave N** — tasks all of whose dependencies are in Waves `< N`; each wave is independent internally and can run concurrently.
   - Within a wave, order by original unit number for stable output.
3. Record the ordered list (flat for `inline`/`serial`; wave-grouped for `parallel`) as `execution-list`. If `input-shape: task-file` with the user having chosen **Proceed anyway**, the list is still the single task — record `upstream-skipped: true`.

### Step 3: Select Execution Mode

Select how `execution-list` is run. The three modes are defined canonically in **[execution-mode-selection.md](../references/execution-mode-selection.md)** — this step looks them up, it does not re-derive them:

| Mode       | Behavior                                                                    | Default when                                       |
| ---------- | --------------------------------------------------------------------------- | -------------------------------------------------- |
| `inline`   | One task at a time; pause between tasks; re-confirm the user before each destructive step. | `interactionMode: detailed`, **or** any `P0`/HIGH-risk task is in the list |
| `serial`   | Run the ordered list sequentially; no per-task pause (still stops on a blocked task). | Default fallback — most task lists                 |
| `parallel` | Run each wave's independent tasks concurrently (waves run in order).        | `execution-list` has 2+ independent waves **and** none is HIGH-risk |

1. **Compute the default** from the table above, reading each task's `priority` and any HIGH-risk flag carried from the manifest.
2. **Apply the risk floor (authoritative in [execution-mode-selection.md](../references/execution-mode-selection.md)):** any HIGH-risk task forces `inline` for that task; the user may not downgrade a HIGH-risk task below `inline`.
3. **Determine user preference:**
   - **Detailed:** ask the user which mode to run, presenting the recommendation.
   - **Smart:** auto-select, unless a pause trigger fires (Step 7).
   - **Autopilot:** auto-select; never ask.
4. **Honor user preference** unless it violates the risk floor; on violation, ask the user to accept `inline` instead.
5. Record `executionMode: inline | serial | parallel` and the per-mode flow (`single-task-pause: true` for inline; `waves: [...]` for parallel).

### Step 4: Select Per-Task Gates and Resume Policy

Select the gates and transitions Execute will enforce. Their definitions are authoritative in **[task-execution-rules.md](../references/task-execution-rules.md)** — this step records which gates apply and the thresholds, it does not re-encode the rules:

1. **Per-task gates** (record the applicable set):
   - **Red** — the new test in `files.test` exists and **fails for the right reason** (not a setup/import/compile error).
   - **Green** — the task's single Acceptance-Criterion test now passes, with no new regression beyond the Step 1 baseline.
   - **Refactor** — the test stays green after cleanup, with no regression.
   - **Complete transition** — frontmatter `status → completed`; the task file's `## Acceptance Criteria` checkbox flips to `- [x]`; the index checklist ticks forward (`- [ ]` → `- [x]`).
2. **Resume policy (authoritative in [task-execution-rules.md](../references/task-execution-rules.md)):**
   - Re-entry reads each task file's `status`; a `completed` task is skipped (never re-opened, checkboxes never reset).
   - `blocked` and `skipped` tasks are carried with their recorded reasons; they are not auto-retried.
3. **Blocked transition (record the thresholds; definitions in [task-execution-rules.md](../references/task-execution-rules.md)):** if the Green gate isn't reached within the documented retry limit, the task → `blocked` with a recorded reason and a per-task snapshot of the failing assertion. Execute pauses (per mode) before the next task.
4. **Skip transition:** skipping a task requires explicit user confirmation (never auto-skip); the index checkbox stays `- [ ]` and the reason is recorded.

Record the selected `applicable-gates` and thresholds (retry-limit, regression policy from Step 1) in the Execution Plan so Execute enforces them read-only.

### Step 5: Generate the Execution Plan Artifact

1. **Assign a `prepare-id`** per [id-generation.md](../references/id-generation.md) (format `YYYY-MM-DD-NNN-prepare`, saved to `docs/plans/.work/.prepare/`). Reuse it if the user later picks **Edit & Retry**.

2. Produce an **Execution Plan** block (as markdown) following the schema in [execution-plan.md](../references/templates/artifacts/execution-plan.md). Include:
   - `prepare-id`, inherited `triage-id` and `work-id`, `input-shape`
   - `interactionMode` and `executionMode`
   - the `execution-list` (flat or wave-grouped)
   - `runner` + test command, `baseline` (`green` | `red` | `snapshot-and-continue`), and any known-failing test snapshot
   - `applicable-gates`, retry-limit, and resume/blocked/skip policy (read from [task-execution-rules.md](../references/task-execution-rules.md))
   - `work-state` (echo `nothing-ready` if the manifest carried it)

### Step 6: Present, Confirm, and Save

Apply the **[phase confirmation behavior](../references/interaction-mode-propagation.md)** for the current `interactionMode`, using these prepare-specific **Smart pause triggers**:

- `baseline: red` and the user has not yet chosen a baseline policy (Step 1), or
- `executionMode: parallel` on an execution list of > 5 tasks (concurrency risk), or
- A HIGH-risk task is present but the selected `executionMode` would not give it `inline` treatment (risk-floor conflict pre-override).

- **Detailed:** present the Execution Plan and ask one question with options *(1) Proceed to Execute, (2) Edit & Retry, (3) Abort*. On **Edit & Retry**, loop back through Steps 1–5 reusing the `prepare-id`. On **Abort**, stop and inform the Orchestrator.
- **Smart:** pause only when a pause trigger above is true; otherwise auto-proceed.
- **Autopilot:** auto-proceed (no confirmation).

Then save the artifact to `docs/plans/.work/.prepare/<prepare-id>.md` (ensure `interactionMode` and `executionMode` are included) and return it, with both mode values, to the Orchestrator for the transition to Phase 3 (Execute).

## Output: Execution Plan Artifact

- Verify that the Execution Plan is complete and valid: `prepare-id`, `triage-id`, `work-id`, `input-shape`, `interactionMode`, `executionMode`, `execution-list`, `runner`, `baseline`, `applicable-gates`, and resume/blocked/skip policy.
- Verify that `executionMode` is consistent with the interaction mode and the risk floor in [execution-mode-selection.md](../references/execution-mode-selection.md) (HIGH-risk → `inline`).
- Verify that the gate/policy details were **read from** [task-execution-rules.md](../references/task-execution-rules.md) rather than re-encoded inline (no second formula contradicting the authoritative reference).
- Verify that `execution-list` preserves the manifest's dependency order (no task before its dependencies) and that wave-grouping (if `parallel`) respects dependency layers.
- Verify that the `baseline` policy is recorded (a red baseline was surfaced, not hidden).
- Verify that the artifact is saved to `docs/plans/.work/.prepare/<prepare-id>.md`.

> Pass the Execution Plan to `execute` (Phase 3) for the test-first execution run.