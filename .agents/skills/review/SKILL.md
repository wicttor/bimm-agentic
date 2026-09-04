---
name: review
description: "Review code changes through a deterministic pipeline of micro-skills: Scope -> Prepare -> Analyze -> Report. Accepts a PR / branch diff / commit range / working tree, a /work run's changes, or an ad-hoc target; produces graded findings and an approval status. Local-only; no GitHub sync. No agent dependency, no fallback paths."
disable-model-invocation: true
---

# Review

Orchestrates a deterministic pipeline of micro-skills: `Scope -> Prepare -> Analyze -> Report`. Reviews code changes against quality, security, tests, documentation, integration, and scope-creep standards; produces graded findings (`blocker` / `major` / `minor` / `nit`) and an approval status (`approved` / `changes-requested` / `rejected`). Accepts any code change set, a `/work` run's changes, **or** an ad-hoc target. Local-only — findings are written to a report on disk, never posted to GitHub. No agent dependency, no fallback paths.

## Skill Invocation

This skill is invoked by prompting:

- `/review <change-set>` — review a git change set: `git diff <base>..<head>`, a PR's commits, a commit range (`A..B`), `HEAD` (uncommitted), staged changes, a branch-vs-base diff, or a set of paths/globs.
- `/review <work-id>` — review the changes a `/work` run produced. Scope discovers `status: for-review` tasks (see below); if found, reviews those task changes and gates approval. Also accepts a Work `review-id` to scope to that run.
- `/review <target description>` — ad-hoc review of a described target (e.g. "review the auth module", "review `src/lib/redis-client.ts`"). Scope resolves the description into a concrete change boundary.

This skill runs the review pipeline, analyzing changes and producing a report, acting as the Orchestrator.

## Interaction Method

- Ask the user one structured question at a time (2–4 concrete options) using the agent's interactive question capability; never hardcode a specific tool name.
- If input is empty, ask: "What would you like to review? Provide a git ref/range, a work-id, or describe a target."

Before starting the workflow, ask the user to choose an interaction mode:

- **Detailed** — Confirm at each phase transition and before surfacing each finding category; inspect artifacts; maximum control. Best for high-stakes or sensitive reviews.
- **Autopilot** — All phases run automatically; only the final Review Report is presented. Fastest. Best for routine reviews of well-understood changes.
- **Smart** — Phases run automatically; pause only when `blocker`/`major` findings appear or when scope creep is detected.

Store in the context object:

```yaml
interactionMode: detailed | smart | autopilot
```

**Propagation:** `interactionMode` flows into the `scope`, `prepare`, `analyze`, and `report` artifacts; each downstream phase reads it to adjust confirmation behaviour (detailed = pause every transition; autopilot = run all; smart = pause only on `blocker`/`major` findings or detected scope creep).

## Orchestration Implementation

Each phase runs sequentially: the orchestrator calls the phase module, receives the output artifact, validates it with a quality gate, and passes it to the next phase.

### INPUT

- Receives a context object from the user, a saved prompt, a document, or a combination.
- **Four input shapes:**
  1. **Change-set** — a git change set spec: a diff range (`<base>..<head>`), a commit range (`A..B`), `HEAD` (uncommitted working tree), staged changes, a branch-vs-base diff, or a set of paths/globs. Scope resolves it to a concrete file + hunk boundary.
  2. **Work-linked** — a `work-id` (e.g. `2026-07-10-001`) or a Work `review-id`. Scope resolves it to the changes that `/work` run touched: the union of every task file's `files.create` / `files.modify` (filtered by the `completed`/`blocked`/`skipped` outcomes in the Work Report), bounded to commits attributable to that run if discoverable.
  3. **Task-in-review** — ✅ **NEW**: a `work-id` where one or more tasks have `status: for-review` (gated by Work Review Phase 4). Scope resolves it to files touched by those tasks. After Analyze, Report updates task file frontmatter: `status: completed` (if approved) or `status: blocked` (if changes-requested). This is the approval gate for tasks awaiting review.
  4. **Ad-hoc** — a free-form target description. Scope maps it to a concrete change boundary by locating matching files/paths and, where applicable, the commits that most recently touched them.
- **Optional requirements:** any review is sharper when there is a reference spec to test against. Accept an optional requirements ref — a `/plan` plan-id, a task's `## Acceptance Criterion`, a markdown spec, or a referenced doc. If provided, scope-creep detection runs against it; if absent, Scope marks `requirements-source: none` and Analyze skips the scope-creep-vs-requirements category (noting it).
- **If no context is provided**, ask: "What would you like to review? Provide a git ref/range, a work-id, or describe a target."
- **Unified key:** downstream phases key off a `review-id` (`YYYY-MM-DD-NNN`), allocated by Scope per [id-generation.md](references/id-generation.md). For work-linked and task-in-review input, the `review-id` is **distinct** from the Work `review-id` (the two skills produce independent artifacts) — the work-id is carried alongside for traceability and optional index cross-linking. For task-in-review input specifically, Report's approval verdict updates the task files' frontmatter `status:` field (new behavior).
- Output: [Review Input Artifact](references/templates/artifacts/review-input.md)

### Pre-Flight Check

Before starting the review pipeline, the orchestrator verifies that required folders exist:

- `docs/review/.scope/`, `docs/review/.prepare/`, `docs/review/.analyze/`, `docs/review/.report/` — must exist for saving the four phase artifacts
- `docs/review/index.md` — must exist as the review registry (Report appends to it)

**Self-Healing:** If any are missing, the orchestrator automatically creates them (`mkdir -p`, and a seed `index.md` with a registry header). This allows the Review skill to run even if `arreio-init` wasn't explicitly run.

For **change-set** input, verify the repo is a git working tree and the spec parses to a non-empty diff; if not, ask the user to provide a valid ref/range or switch to ad-hoc.

For **work-linked** input, verify the `work-id` exists (`docs/tasks/<work-id>/index.md`) and is non-empty; if given a Work `review-id`, verify `docs/plans/.work/.review/<review-id>.md` exists. If missing, ask the user to run `/work <work-id>` first or switch to a change-set spec.

For **task-in-review** input, verify the `work-id` exists and contains at least one task with `status: for-review` (read task files' frontmatter or check the Work Report's task-outcome-rollup `for-review` count). If none found, inform the user: "No tasks in for-review status for this work-id. Did you run `/work <work-id>` first?" or offer to review the work-linked changes instead.

### Phases

| Phase | Phase Module                  | Output Artifact                                                  | Saved to                              |
| ----- | ----------------------------- | ---------------------------------------------------------------- | ------------------------------------- |
| 1     | [Scope](modules/scope.md)     | [Review scope](references/templates/artifacts/review-scope.md)   | `docs/review/.scope/<id>.md`   |
| 2     | [Prepare](modules/prepare.md) | [Review kit](references/templates/artifacts/review-kit.md)       | `docs/review/.prepare/<id>.md` |
| 3     | [Analyze](modules/analyze.md) | [Findings](references/templates/artifacts/findings.md)           | `docs/review/.analyze/<id>.md` |
| 4     | [Report](modules/report.md)   | [Review report](references/templates/artifacts/review-report.md) | `docs/review/.report/<id>.md`  |

### Quality Gates

Between phases, the orchestrator validates the output artifact before passing it to the next phase:

1. **Schema validation** — required fields present and well-formed (see [error-handling.md](references/error-handling.md) for the per-type field list).
2. **Cross-phase consistency** — IDs (`review-id`, `scope-id`, `prepare-id`, `analyze-id`, `report-id`) match the upstream artifacts; `interactionMode` is identical across artifacts.
3. **Status check** — the artifact's `status` is `complete` (not `pending` or `failed`).
4. **Scope coherence** (after Scope) — the change boundary is non-empty and parses to a concrete file list; referenced requirements resolve (or are explicitly marked `none`). Required- vs optional-only files are separated.
5. **Findings coherence** (after Analyze) — every finding carries a `severity`, a `category` (quality / security / tests / documentation / integration / scope-creep), a repository-relative `location`, and either a requirement trace or a `scope-creep` flag.

If a gate fails, the orchestrator returns to the producing phase with the error context (per the recovery workflow in [error-handling.md](references/error-handling.md)).

### Index Registration

Each phase is responsible for its own index updates:

| Phase   | Registers To                                                           | Update                                                                                                                         |
| ------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Scope   | _(none — produces artifact only)_                                      | Allocates the `review-id`; no index write.                                                                                     |
| Prepare | _(none)_                                                               | Gathers the review kit; no index write.                                                                                        |
| Analyze | _(none)_                                                               | Produces findings; no index write.                                                                                             |
| Report  | `docs/review/index.md`                                          | Append a registry row: `<report-id>`, review target summary, approval status, link to the report file.                         |
| Report  | `docs/tasks/<work-id>/index.md` _(work-linked or task-in-review only)_ | Append a distinct `## Review Report — <report-id>` block (separate from Work's own `## Work Report` block).                    |
| Report  | Task frontmatter _(task-in-review only)_                               | Update task file `status:` field to `completed` (if approved) or `blocked` (if changes-requested, with reason in frontmatter). |

**Idempotency rule:** re-running Review over the same target re-derives findings fresh (reviews are not resume-safe like execution — the change set may have evolved). The registry row and any work-index block are **idempotent on `report-id`**: a re-run overwrites the row/block with the same id, never duplicates it.

### FINAL OUTPUT

- **Review Report:** Saved to `docs/review/.report/<report-id>.md`, with: the change boundary, the approval status (`approved` / `changes-requested` / `rejected`), the graded findings rollup, recommendations, and (when requirements were available) the scope-creep summary.
- **Registry row:** `docs/review/index.md` updated with the new review.
- **(Work-linked or task-in-review only) Index cross-link:** `docs/tasks/<work-id>/index.md` gets a `## Review Report — <report-id>` block so a future glance at the work index shows that an external Review ran over it.
- **(Task-in-review only) Task Status Update:** ✅ **NEW**: For each task with `status: for-review`:
  - If approval status = `approved` → update task file's frontmatter `status: completed`
  - If approval status = `changes-requested` → update task file's frontmatter `status: blocked` (with reason in `block-reason:` field)
  - Idempotent on `report-id` (re-running overwrites, never duplicates)
- **No GitHub sync:** This skill does not post comments, formal reviews, or labels to GitHub. Findings live on disk only — the user wires outbound posting as a separate step if desired.
- **(Optional) Learnings:** Recurring traps or confirmed patterns surfaced during Analyze are handed to the Learn skill (`/learn`) to persist — Review does not write `docs/learn/` directly.

## References

The orchestrator and phase modules share these reference files:

| Reference                                                                     | Used By                                                                           |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [error-handling.md](references/error-handling.md)                             | All phases (Step 0 verification)                                                  |
| [id-generation.md](references/id-generation.md)                               | Scope, Prepare, Analyze, Report (ID assignment, including `review-id` allocation) |
| [interaction-mode-propagation.md](references/interaction-mode-propagation.md) | All phases (Step N confirmation)                                                  |
| [change-set-resolution.md](references/change-set-resolution.md)               | Scope (resolve change-set / work-id / ad-hoc into a change boundary)              |
| [scope-creep-detection.md](references/scope-creep-detection.md)               | Scope (pre-check) + Analyze (final) detect creep vs requirements                  |
| [review-categories.md](references/review-categories.md)                       | Analyze (quality / security / tests / documentation / integration / scope-creep)  |
| [severity-rubric.md](references/severity-rubric.md)                           | Analyze + Report (severity assignment)                                            |
| [approval-criteria.md](references/approval-criteria.md)                       | Report (final approval status derivation)                                         |
| [learnings-gate-logic.md](../plan/references/learnings-gate-logic.md)         | Scope (pull related learnings from `docs/learn/index.md`) — reused from `/plan`   |

Artifact templates live in [references/templates/artifacts/](references/templates/artifacts/):

| Template                                                            | Produced By  |
| ------------------------------------------------------------------- | ------------ |
| [review-input.md](references/templates/artifacts/review-input.md)   | Orchestrator |
| [review-scope.md](references/templates/artifacts/review-scope.md)   | Scope        |
| [review-kit.md](references/templates/artifacts/review-kit.md)       | Prepare      |
| [findings.md](references/templates/artifacts/findings.md)           | Analyze      |
| [review-report.md](references/templates/artifacts/review-report.md) | Report       |

## Core Principles

- **Deterministic Pipeline:** Phases always execute in sequence (no agent switching, no fallback paths).
- **Review ≠ Work's Review phase:** This is a heavyweight code review of arbitrary changes against standards (quality / security / tests / docs / integration / scope-creep) with an explicit approval status. Work's built-in Phase-4 Review is a lightweight, behavior-preserving cleanup + gate of the tasks it just executed. The two are **complementary, not overlapping**:
  - **Work Review** (Phase 4 of `/work`): Pre-check gate. Simplify, consolidate, run regression check, detect scope-creep. If any regression/scope-creep found → tasks enter `for-review` status (not `completed`).
  - **Standalone Review** (this skill): Comprehensive audit. Full quality/security/tests/docs analysis. Can accept `/review <work-id>` → finds `status: for-review` tasks (task-in-review input shape) → audits them with full severity rubric → approval verdict updates task status to `completed` or `blocked`.
  - **Sequential**, not parallel: `/work` executes and gates to `for-review`; user runs `/review` next to approve or reject. No overlap in purpose.
- **Cascade Graded Findings:** Every finding has a severity (`blocker` / `major` / `minor` / `nit`) that drives the final approval status. Severity criteria are authoritative in [severity-rubric.md](references/severity-rubric.md); Analyze assigns, Report aggregates and never re-encodes the rubric.
- **Scope-Creep Requires Requirements:** Scope-creep detection runs only when a reference spec is available; without one, Analyze skips that category and records `requirements-source: none`. The logic is authoritative in [scope-creep-detection.md](references/scope-creep-detection.md).
- **Test the Tests:** Reviewing changes includes evaluating the tests that accompany them — coverage, correctness of assertions, and whether they assert the intended Acceptance Criterion — not just production code.
- **Read-Only Review:** Review analyzes and reports; it never edits the code under review. Required changes become a follow-up task (a new `/plan` + `/work`, or manual edits) — never applied inline here.
- **Single Source of Truth:** This skill defines all its own rules; it does not depend on any external agent rule file. Category, severity, and approval definitions live once in their authoritative references and are never re-encoded inline in the modules.
- **Transparent Artifacts:** Each phase produces an explicit output artifact for the next phase.
- **Behavior-Described, Tool-Agnostic:** Steps describe required capabilities ("read the diff", "run the test suite", "update the index"), not specific tool names; each agent maps to its native tools.
- **Interaction Mode Propagation:** `interactionMode` is read at the start of each subsequent phase and determines whether confirmation steps execute.
- **Error Handling:** Fail explicitly, not silently; each phase has clear error handling with recovery suggestions.
- **Stay Portable:** Use repository-relative paths only.
- **Local-Only, No GitHub Sync:** Findings are written on disk only. This skill deliberately does not post to GitHub — outbound posting is left to a separate, optional step the user may add later.
