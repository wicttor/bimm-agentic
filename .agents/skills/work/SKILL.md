---
name: work
description: "Execute implementation work through a deterministic pipeline of micro-skills: Triage -> Prepare -> Execute -> Review. Consumes /plan task artifacts, a single task file, or ad-hoc work input; runs each task test-first (Red -> Green -> Refactor) and updates task status and the index checklist. No agent dependency, no fallback paths."
disable-model-invocation: true
---

# Work

Orchestrates a deterministic pipeline of micro-skills: `Triage -> Prepare -> Execute -> Review`. Consumes `/plan` task artifacts, a single task file, **or** ad-hoc work input, executes each task test-first (Red → Green → Refactor), and updates task status and the `docs/tasks/<id>/index.md` checklist. No agent dependency, no fallback paths.

## Skill Invocation

This skill is invoked by prompting:

- `/work <plan-id>` — execute the task list for an existing plan, sourced from `docs/tasks/<plan-id>/index.md` (produced by the `/plan` Tasks phase).
- `/work <task file>` — execute a single task file (e.g. `docs/tasks/<plan-id>/T<NN>-<name>.md`, or a task-id like `<plan-id>-T03`). Runs **only that one task's** Red → Green → Refactor cycle, never its downstream dependents.
- `/work <task description>` — execute ad-hoc work; Triage resolves the description into an executable task list (no full plan required).

This skill runs the work pipeline, executing tasks and updating artifacts, acting as the Orchestrator.

## Interaction Method

- Ask the user one structured question at a time (2–4 concrete options) using the agent's interactive question capability; never hardcode a specific tool name.
- If input is empty, ask: "What would you like to work on? Provide a plan-id, a task file, or describe the task."

Before starting the workflow, ask the user to choose an interaction mode:

- **Detailed** — Confirm at each phase transition and before each task's destructive step; inspect artifacts; maximum control. Best for HIGH-risk or unfamiliar work.
- **Autopilot** — All phases run automatically; only the final Work Report is presented. Fastest. Best for straightforward, well-planned task lists.
- **Smart** — Phases run automatically; pause only on HIGH-risk operations or tasks that fail their gates.

Store in the context object:

```yaml
interactionMode: detailed | smart | autopilot
```

**Propagation:** `interactionMode` flows into the `triage`, `prepare`, `execute`, and `review` artifacts; each downstream phase reads it to adjust confirmation behaviour (detailed = pause every transition; autopilot = run all; smart = pause only on HIGH-risk).

> **Interaction mode is distinct from execution mode.** `interactionMode` governs _when to pause for the user_ (the same three modes as the `/plan` skill). **Execution mode** (inline / serial / parallel) governs _how multiple tasks are run_ and is selected in the Prepare phase. The two are carried independently through the pipeline.

## Orchestration Implementation

Each phase runs sequentially: the orchestrator calls the phase module, receives the output artifact, validates it with a quality gate, and passes it to the next phase.

### INPUT

- Receives a context object (a plan-id, a task file, **or** a raw work description, plus optional goals, constraints, references) from the user, a saved prompt, a document, or a combination.
- **Three input shapes:**
  1. **Plan-based** — a `plan-id` referencing `docs/tasks/<plan-id>/index.md`. Executes the full task list in dependency order. Each task carries exactly one Acceptance Criterion, one test file, and Red → Green → Refactor steps (as produced by `/plan`'s Tasks phase).
  2. **Task-file** — a path to a single task file (e.g. `docs/tasks/<plan-id>/T<NN>-<name>.md`) or a task-id (e.g. `<plan-id>-T03`). Executes **only that one task's** Red → Green → Refactor cycle, never its downstream dependents. `work-id` is inherited from the file's folder (the `plan-id`). Before running, Triage checks the task's `dependencies`: if any upstream task is **not** `completed`, it warns and asks the user whether to (a) proceed anyway, (b) run the missing upstream task(s) first, or (c) abort.
  3. **Ad-hoc** — a raw work description (bug, feature, change). Triage classifies it and resolves it into the same task-shaped work (one AC → one task → one test, Red-first), registered under a fresh `work-id` at `docs/tasks/<work-id>/`.
- **If no context is provided**, ask: "What would you like to work on? Provide a plan-id, a task file, or describe the task."
- **Unified key:** downstream phases always key off a `work-id`. For plan-based and task-file input, `work-id = plan-id` (the task file's folder). For ad-hoc input, Triage allocates a `work-id` of the form `YYYY-MM-DD-NNN` (counting existing `docs/tasks/YYYY-MM-DD-NNN/` folders for that date), reusing the plan-id format so the `docs/tasks/<id>/` convention holds uniformly. The task manifest differs by shape (full list vs single task vs resolved list), but the artifact and index paths are identical.
- Output: [Work Input Artifact](references/templates/artifacts/work-input.md)

### Pre-Flight Check

Before starting the work pipeline, the orchestrator verifies that required folders exist:

- `docs/tasks/` — must exist for reading (plan-based) or creating (ad-hoc) the task list
- `docs/plans/.work/.triage/`, `docs/plans/.work/.prepare/`, `docs/plans/.work/.execute/`, `docs/plans/.work/.review/` — must exist for saving the four phase artifacts

**Self-Healing:** If any are missing, the orchestrator automatically creates them (`mkdir -p`). This allows the work skill to run even if `arreio-init` wasn't explicitly run.

For plan-based input, additionally verify that `docs/tasks/<plan-id>/index.md` exists and is non-empty; if not, ask the user to run `/plan <plan-id>` (with the Tasks phase) first or switch to ad-hoc input.

For task-file input, verify the task file exists and parses with valid task frontmatter (`id`, `plan-id`, `status`, `files.test`); infer `plan-id` from its folder. If missing or malformed, ask the user to locate the file or re-run the relevant `/plan` Tasks phase.

### Work Branch

Every new feature or plan runs on its own git branch:

- **Name:** `work/<short-description>` — a kebab-case slug derived from the plan name (plan-based/task-file) or the work description (ad-hoc), capped at 50 characters.
- **When:** created or checked out in Triage (Step 2d), right after the `work-id` is resolved and **before any task file or index is written**.
- **Idempotent:** re-running Work resumes on the same branch (already on it → no-op; branch exists → check it out; otherwise create from the default branch).
- **Dirty working tree:** uncommitted changes fail branch creation with an explicit error — never stashed, committed, or carried silently.
- **Not a git repository:** one explicit warning; the pipeline continues without a branch (`work-branch: null`).
- **Recording:** the branch name is stored as `work-branch` in the Work Manifest (with `work-branch-base` and `work-branch-state`) and carried through the Prepare/Execute/Review artifacts; the orchestrator's quality gate verifies branch coherence before Execute.

### Phases

| Phase | Phase Module                  | Output Artifact                                                    | Saved to                            |
| ----- | ----------------------------- | ------------------------------------------------------------------ | ----------------------------------- |
| 1     | [Triage](modules/triage.md)   | [Work manifest](references/templates/artifacts/work-manifest.md) + `work/<slug>` branch | `docs/plans/.work/.triage/<id>.md`  |
| 2     | [Prepare](modules/prepare.md) | [Execution plan](references/templates/artifacts/execution-plan.md) | `docs/plans/.work/.prepare/<id>.md` |
| 3     | [Execute](modules/execute.md) | [Execution log](references/templates/artifacts/execution-log.md)   | `docs/plans/.work/.execute/<id>.md` |
| 4     | [Review](modules/review.md)   | [Work report](references/templates/artifacts/work-report.md)       | `docs/plans/.work/.review/<id>.md`  |

### Quality Gates

Between phases, the orchestrator validates the output artifact before passing it to the next phase:

1. **Schema validation** — required fields present and well-formed (see [error-handling.md](references/error-handling.md) for the per-type field list).
2. **Cross-phase consistency** — IDs (`work-id`, `triage-id`, `prepare-id`, `execute-id`, `review-id`) match the upstream artifacts; `interactionMode` and `executionMode` are identical across artifacts.
3. **Status check** — the artifact's `status` is `complete` (not `pending` or `failed`).
4. **Task-status coherence** (after Execute) — every task in the work list is `completed`, `blocked` (with a recorded reason), or `skipped` (with a recorded reason); the `docs/tasks/<work-id>/index.md` checklist state matches the task files' frontmatter `status`. No task is left `in-progress`.
5. **Branch coherence** (after Triage, before Execute) — when `work-branch` is not `null`, the repository's current branch matches the Work Manifest's `work-branch`; a mismatch returns to Triage with the error context.

If a gate fails, the orchestrator returns to the producing phase with the error context (per the recovery workflow in [error-handling.md](references/error-handling.md)).

### Index Registration

Each phase is responsible for its own index updates:

| Phase   | Registers To                                     | Update                                                                                                                                                                |
| ------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Triage  | `docs/tasks/<work-id>/index.md`                  | Ad-hoc only: create folder + index with the resolved task checklist (`- [ ]`). Plan-based: read only.                                                                 |
| Execute | `docs/tasks/<work-id>/index.md` + each task file | Flip frontmatter `status` and the task file's `## Acceptance Criteria` checkbox; tick the index checklist (`- [ ]` → `- [x]`) as tasks complete. Idempotent on retry. |
| Review  | `docs/tasks/<work-id>/index.md`                  | Append a closing `## Work Report — <review-id>` status block; optionally note learnings to capture via `/learn`.                                                      |

**Idempotency rule:** re-running Work resumes from incomplete tasks. The orchestrator reads each task file's `status`; a `completed` task is never re-opened, and index checkboxes are only ticked forward, never reset.

### FINAL OUTPUT

- **Task files:** Updated at `docs/tasks/<work-id>/T<NN>-<name>.md` with final `status` (`completed` / `blocked` / `skipped`) — frontmatter and the `## Acceptance Criteria` checkbox both updated.
- **Task index:** `docs/tasks/<work-id>/index.md` checklist ticked to match task outcomes (`- [x]` complete; remaining `- [ ]` for `blocked`/`skipped`).
- **Work branch:** `work/<short-description>` created (or checked out) during Triage Step 2d, recorded as `work-branch` in the Work Manifest; re-runs resume on the same branch.
- **Work Report:** Saved to `docs/plans/.work/.review/<review-id>.md`, with a consolidation/simplification summary, test-regression check, any scope-creep notes, and learnings surfaced for `/learn`.
- **(Optional) Learnings:** New learnings discovered during execution are handed to the Learn skill (`/learn`) to persist — Work does not write `docs/learn/` directly.

## References

The orchestrator and phase modules share these reference files:

| Reference                                                                     | Used By                                                                             |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [error-handling.md](references/error-handling.md)                             | All phases (Step 0 verification)                                                    |
| [id-generation.md](references/id-generation.md)                               | Triage, Prepare, Execute, Review (ID assignment, including `work-id` allocation)    |
| [interaction-mode-propagation.md](references/interaction-mode-propagation.md) | All phases (Step N confirmation)                                                    |
| [execution-mode-selection.md](references/execution-mode-selection.md)         | Prepare (choose inline / serial / parallel)                                         |
| [ad-hoc-input-resolution.md](references/ad-hoc-input-resolution.md)           | Triage (resolve raw work into task-shaped work)                                     |
| [task-execution-rules.md](references/task-execution-rules.md)                 | Execute (Red → Green → Refactor enforcement, per-task gates, blocked-task handling) |
| [review-checklist.md](references/review-checklist.md)                         | Review (simplification, consolidation, learnings capture)                           |

Artifact templates live in [references/templates/artifacts/](references/templates/artifacts/):

| Template                                                              | Produced By  |
| --------------------------------------------------------------------- | ------------ |
| [work-input.md](references/templates/artifacts/work-input.md)         | Orchestrator |
| [work-manifest.md](references/templates/artifacts/work-manifest.md)   | Triage       |
| [execution-plan.md](references/templates/artifacts/execution-plan.md) | Prepare      |
| [execution-log.md](references/templates/artifacts/execution-log.md)   | Execute      |
| [work-report.md](references/templates/artifacts/work-report.md)       | Review       |

## Core Principles

- **Deterministic Pipeline:** Phases always execute in sequence (no agent switching, no fallback paths).
- **Test-First Execution:** Every task runs Red → Green → Refactor — the failing test is written/confirmed **before** implementation. A task is not `completed` until its single test is green.
- **One Acceptance Criterion per Task:** Preserve the `/plan` invariant — one AC → one task → one test. Ad-hoc work is resolved to the same shape by Triage; never bundle criteria during execution.
- **Work Branch:** Every new feature or plan executes on its own git branch `work/<short-description>` (slug derived from the plan name or work description). The branch is created or checked out in Triage before any artifact is written, the setup is idempotent for resume, and a dirty working tree fails explicitly instead of stashing or carrying changes.
- **Separate Execution from Planning:** Execute the plan as sliced; do not re-plan during execution. Surface scope changes to the user instead of silently expanding a task.
- **Quality Gates (Work Review Phase 4):** After Execute completes, Phase 4 Review runs a lightweight pre-check: simplify/consolidate, run regression test (binary: any failure = gate), detect scope-creep (binary: any finding = gate). If gate fails → tasks enter `status: for-review` (not `completed`) and await Standalone Review approval. If gate passes → tasks move to `status: completed`. This decouples execution quality from final approval authority.
- **Learnings Orthogonal to Approval:** Work Report surfaces `learnings-to-capture` candidates (from Execute + Review phases) for later `/learn` invocation. Learnings are separate from approval gates; the Learn skill is the single authoritative source for durable knowledge.
- **Idempotent Status Updates:** Resume-safe — re-running Work picks up at the first non-`completed` task; `completed` and `for-review` tasks are never reverted (their status is idempotent on `review-id` in Review Phase 4).
- **Error Handling:** Fail explicitly, not silently; each phase has clear error handling with recovery suggestions.
- **Be Concrete:** Use specific files, components, and dependencies from the task artifacts.
- **Stay Portable:** Use repository-relative paths only.
- **Transparent Artifacts:** Each phase produces an explicit output artifact for the next phase.
- **Interaction Mode Propagation:** `interactionMode` is read at the start of each subsequent phase and determines whether confirmation steps execute.
- **Single Source of Truth:** This skill defines all its own rules; it does not depend on any external agent rule file.
- **Behavior-Described, Tool-Agnostic:** Steps describe required capabilities ("run the test", "update the task file"), not specific tool names; each agent maps to its native tools.
- **Next Workflow Step (Task-in-Review):** If Work Report's `work-state: for-review`, user runs `/review <work-id>` next. Review discovers `status: for-review` tasks (task-in-review input shape) and gates their approval: approved → `status: completed`, changes-requested → `status: blocked`. Optional GitHub Sync:\*\* When GitHub integration is enabled, task status may be mirrored to GitHub Issues (via the sync-status micro-skill); this is integration-gated and never required to run Work.
