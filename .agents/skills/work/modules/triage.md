---
title: Triage
description: Classify work input (plan-id, task file, or ad-hoc description), resolve it into a unified, dependency-ordered Work Manifest carrying one Acceptance Criterion per task with a Red-first test, and return it for the Prepare phase.
type: module
version: 1.0
timestamp: "2026-08-07"
---

# Phase 1 - Triage & Work Input Resolution

**Purpose:** Entry point to the Work workflow. Classifies the incoming work input (a plan-id, a single task file, or an ad-hoc description), resolves it into a unified, dependency-ordered **Work Manifest** — one task per Acceptance Criterion, each carrying its own Red → Green → Refactor test — establishes the git work branch (`work/<short-description>`) for the run, and returns it for the Prepare phase to sequence and select an execution mode.

## Workflow

This is the Phase 1 pipeline for the Work Skill. It orchestrates the following steps:

### Step 0: Verification

Run the **[Step 0 verification](../references/error-handling.md)**. Required input: a valid **Work Input Artifact** (see [work-input.md](../references/templates/artifacts/work-input.md)) from the Orchestrator. Specifically verify:

1. The Work Input Artifact carries exactly one of: a `plan-id`, a `task-file path` (or task-id), or an `ad-hoc` description.
2. `interactionMode` is present and valid (default to `smart` if missing; log warning).
3. The required folders already exist (the Orchestrator's Pre-Flight Check is responsible for creation); do not re-create them here.

If the input is empty or ambiguous between shapes, ask the user one question: "What would you like to work on? Provide a plan-id, a task file, or describe the task."

### Step 1: Classify Input Shape

Determine which of the three input shapes applies, by precedence:

1. **Plan-based** — the input matches an existing `docs/tasks/<plan-id>/index.md` (the value is a `YYYY-MM-DD-NNN` plan-id, or a path resolving to a `docs/tasks/<id>/index.md`).
2. **Task-file** — the input is, or resolves to, a path matching `docs/tasks/<plan-id>/T<NN>-<name>.md`, or a task-id matching `<plan-id>-T<NN>`.
3. **Ad-hoc** — the input is a free-text description that matches neither of the above.

Record `input-shape: plan-based | task-file | ad-hoc`. If classification is ambiguous (e.g., a string that could be a plan-id or a description), ask the user one question with the candidate shapes as options.

### Step 2: Resolve to Work Manifest (by Shape)

Resolve the classified input into a unified **Work Manifest** — a single task list where each entry is keyed by `task-id` and carries `unit`, `acceptance-criterion`, `files`, `dependencies`, `priority`, and current `status`. Each task preserves the `/plan` invariant: exactly one Acceptance Criterion, exactly one `files.test`, Red → Green → Refactor steps.

#### 2a. Plan-based

1. Read `docs/tasks/<plan-id>/index.md` and parse the task checklist into an ordered list of task file paths.
2. Set `work-id = plan-id` (inherited — never allocate a new id).
3. For each task file, parse its frontmatter (`id`, `title`, `plan-id`, `unit`, `status`, `priority`, `dependencies`, `files`, `estimated-effort`) and body sections.
4. Build the manifest in **dependency order** using the same topological ordering as the `/plan` Tasks phase (a task never appears before its dependencies). On a cycle, surface the involved tasks and ask the user whether to break the cycle (remove a dependency) or abort.
5. Record the full task list. Do **not** filter by status here — resume filtering happens in Step 4.

#### 2b. Task-file

1. Locate the single task file. If given a task-id (`<plan-id>-T<NN>`), resolve it to the unique `docs/tasks/<plan-id>/T<NN>-*.md` match (exactly one expected; if multiple match, ask the user to disambiguate).
2. Set `work-id = plan-id` inferred from the file's folder.
3. Parse the task file into a one-entry manifest.
4. Read the task's `dependencies`; for each referenced `task-id`, read that upstream task file's `status`:
   - If **all** upstream tasks are `completed`: no warning; proceed.
   - If **any** upstream task is not `completed`: this is a Smart pause trigger. Ask the user one question:
     ```
     Task <id> depends on <upstream-ids> which are not yet completed.
     What would you like to do?
      - Proceed anyway: Run this task's Red→Green→Refactor cycle now
      - Run upstream first: Execute the missing upstream task(s) before this one
      - Abort: Stop and return to the Orchestrator
     ```
     - **Proceed anyway:** keep the single-task manifest; record `dependency-warning: proceeded-without-upstream`.
     - **Run upstream first:** switch to the plan-based path (Step 2a) scoped to the unmet upstream tasks **plus** this task, in dependency order; record `dependency-warning: expanded-to-upstream`.
     - **Abort:** stop and inform the Orchestrator.
5. The manifest contains **only this one task** (plus any upstream tasks the user chose to add). It **never** includes downstream dependents of this task.

#### 2c. Ad-hoc

1. Allocate a fresh `work-id` of the form `YYYY-MM-DD-NNN`, counting existing `docs/tasks/YYYY-MM-DD-NNN/` folders for today (per [id-generation.md](../references/id-generation.md)).

2. Resolve the raw description into task-shaped work — **one Acceptance Criterion per task, one test per task, Red-first**. For the resolution rules (problem-frame/intended-behavior collection, AC extraction, test-file assignment, sizing, dependency ordering, priority assignment), see **[ad-hoc-input-resolution.md](../references/ad-hoc-input-resolution.md)**. Minimally:
   - Identify the problem frame and intended behavior from the description; if either is missing or vague, ask the user one question at a time to collect them.
   - Derive 1–3 Acceptance Criteria, **one AC per task**. If a criterion would need > 5 files or > 1 day of effort, split it into finer sub-criteria (mirror the `/plan` task-slicing rules — one test per AC).
   - For each task: assign a dedicated test file, populate `files.create`/`files.modify` from the description, and draft Red → Green → Refactor steps.
   - Order tasks by dependency; assign priorities (`P0` / `P1` / `P2`).

Do **not** write any files in this step — task-file materialization is deferred to Step 2e, so the work branch exists before anything is written (Step 2d).

#### 2d. Work Branch Creation

Every new feature or plan runs on its own git branch. This step runs for all input shapes, after the shape-specific resolution (2a/2b/2c) and **before any file is written** (the dirty-tree check must see the pre-work state).

1. **Verify git repository:** confirm the working directory is inside a git repository (e.g., `git rev-parse --is-inside-work-tree`). If not, record `work-branch: null` with `work-branch-state: not-a-git-repo`, log one explicit warning, and skip the remaining sub-steps — the pipeline continues without a branch.

2. **Derive the branch slug** for `work/<slug>`:
   - plan-based / task-file: from the plan's kebab-case name suffix — `docs/plans/<plan-id>-<slug>.md` or the plan title registered in `docs/plans/index.md`.
   - ad-hoc: from the resolved description — a 2–5 word kebab-case slug naming the work's subject (e.g., "fix login timeout" → `work/fix-login-timeout`).
   - Sanitize: lowercase; replace every character outside `[a-z0-9]` with `-`; collapse repeated `-`; trim leading/trailing `-`; cap at 50 characters. If the result is empty, fall back to the `work-id`.
   - If no slug can be confidently derived (vague ad-hoc description), ask the user one question: "What short name should the work branch use?" (accept the raw text and sanitize it). This is a Smart pause trigger.

3. **Dirty working tree check:** the tree must be clean (`git status --porcelain` empty). If there are uncommitted changes, **fail branch creation with an explicit error** (Category 7 in [error-handling.md](../references/error-handling.md)) and ask the user one question: (a) I've committed/stashed — retry, (b) proceed without a work branch (`work-branch-state: skipped-by-user`), or (c) abort. Never stash, commit, or carry changes silently.

4. **Determine the base branch:** detect the repository's default branch (e.g., resolve `origin/HEAD` → `main`); fall back to an existing `main`, then `master`, then the current HEAD.

5. **Select or create the branch** (idempotent — resume-safe):
   - Already on `work/<slug>` → no-op; `work-branch-state: already-on`.
   - `work/<slug>` exists but is not checked out → check it out; `work-branch-state: checked-out`.
   - Otherwise create it from the base branch (`git checkout -b work/<slug> <base>`); `work-branch-state: created`.
   - When creating and the current HEAD is not the default branch: Smart pause trigger — ask one question: (a) create from the default branch, (b) create from the current HEAD, (c) abort. Autopilot: create from the default branch and log a warning.

6. **Record** `work-branch` (branch name or `null`), `work-branch-base` (base used, or `null`), and `work-branch-state` (`created` | `checked-out` | `already-on` | `skipped-by-user` | `not-a-git-repo`) in the manifest (Step 6).

#### 2e. Materialize Ad-Hoc Task Files

Ad-hoc shape only (for plan-based/task-file, task files already exist — no-op):

1. Materialize the resolved tasks as task files under `docs/tasks/<work-id>/`:
   - Filename: `T<NN>-<kebab-case-name>.md` (`<NN>` zero-padded, matching dependency order).
   - Schema: the [Task Artifact template](../../plan/references/templates/artifacts/task.md) — set `plan-id` to `work-id`, `status: not-started`; infer `tier` from task count per the `/plan` Fast/Standard/Deep sizing (Fast ≤ 3; Standard 4–8; Deep 8–15), defaulting to `fast`.
   - Create `docs/tasks/<work-id>/index.md` with the `- [ ]` checklist for all tasks (same format as the `/plan` Tasks phase index).

2. Build the manifest by reading the newly created task files back (confirming shape parity with plan-based tasks).

### Step 3: Task Artifact Validation

For every task in the resolved manifest, validate it preserves the `/plan` invariants:

1. **One Acceptance Criterion per task** — the task carries exactly one `## Acceptance Criterion` and exactly one `files.test` entry.
2. **Red-first steps** — `## Steps` are ordered Red → Green → Refactor, with the failing test written and confirmed before implementation.
3. **Repository-relative paths** — all `files` entries are repo-relative and backtick-formatted; `files.test` holds exactly one path.
4. **Dependency integrity** — every `dependencies` entry references a `task-id` that exists (in the manifest for plan-based/ad-hoc, or in the parent plan's index for task-file input).

On any failure: never silently drop the task. Surface the specific failure and apply the recovery workflow in [error-handling.md](../references/error-handling.md) (Category 2 — Malformed Artifact): for plan-based/task-file, ask the user to fix the task or re-run the relevant `/plan` phase; for ad-hoc, regenerate the offending task from Step 2c.

### Step 4: Dependency & Resume Check

1. Read each manifest task's current `status` from its task file frontmatter.
2. **Resume-safe filtering:** a task is `ready` only if all its dependencies are `completed`. Tasks already `completed` are skipped (never re-opened — index checkboxes are ticked forward only). Tasks `blocked` or `skipped` are carried as-is with their recorded reasons.
3. Record the manifest's `ready-tasks` (to run this session) and `already-complete-tasks` (carried for the Work Report).
4. If **no** task is `ready` (all blocked or already complete), record `work-state: nothing-ready` and proceed to Step 6 — the Work Report will surface that no work was runnable. Do **not** abort; the Review phase handles the empty outcome.

### Step 5: Learnings Index Gate

Search `docs/learn/index.md` for entries relevant to the task domains in the manifest. For the matching logic (keyword extraction, exact + fuzzy match, HIGH/MEDIUM/LOW relevance scoring, gap identification, and inclusion), defer to the Plan skill's **[learnings-gate-logic.md](../../plan/references/learnings-gate-logic.md)**.

- Add HIGH and MEDIUM relevance learnings to the manifest's `Related Learnings`, scoped **per task** (a learning applies to a task, not the whole manifest — mirror the `/plan` Tasks phase, which embeds learnings in each task's `## Notes`).
- Identify and document any `Learning Gaps`.

> This gate reuses the Plan skill's learnings-matching algorithm; it does not duplicate it. If `docs/learn/index.md` does not exist (arreio-init not yet run), set `Related Learnings` to empty and continue — do not block the work pipeline on a missing learnings index. But log a single explicit warning so the absence is visible rather than silently no-op'd.

### Step 6: Generate the Work Manifest Artifact

1. **Assign a `triage-id`** per [id-generation.md](../references/id-generation.md) (format `YYYY-MM-DD-NNN-triage`, saved to `docs/plans/.work/.triage/`). Reuse it if the user later picks **Edit & Retry**.

2. Produce a **Work Manifest Artifact** block (as markdown) following the schema in [work-manifest.md](../references/templates/artifacts/work-manifest.md). Include:
   - `triage-id`, `work-id`, `input-shape`, `interactionMode`, `work-branch` (plus `work-branch-base` and `work-branch-state` from Step 2d)
   - the resolved task list (one row per task: `task-id`, `title`, `unit`, `acceptance-criterion`, `priority`, `dependencies`, `status`, `ready?`)
   - `ready-tasks` and `already-complete-tasks`
   - `Related Learnings` (per task) and `Learning Gaps`
   - any `dependency-warning` (task-file shape only)
   - `work-state` (`nothing-ready`, if applicable)

### Step 7: Present, Confirm, and Save

Apply the **[phase confirmation behavior](../references/interaction-mode-propagation.md)** for the current `interactionMode`, using these triage-specific **Smart pause triggers**:

- `input-shape` is `ad-hoc` (the resolved task list was **inferred**, not user-authored — confirm it matches intent), or
- Task-file input has an unmet upstream dependency (Step 2b warning case), or
- One or more task artifacts failed validation (Step 3) and required recovery, or
- The work branch slug could not be derived automatically and was supplied by the user (Step 2d.2), or
- The current HEAD was not the default branch when the work branch was created (Step 2d.5).

- **Detailed:** present the Work Manifest Artifact and ask one question with options *(1) Proceed to Prepare, (2) Edit & Retry, (3) Abort*. On **Edit & Retry**, loop back through Steps 1–6 reusing the `triage-id`. On **Abort**, stop and inform the Orchestrator.
- **Smart:** pause only when a pause trigger above is true; otherwise auto-proceed.
- **Autopilot:** auto-proceed (no confirmation).

Then save the artifact to `docs/plans/.work/.triage/<triage-id>.md` (ensure `interactionMode` and `input-shape` are included) and return it, with the `interactionMode` value, to the Orchestrator for the transition to Phase 2 (Prepare).

## Output: Work Manifest Artifact

- Verify that the Work Manifest Artifact is complete and valid: `triage-id`, `work-id`, `input-shape`, `interactionMode`, the resolved task list, `ready-tasks`, `Related Learnings`, and any `dependency-warning`.
- Verify that every task in the manifest carries **exactly one Acceptance Criterion**, **exactly one `files.test`**, and **Red → Green → Refactor** steps (Step 3 passed).
- Verify that the manifest is in **dependency order** — no task appears before its dependencies.
- Verify that `work-id` is correct for the shape (inherited `plan-id` for plan-based/task-file; freshly allocated for ad-hoc).
- Verify that `work-branch` is recorded in the manifest and, unless `null`, the repository is checked out on that branch.
- Verify that for `ad-hoc` input, the task files and `docs/tasks/<work-id>/index.md` were created.
- Verify that the artifact is saved to `docs/plans/.work/.triage/<triage-id>.md`.

> Pass the Work Manifest to `prepare` (Phase 2) for execution-mode selection and sequencing.