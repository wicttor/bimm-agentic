---
name: plan
description: "Create durable implementation plans that can be handed off for execution. Orchestrates a deterministic pipeline of micro-skills: Scope -> Research -> Design -> Generate -> Tasks. No agent dependency, no fallback paths."
disable-model-invocation: true
---

# Plan

Orchestrates a deterministic pipeline of micro-skills: `Scope -> Research -> Design -> Generate -> Tasks`. No agent dependency, no fallback paths.

## Skill Invocation

This skill is invoked by prompting `/plan <task description>`. This skill will run the planning pipeline, producing a final plan artifact and optionally a set of task artifacts, acting as the Orchestrator.

## Interaction Method

- Ask the user one structured question at a time (2–4 concrete options) using the agent's interactive question capability; never hardcode a specific tool name.
- If input is empty, ask: "What would you like to plan? Describe the task or project."

Before starting the workflow, ask the user to choose an interaction mode:

- **Detailed** — Confirm at each phase transition; inspect artifacts; maximum control. Best for complex/unfamiliar work.
- **Autopilot** — All phases run automatically; only final outcome reported. Fastest. Best for straightforward work.
- **Smart** — Phases run automatically; pause only on HIGH-risk operations.

Store in the context object:

```yaml
interactionMode: detailed | smart | autopilot
```

**Propagation:** `interactionMode` flows into `research`, `design`, and `generate` artifacts; each downstream phase reads it to adjust confirmation behaviour (detailed = pause every transition; autopilot = run all; smart = pause only on HIGH-risk).

## Orchestration Implementation

Each phase runs sequentially: the orchestrator calls the module, receives the output artifact, validates it with a quality gate, and passes it to the next phase.

### INPUT

- Receives a context object (task description, goals, constraints, references, previous plans) from the user, a saved prompt, a document, or a combination.
- **If no context is provided**, ask: "What would you like to plan? Describe the task or project."
- Output: [User Input Artifact](references/templates/artifacts/user-input.md)

### Pre-Flight Check

Before starting the planning pipeline, the orchestrator verifies that required folders exist:

- `docs/plans/` — must exist for saving final plan
- `docs/tasks/` — must exist if task generation is enabled

**Self-Healing:** If missing, the orchestrator automatically creates these folders. This allows the plan skill to run even if `arreio-init` wasn't explicitly run.

### Phases

| Phase | Module                                 | Output Artifact                                                                    |
| ----- | -------------------------------------- | ---------------------------------------------------------------------------------- |
| 1     | [Scope](modules/scope.md)              | [Scoped context](references/templates/artifacts/scoped-context.md)                 |
| 2     | [Research](modules/research.md)        | [Research findings](references/templates/artifacts/research-findings.md)           |
| 3     | [Design](modules/design.md)            | [Design with unit decomposition](references/templates/artifacts/design.md)         |
| 4     | [Generate](modules/generate.md)        | [Final plan](references/templates/artifacts/final-plan.md) saved to `docs/plans/`  |
| 5     | [Tasks](modules/tasks.md) _(optional)_ | [Task list](references/templates/artifacts/task.md) saved to `docs/tasks/plan-id/` |

**Phase 5** is optional; ask the user 'Generate individual task files?' before running, even in Autopilot. If user declines, planning is complete.

### Quality Gates

Between phases, the orchestrator validates the output artifact before passing it to the next phase:

1. **Schema validation** — required fields present and well-formed (see [error-handling.md](references/error-handling.md) for the per-type field list).
2. **Cross-phase consistency** — IDs (`scope-id`, `research-id`, `design-id`, `plan-id`) match the upstream artifacts; `interactionMode` is identical across artifacts.
3. **Status check** — the artifact's `status` is `complete` (not `pending` or `failed`).
4. **Tier/complexity coherence** (after Design) — the `tier_recommended` is consistent with `complexity` and `risk_level` per [plan-tier-selection.md](references/plan-tier-selection.md).

If a gate fails, the orchestrator returns to the producing phase with the error context (per the recovery workflow in [error-handling.md](references/error-handling.md)).

### Index Registration

Each skill module is responsible for registering its own outputs:

| Module   | Registers To                    | Artifact Format                                  |
| -------- | ------------------------------- | ------------------------------------------------ |
| Generate | `docs/plans/index.md`           | Link + brief summary to final plan file          |
| Tasks    | `docs/tasks/<plan-id>/index.md` | Folder creation + task links (created on-demand) |

**Who updates what:**

- **Generate phase:** Creates `docs/plans/index.md` if missing; appends new plan entry with timestamp and link
- **Tasks phase:** Creates `docs/tasks/<plan-id>/` folder and `docs/tasks/<plan-id>/index.md` if missing; populates with task file links and metadata

### FINAL OUTPUT

- **Plan file:** Saved to `docs/plans/YYYY-MM-DD-NNN-<kebab-case-name>.md`
  - **Registration:** Generate phase appends an entry to `docs/plans/index.md` linking the new plan
- **Task files (optional):** Saved to `docs/tasks/<plan-id>/TASK-NNN-<kebab-case-name>.md`
  - **Registration:** Tasks phase creates `docs/tasks/<plan-id>/index.md` and registers task file links there
  - Ready for the Work skill to consume via `docs/tasks/<plan-id>/index.md`

## References

The orchestrator and modules share these reference files:

| Reference                                                                     | Used By                          |
| ----------------------------------------------------------------------------- | -------------------------------- |
| [error-handling.md](references/error-handling.md)                             | All phases (Step 0 verification) |
| [id-generation.md](references/id-generation.md)                             | Scope, Research, Design, Generate (ID assignment) |
| [interaction-mode-propagation.md](references/interaction-mode-propagation.md) | All phases (Step N confirmation) |
| [learnings-gate-logic.md](references/learnings-gate-logic.md)                 | Scope (Step 4)                   |
| [high-risk-detection.md](references/high-risk-detection.md)                   | Research (Step 2)                |
| [external-research-guidance.md](references/external-research-guidance.md)     | Research (Step 4)                |
| [design-complexity-assessment.md](references/design-complexity-assessment.md) | Design (Step 4)                  |
| [plan-tier-selection.md](references/plan-tier-selection.md)                   | Generate (Step 1)                |
| [task-slicing-rules.md](references/task-slicing-rules.md)                     | Tasks (Steps 2–3)                |

Artifact templates live in [references/templates/artifacts/](references/templates/artifacts/).

## Core Principles

- **Deterministic Pipeline:** Phases always execute in sequence (no agent switching, no fallback paths).
- **Error Handling:** Fail explicitly, not silently; each phase has clear error handling with recovery suggestions.
- **Focus on Decisions:** Capture approach, structure, risks, and sequencing (not code simulation).
- **Right-Size:** Small tasks → short plans; complex work → more structure.
- **Separate Planning from Execution:** NEVER simulate implementation during planning.
- **Be Concrete:** Use specific files, components, and dependencies.
- **Stay Portable:** Use repository-relative paths only.
- **Transparent Artifacts:** Each phase produces an explicit output artifact for the next phase.
- **Interaction Mode Propagation:** `interactionMode` is read at the start of each subsequent phase and determines whether confirmation steps execute.
- **Single Source of Truth:** This skill defines all its own rules; it does not depend on any external agent rule file.
- **Behavior-Described, Tool-Agnostic:** Steps describe required capabilities ("search the codebase", "ask the user one question"), not specific tool names; each agent maps to its native tools.
- **Test-Driven Tasks:** One Acceptance Criterion per task; one test per AC; each task's Steps follow Red → Green → Refactor (write the failing test first and confirm it fails, implement the minimum code to pass, then refactor with the test green).
