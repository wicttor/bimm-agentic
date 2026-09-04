---
title: Review
description: Close the Work workflow by reviewing the Execution Log run simplification/consolidation (definitions authoritative in review-checklist), running a whole-work-id regression check, detecting scope creep against the Work Manifest, surfacing learnings for /learn, and gating task status to for-review (if regressions/creep detected) or completed (if clean). Updates task file frontmatter status and appends the closing Work Report status block to the task index.
type: module
version: 1.0
timestamp: "2026-08-12"
---

# Phase 4 - Review

**Purpose:** Fourth and final step in the Work workflow. Reads the [Execution Log](../references/templates/artifacts/execution-log.md) from Execute, reviews the executed code for simplification and consolidation, runs a whole-`work-id` test-regression check, detects any scope creep against the Work Manifest, and surfaces new learnings for the Learn skill (`/learn`) to persist. Appends the closing `## Work Report — <review-id>` status block to `docs/tasks/<work-id>/index.md`. Returns a [Work Report](../references/templates/artifacts/work-report.md) as the Work skill's final deliverable.

## Workflow

This is the Phase 4 pipeline for the Work Skill. It orchestrates the following steps:

### Step 0: Verification

Run the **[Step 0 verification](../references/error-handling.md)**. Required input: a valid **Execution Log** from Execute. Specifically verify:

1. The Execution Log carries `execute-id`, `prepare-id`, `triage-id`, `work-id`, `input-shape`, `interactionMode`, `executionMode`, the per-task result table, and the aggregator counts.
2. **Task-status coherence** (the orchestrator's quality gate #4): every task ended `completed`, `blocked` (with a recorded reason), or `skipped` (with a recorded reason) — none left `in-progress` — and `docs/tasks/<work-id>/index.md` checklist state matches the task files' frontmatter `status`. Execute is responsible for leaving this coherent; Review re-verifies and refuses to proceed (Category 2 recovery) if not.
3. `interactionMode` is present and valid (default to `smart` if missing; log warning).
4. Cross-phase consistency: `work-id`, `triage-id`, `prepare-id`, `execute-id` match the upstream artifacts.

If the run was empty (`work-state: nothing-ready` was carried through), Review still produces a Work Report recording that no task was runnable — do not abort.

### Step 1: Simplify and Consolidate

Review the code touched by the `completed` tasks for simplification and consolidation. The definitions and the per-check criteria are authoritative in **[review-checklist.md](../references/review-checklist.md)** — Review applies the checklist, it does not re-encode it. Run its checks across the changed files (those listed in the completed tasks' `files.create` / `files.modify`):

- **Dead code / duplication** — remove code made unreachable or duplicated by the run; honor DRY by extracting shared logic.
- **Naming and structure** — tighten intention-revealing names; collapse overlarge functions/classes to single responsibility; no speculative generality.
- **Boundary isolation** — keep side effects at the boundaries; prefer pure functions where the changes permit it.

Apply each change as a **refactor** — the relevant tasks' AC tests must stay green; if any targeted check would change behavior, treat it as scope creep (Step 3) rather than a refactor, and do not apply it here.

Record `simplification-summary` (what was simplified/clipped) and `consolidations` (any merged logic / extracted abstractions) in the Work Report.

### Step 2: Whole-Work-Id Regression Check

1. Run the full test suite for the `work-id`'s affected scope (the union of the `completed` tasks' test paths, plus any files they modified that are covered elsewhere) using the Execute-resolved test command (`runner` + `packageManager`).
2. **Compare against the Prepare baseline** recorded in the Execution Plan:
   - `baseline: green` — the suite must still be green; **any failure is a regression** (binary threshold: one failure = gate fails).
   - `baseline: snapshot-and-continue` — failures must be a subset of the recorded known-failing snapshot; any **new** failure is a regression.
3. Record `regression-check: clean | regressions-found` with the failing-test list if any. A regression found here is a gate trigger: if regressions exist, task status enters `for-review` (Step 4a).

### Step 3: Scope-Creep Detection

Compare the executed work against the Work Manifest's resolved task list and each task's single Acceptance Criterion:

1. **Per-task scope** — for each `completed` task, confirm the change in `files.create` / `files.modify` is bounded by **that task's single AC**. Edits beyond the AC (extra files touched, behavior not asserted by `files.test`) are scope creep.
2. **Manifest scope** — confirm no task was added, removed, or silently expanded beyond what Triage resolved. (A `dependency-warning: expanded-to-upstream` from the task-file shape is expected, not creep.)
3. Record `scope-creep` findings per task (file path + why it exceeds the AC), or `scope-creep: none`. Surface any creep to the user — never fold it silently into a task.

### Step 4: Scope-Creep Detection (Detailed)

Compare the executed work against the Work Manifest's resolved task list and each task's single Acceptance Criterion:

1. **Per-task scope** — for each `completed` task, confirm the change in `files.create` / `files.modify` is bounded by **that task's single AC**. Edits beyond the AC (extra files touched, behavior not asserted by `files.test`) are scope creep.
2. **Manifest scope** — confirm no task was added, removed, or silently expanded beyond what Triage resolved. (A `dependency-warning: expanded-to-upstream` from the task-file shape is expected, not creep.)
3. Record `scope-creep` findings per task (file path + why it exceeds the AC), or `scope-creep: none`. Surface any creep to the user — never fold it silently into a task. Scope-creep findings are a gate trigger (Step 4a).

### Step 4a: Gate Decision — For-Review vs. Completed

**Binary gate:** Decide task status based on the outcomes of Steps 2–3.

If **any** of the following conditions is true, set `task-status-target: for-review` (tasks will enter `status: for-review` in Step 6):

- `regression-check: regressions-found` (any test failure)
- `scope-creep` findings exist (any file/behavior exceeds AC)

Otherwise, set `task-status-target: completed` (tasks will move to `status: completed`).

Record this decision with a brief summary: e.g., "Gate passed: clean regression check, no scope creep" or "Gate blocked: regressions-found (3 new failures) + scope creep in 2 files".

### Step 5: Learnings Capture

Surface new learnings discovered during execution for the Learn skill to persist (Work does not write `docs/learn/` directly):

1. For each notable finding — a confirmed pattern, a refuted assumption, a gotcha hit, or a decision forced by the run — record a learning candidate with: a working title, the domain, the source (task-id + gate where found), and a 1–2 sentence summary.
2. Carry the Work Manifest's `Learning Gaps` forward; add any gaps the run revealed (e.g., a missing test pattern that forced a workaround).
3. Record `learnings-to-capture` (candidates) and `learning-gaps` in the Work Report. The user is prompted (per interaction mode) to run `/learn` to persist them (orthogonal to approval gates).

### Step 6: Generate the Work Report Artifact

1. **Assign a `review-id`** per [id-generation.md](../references/id-generation.md) (format `YYYY-MM-DD-NNN-review`, saved to `docs/plans/.work/.review/`). Reuse it if the user later picks **Edit & Retry**.

2. Produce a **Work Report** block (as markdown) following the schema in [work-report.md](../references/templates/artifacts/work-report.md). Include:
   - `review-id`, inherited `execute-id`, `prepare-id`, `triage-id`, `work-id`, `input-shape`
   - `interactionMode` and `executionMode` (both carried)
   - the final task-outcome rollup (echo Execute's aggregator counts: `completed` / `blocked` / `skipped`)
   - `simplification-summary` and `consolidations`
   - `regression-check` (`clean` | `regressions-found` + failing list)
   - `scope-creep` findings (or `none`)
   - `learnings-to-capture` and `learning-gaps`
   - a final `work-state`:
     - `for-review`: tasks gated to `status: for-review` (regressions or scope-creep detected; pending Standalone Review approval)
     - `complete`: all tasks `completed` and regression-clean (gate passed)
     - `partial`: some tasks `blocked`/`skipped` but progress made (all non-blocked tasks passed gate)
     - `nothing-done`: empty run or all blocked early

### Step 7: Update Task File Frontmatter and Register the Work Report

**Update task file status:**
For each task affected by the Work run (based on `task-status-target` from Step 4a):

1. Open `docs/tasks/<work-id>/T<NN>-<name>.md`
2. Update the frontmatter `status:` field:
   - If `task-status-target: for-review` → set `status: for-review`
   - If `task-status-target: completed` → set `status: completed` (as before)
3. Idempotent: re-running Review with the same `review-id` overwrites the status (never duplicates).

**Append status block to task index:**
Append the closing status block to `docs/tasks/<work-id>/index.md` (the task index Triage created / Execute updated). The block records the final state next to the checklist, so a future glance shows how the run ended:

```markdown
## Work Report — <review-id>

- **Status:** complete | partial | for-review | nothing-done
- **Tasks:** <completed>/<total> completed, <for-review> for-review, <blocked> blocked, <skipped> skipped
- **Regression check:** clean | regressions-found (<N>)
- **Scope creep:** none | <count> finding(s)
- **Learnings to capture:** <count> (run `/learn` to persist)
- **Work Report:** docs/plans/.work/.review/<review-id>.md
```

If the index does not exist (ad-hoc input that somehow lost its index), create it with the checklist before appending the block. The block is **append-only** and idempotent on `review-id` (a re-run overwrites the block with the same `review-id`, never duplicates).

### Step 8: Present, Confirm, and Save

Apply the **[phase confirmation behavior](../references/interaction-mode-propagation.md)** for the current `interactionMode`, using these review-specific **Smart pause triggers**:

- `task-status-target: for-review` (gate blocked; tasks will enter for-review), or
- `regression-check: regressions-found` (any test failures detected), or
- `scope-creep` findings exist (confirm the creep is intentional or roll it back), or
- `learnings-to-capture` is non-empty and the user may want to capture them now via `/learn` before closing.

- **Detailed:** present the Work Report and ask one question with options _(1) Finalize Work, (2) Edit & Retry, (3) Abort_. On **Edit & Retry**, loop back through Steps 1–7 reusing the `review-id` (the index block is overwritten, not duplicated, because it keys on `review-id`). On **Abort**, stop and inform the Orchestrator.
- **Smart:** pause only when a pause trigger above is true; otherwise auto-proceed.
- **Autopilot:** auto-proceed (no confirmation).

Then save the artifact to `docs/plans/.work/.review/<review-id>.md` (ensure `interactionMode` and `executionMode` are included).

### Step 9: Return to Orchestrator

Return the Work Report to the Orchestrator — `path`, `review-id`, `work-id`, `work-state`, `task-status-target`, `interactionMode`, `executionMode`, and `learnings-to-capture` count. The Orchestrator marks the Work workflow complete.

**Next steps (user-facing):**

- If `work-state: for-review`, inform the user: "Tasks have entered `for-review` status. Run `/review <work-id>` to audit them before final approval."
- Optionally chain to the Learn skill (`/learn <work-id>` or `/learn <candidate-ref>`) when `learnings-to-capture` is non-empty; otherwise the session ends.

## Output: Work Report Artifact

- Verify that the Work Report is complete and valid: `review-id`, `execute-id`, `prepare-id`, `triage-id`, `work-id`, `input-shape`, `interactionMode`, `executionMode`, the task-outcome rollup, `simplification-summary`, `consolidations`, `regression-check`, `scope-creep`, `learnings-to-capture`, and `learning-gaps`.
- Verify that **task-status coherence** held: the Execution Log's outcomes match `docs/tasks/<work-id>/index.md` and the task files' frontmatter (re-verified in Step 0).
- Verify that task files' frontmatter `status:` fields were updated to `for-review | completed` per the gate decision (Step 4a).
- Verify that the `## Work Report — <review-id>` block was appended to `docs/tasks/<work-id>/index.md` and is idempotent on `review-id` (no duplicate blocks).
- Verify that the simplification/consolidation/scope-creep/learnings rules were **applied from** [review-checklist.md](../references/review-checklist.md) rather than re-encoded inline.
- Verify that `work-state` reflects the gate outcome: `for-review | complete | partial | nothing-done`.
- Verify that the artifact is saved to `docs/plans/.work/.review/<review-id>.md`.

> The Work Report is the primary deliverable of the Work Skill. Tasks entering `for-review` status signal that Standalone Review approval is required before moving to `completed`. The Orchestrator marks the workflow complete; user runs `/review <work-id>` next if tasks are in `for-review`; optionally chains to `/learn` when learnings were surfaced (orthogonal to approval gates).
