---
title: Execute
description: Run the Execution Plan's ordered task list per the selected execution mode, enforcing each task's Red -> Green -> Refactor gates (definitions authoritative in task-execution-rules), updating task files and the index checklist idempotently, and producing an Execution Log for the Review phase.
type: module
version: 1.0
timestamp: "2026-08-07"
---

# Phase 3 - Execute

**Purpose:** Third step in the Work workflow. Reads the [Execution Plan](../references/templates/artifacts/execution-plan.md) from Prepare, runs its `execution-list` according to the selected `executionMode` (`inline` / `serial` / `parallel`), enforces each task's Red → Green → Refactor gates and resume/blocked/skip transitions (definitions authoritative in [task-execution-rules.md](../references/task-execution-rules.md) — this phase enforces them, it does not re-encode them), and updates each task file's status and the `docs/tasks/<work-id>/index.md` checklist idempotently. Returns an [Execution Log](../references/templates/artifacts/execution-log.md) for the Review phase.

## Workflow

This is the Phase 3 pipeline for the Work Skill. It orchestrates the following steps:

### Step 0: Verification

Run the **[Step 0 verification](../references/error-handling.md)**. Required input: a valid **Execution Plan** from Prepare. Specifically verify:

1. The Execution Plan carries `prepare-id`, `triage-id`, `work-id`, `input-shape`, `interactionMode`, `executionMode`, `execution-list`, `runner`, `baseline`, and `applicable-gates`.
2. `executionMode` is one of `inline` / `serial` / `parallel` (and resolves per the risk floor in [execution-mode-selection.md](../references/execution-mode-selection.md) — any HIGH-risk task must have `inline` treatment).
3. `interactionMode` is present and valid (default to `smart` if missing; log warning).
4. Cross-phase consistency: `work-id`, `triage-id` match the upstream artifacts.

If `work-state: nothing-ready`, the execution-list is empty — record an empty Execution Log (Step 5) and return to the Orchestrator; do not run any test.

### Step 1: Resolve the Test Command Per Task

1. **Read `runner` and (for Node.js) `packageManager`** from the Execution Plan (Prepare detected them). Build the per-task test invocation from the task's `files.test`:
   - Node.js (npm): `npm test -- <test-path>` (or `npx jest <test-path>` / `npx vitest run <test-path>` when `scripts.test` is absent).
   - Node.js (pnpm): `pnpm test -- <test-path>` (or `pnpm exec jest <test-path>` / `pnpm exec vitest run <test-path>`).
   - Python: `pytest <test-path>`; Go: `go test <test-path>`; Rust: `cargo test <test-path>`; Ruby: `bundle exec rspec <test-path>`; PHP: `vendor/bin/phpunit <test-path>`; Java/Kotlin: `mvn -Dtest=<...> test` / `gradle test --tests <...>`.
2. If `runner: unknown`, stop and ask the user for the project's test command before proceeding (Prepare should have resolved this; treat its absence here as a Category 2 recovery per [error-handling.md](../references/error-handling.md)).
3. If a task's production code needs a dependency not yet installed (e.g., a new package add in a Red/Green step), install it with the resolved package manager (`pnpm add` / `npm install`) only when the task's Green step requires it — not preemptively.

### Step 2: Execute the List Per Execution Mode

Run `execution-list` according to `executionMode`. The mode flows are defined canonically in **[execution-mode-selection.md](../references/execution-mode-selection.md)** — Execute follows them; it does not re-derive them:

- **`inline`** — one task at a time. After each task completes or blocks, pause for the user (the `single-task-pause: true` flag) and re-confirm before the next task's Red (destructive) step. Best when `interactionMode: detailed` or any task is HIGH-risk; it is the only mode allowed for a HIGH-risk task.
- **`serial`** — run the flat ordered list sequentially. Do **not** pause between tasks; stop only when a task becomes `blocked` (then surface the reason and ask the user whether to continue with remaining independent tasks, retry, or abort).
- **`parallel`** — run each wave's independent tasks concurrently; waves run in order (Wave 0 fully settles before Wave 1 starts). A blocked task blocks only its dependents in later waves, not the whole wave.

**Resume at entry:** before running each task, read its task-file frontmatter `status`. A `completed` task is skipped (never re-opened). A `blocked` or `skipped` task is carried with its recorded reason and not auto-retried. Only `not-started` / `in-progress` tasks in `execution-list` are run. (Definitions authoritative in [task-execution-rules.md](../references/task-execution-rules.md).)

### Step 3: Per-Task Execution Cycle (Red → Green → Refactor)

For each runnable task, run the three-phase cycle and enforce the gates. The gate criteria and the retry-limit / blocked / skip thresholds are recorded read-only in the Execution Plan (Prepare read them from [task-execution-rules.md](../references/task-execution-rules.md)) — Execute applies them, it does not redefine them:

1. **Red** — write (or, on resume, confirm) the task's single Acceptance-Criterion test at its `files.test[0]`; run it and confirm it **fails for the right reason** (not a setup/import/compile error). Gate: failing assertion matches the AC. If the test passes immediately (already green), log it and re-check whether the AC is genuinely satisfied — the task may already be done (status `completed` on resume).

2. **Green** — implement the minimum code in the task's `files.create` / `files.modify` to make the AC test pass. Gate: the task's single test is green **and** there is no regression beyond the Step 1 baseline — if `baseline: snapshot-and-continue`, the regression gate ignores the known-failing test set recorded in the Execution Plan.

3. **Refactor** — clean up naming, duplication, and structure while keeping the AC test green. Gate: the test stays green and there is no regression. No behavior change.

### Step 4: Status Updates (Per Task)

After each task's gates pass (or a transition fires), update its artifacts. Updates are **idempotent** — re-running Execute never resets a `completed` task or a `- [x]` checkbox:

1. **On `completed`:**
   - Set the task-file frontmatter `status: completed` and flip the `## Acceptance Criteria` checkbox to `- [x]`.
   - In `docs/tasks/<work-id>/index.md`, tick that task's row from `- [ ]` to `- [x]`.
2. **On `blocked`** (Green gate not reached within the retry-limit recorded in the Execution Plan):
   - Set frontmatter `status: blocked`, record a `reason` (the failing assertion snapshot and which gate failed).
   - Leave the index checkbox as `- [ ]` and append a `— blocked: <reason>` note.
   - Per the mode flow: `inline`/`serial` pause and surface; `parallel` blocks only dependents in later waves.
3. **On `skip`** (explicit user confirmation only — never auto-skip):
   - Set frontmatter `status: skipped` with a recorded `reason`.
   - Leave the index checkbox as `- [ ]` and append a `— skipped: <reason>` note.
4. **Mid-task (`in-progress`):** if Execute is interrupted mid-task, set frontmatter `status: in-progress` so a resume re-enters the cycle at the right gate; do **not** tick the checkbox.

> Task-status coherence: the orchestrator's post-Execute quality gate (#4) requires every task to be `completed`, `blocked`, or `skipped` (with reasons) — none left `in-progress` — and the index checklist state must match the task files' frontmatter. Execute is responsible for leaving the state coherent at the end of the run.

### Step 5: Generate the Execution Log Artifact

1. **Assign an `execute-id`** per [id-generation.md](../references/id-generation.md) (format `YYYY-MM-DD-NNN-execute`, saved to `docs/plans/.work/.execute/`). Reuse it if the user later picks **Edit & Retry**.

2. Produce an **Execution Log** block (as markdown) following the schema in [execution-log.md](../references/templates/artifacts/execution-log.md). Include:
   - `execute-id`, inherited `prepare-id`, `triage-id`, `work-id`, `input-shape`
   - `interactionMode` and `executionMode` (both carried)
   - a per-task result table: `task-id`, `outcome` (`completed` / `blocked` / `skipped`), gate trace (Red/Green/Refactor pass timestamps), and any `reason`
   - aggregator counts: `completed`/`blocked`/`skipped` counts and the regression-detection summary (any new failures beyond the baseline snapshot)
   - final index-checklist state (matches the task files)

### Step 6: Present, Confirm, and Save

Apply the **[phase confirmation behavior](../references/interaction-mode-propagation.md)** for the current `interactionMode`, using these execute-specific **Smart pause triggers** (in addition to the per-task pauses mandated by `inline` mode and by a `blocked` task):

- A task hit the retry-limit and went `blocked` (decide before auto-continuing remaining independent tasks), or
- A new regression beyond the baseline snapshot appears on a `completed` task's Refactor re-run, or
- `executionMode: parallel` and a blocked task in an earlier wave leaves later dependent tasks unable to run.

- **Detailed:** summarize the Execution Log and ask one question with options *(1) Proceed to Review, (2) Edit & Retry, (3) Abort*. On **Edit & Retry**, loop back through Steps 1–5 reusing the `execute-id`. On **Abort**, stop and inform the Orchestrator.
- **Smart:** pause only when a pause trigger above is true; otherwise auto-proceed.
- **Autopilot:** auto-proceed (no confirmation).

Then save the artifact to `docs/plans/.work/.execute/<execute-id>.md` (ensure `interactionMode` and `executionMode` are included) and return it, with both mode values, to the Orchestrator for the transition to Phase 4 (Review).

## Output: Execution Log Artifact

- Verify that the Execution Log is complete and valid: `execute-id`, `prepare-id`, `triage-id`, `work-id`, `input-shape`, `interactionMode`, `executionMode`, the per-task result table, and the aggregator counts.
- Verify **task-status coherence**: every task in `execution-list` ended `completed`, `blocked` (with reason), or `skipped` (with reason) — none left `in-progress` — and `docs/tasks/<work-id>/index.md` checklist state matches the task files' frontmatter `status`.
- Verify that each `completed` task has its `## Acceptance Criteria` checkbox flipped to `- [x]` and the index ticked `- [ ] → - [x]` (forward only — never reset).
- Verify that every `completed` task's single AC test is green with no new regression beyond the recorded baseline snapshot.
- Verify that the gate/transition behavior was **enforced from** [task-execution-rules.md](../references/task-execution-rules.md) and [execution-mode-selection.md](../references/execution-mode-selection.md) rather than re-defined inline.
- Verify that the artifact is saved to `docs/plans/.work/.execute/<execute-id>.md`.

> Pass the Execution Log to `review` (Phase 4) for the simplification, consolidation, and learnings-capture pass.