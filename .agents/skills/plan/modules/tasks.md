---
title: Tasks
description: Slice the finalized plan into granular, executable, test-driven task files saved to docs/tasks/. One task per Acceptance Criterion; one test per task; ordered by dependency. Optional Phase 5 of the Plan pipeline.
type: module
version: 2.0
timestamp: "2026-08-07"
---

# Phase 5 - Tasks

**Purpose:** Fifth and final (optional) step in the planning workflow. Reads the Final Plan's Implementation Units and their **Acceptance Criteria**, slices them into granular, executable task files per the [task-slicing rules](../references/task-slicing-rules.md), orders them by dependency, and saves them to `docs/tasks/<plan-id>/`. Produces a set of [Task Artifacts](../references/templates/artifacts/task.md) that the Work skill (`work/SKILL.md`) consumes for execution.

> **Optional phase.** The Orchestrator must ask the user before continuing to this phase, even in Autopilot mode — the user may prefer to defer task generation.

## Core rule

**One Acceptance Criterion per task. One test per task. Test-Driven.**

- Each Implementation Unit carries one or more **Acceptance Criteria** (set in the Design phase).
- Each Acceptance Criterion becomes **exactly one task** → with **exactly one test file** in `files.test` asserting that single criterion.
- Each task's `## Steps` follow **Red → Green → Refactor** (write the failing test first and confirm it fails, implement the minimum code to pass, then refactor with the test green).
- Never bundle multiple Acceptance Criteria into one task. Never merge units into a shared multi-criterion task.

## Workflow

This is the Phase 5 pipeline for the Plan Skill. It orchestrates the following steps:

### Step 0: Verification

Run the **[Step 0 verification](../references/error-handling.md)**. Required input: a valid **Final Plan Artifact** from Generate. Specifically verify:

1. The Final Plan exists at `docs/plans/YYYY-MM-DD-NNN-<kebab-case-name>.md` and is non-empty.
2. The plan frontmatter contains `plan-id`, `tier`, `complexity`, `risk`, and `interactionMode`.
3. The plan body contains an `## Implementation Units (Phased)` section with at least one unit (`U1`), and each unit lists its **Acceptance Criteria** (at least one).
4. If the plan has no Implementation Units, abort and ask the user to re-run the Generate phase — the plan is incomplete.

### Step 1: Read and Normalize Units

1. **Read the Implementation Units** from the Final Plan. Parse each unit into a normalized record:

   ```yaml
   - id: U1
     name: "[Unit Name]"
     goal: "[What this unit accomplishes]"
     phase: 1 | 2 | 3
     dependencies: [U<id>, ...]        # Unit IDs this depends on
     files:
       create: [path, ...]
       modify: [path, ...]
       test: [path, ...]
     acceptance_criteria:             # each becomes exactly one task + one test
       - "[single, verifiable criterion]"
     test_scenarios:                   # informational; the task's one test asserts the AC
       - "[Scenario]: [Input -> Expected Outcome]"
   ```

2. **Extract the plan's `Related Learnings`** to carry into task files that touch the relevant domains.
3. **Extract the plan's `tier`** to determine sizing guidance (see [task-slicing-rules.md](../references/task-slicing-rules.md)).

### Step 2: Slice Into Candidate Tasks (one per Acceptance Criterion)

Apply the [task-slicing rules](../references/task-slicing-rules.md):

1. **One task per Acceptance Criterion.** For every criterion on every unit, create one candidate task inheriting the unit's goal, dependencies, and file paths. Each task gets its own dedicated test file in `files.test`.
2. **Never split within an Acceptance Criterion.** If a criterion would need > 5 files or > 1 day of effort, **split the criterion into two finer sub-criteria** (each its own task) and update the originating unit accordingly — do not slice a task partway through a criterion. Honor the tier's sizing targets (Fast: 1–3 tasks; Standard: 4–8; Deep: 8–15) when choosing how fine to split.
3. **Sub-IDs only.** If one unit yields multiple criteria/tasks, use sub-identifiers: `U1` → `U1a`, `U1b`. Never renumber original units.
4. **No merging across criteria.** Do not merge tasks; a task always carries exactly one Acceptance Criterion. (Trivial adjacent units that genuinely share a single criterion are already a single criterion by definition.)
5. Record slicing decisions for traceability (which criteria were split and why).

### Step 3: Order by Dependencies

Order the tasks so each task's dependencies are satisfied by earlier tasks, using the topological ordering algorithm in [task-slicing-rules.md](../references/task-slicing-rules.md):

```
1. Start with all tasks as "remaining".
2. Find tasks whose dependencies are all already ordered → "ready".
3. If no task is ready: a cycle exists → surface to the user, ask to break or abort.
4. Sort ready tasks by original unit number (stable ordering).
5. Append ready tasks to "ordered"; remove from "remaining".
6. Repeat until all tasks are ordered.
```

On a cycle: log the error, list the involved tasks, and ask the user one question whether to break the cycle manually (remove a dependency) or abort the Tasks phase.

### Step 4: Assign Priorities

Assign a priority to each ordered task:

| Priority | Criteria                                           |
| -------- | -------------------------------------------------- |
| P0       | Blocks all other tasks (foundation, infra, schema) |
| P1       | On the critical path but not blocking             |
| P2       | Can be deferred or parallelized                    |

Default: Phase 1 (Foundation) tasks → `P0`; Phase 2 (Integration) → `P1`; Phase 3 (Rollout) → `P2`. Adjust based on the plan's risk analysis — a rollout task that mitigates a HIGH risk may be `P1`.

### Step 5: Present and Confirm

> **Always ask the user in this phase**, even in Autopilot mode (per [interaction-mode-propagation.md](../references/interaction-mode-propagation.md)).

Present the ordered task manifest to the user with one question:

```
The plan has been sliced into <N> tasks (T01–T<NN>); one per Acceptance Criterion,
each with its own failing-first test.
Would you like me to create the task files in docs/tasks/<plan-id>/?
  - Yes: Create all task files and update the index
  - Review: Show the task list first, then ask again
  - No: Skip task creation
```

- **Review:** display the full task list (IDs, titles, AC, dependencies, priorities, test file) and re-prompt.
- **No:** skip task creation; the plan remains the unit of work (the user can slice manually later). Inform the Orchestrator that the plan is complete without tasks.
- **Detailed mode only:** before saving, also show the full content of each task file and allow edit requests.
- **Yes:** proceed to Step 6.

### Step 6: Materialize Task Files

For each ordered task, materialize a task file using the [Task Artifact template](../references/templates/artifacts/task.md):

1. **Assign a task ID:** `<plan-id>-T<NN>` where `NN` is a zero-padded 2-digit number matching dependency order (01, 02, ..., 10). Sub-IDs → `T02a`, `T02b` (letters, not extra digits).
2. **Derive the filename:** `T<NN>-<kebab-case-name>.md` (e.g., `T01-redis-client-setup.md`).
3. **Fill the schema** (all fields required unless noted):
   - `id` = `<plan-id>-T<NN>`; `title` action-oriented (from the criterion); `plan-id`; `unit` = originating unit (or sub-ID, e.g., `U1` / `U1a`); `tier` inherited; `status = not-started`; `priority` from Step 4; `dependencies` = mapped earlier task IDs; `files` = inherited (create/modify + a **dedicated `test` file for this criterion**); `estimated-effort` by tier (Fast: ≤ half day; Standard/Deep: ≤ 1 day).
   - `## Goal` — inherited from the unit, scoped to this criterion (1–2 sentences).
   - `## Acceptance Criterion` — **exactly one** verifiable criterion.
   - `## Steps` — **Red → Green → Refactor**, in that order:
     1. **(Red)** Write the failing test in the file from `files.test` asserting this one Acceptance Criterion. Run it and confirm it fails **for the right reason**.
     2. **(Green)** Implement the minimum code (in `files.create` / `files.modify`) to make the test pass.
     3. **(Refactor)** Clean up naming, duplication, and structure while keeping the test green.
   - `## Test Scenarios` — the assertion(s) for this criterion: `[Scenario]: [Input -> Expected Outcome]` (required for Phase 1–2; optional for rollout-only). May be a single scenario (this task asserts one criterion).
   - `## Dependencies` — `task-id: why` or `None`.
   - `## Notes` — carry the relevant `Related Learnings` and any gotchas.
4. **Validate** each task file against the [task.md template](../references/templates/artifacts/task.md) validation rules (singular AC, one test per AC, Red-first Steps, repository-relative paths).

### Step 7: Save Task Files

1. **Create the task directory** `docs/tasks/<plan-id>/` if it does not exist.
2. **Save each task file** to `docs/tasks/<plan-id>/T<NN>-<kebab-case-name>.md`.
3. **Verify** all files were written successfully.

### Step 8: Update Tasks Index

Append a section to `docs/tasks/<plan-id>/index.md`. Mark each task with `- [ ]` (unchecked); the Work skill updates these to `- [x]` as tasks complete.

```markdown
## <plan-id> — [Plan Title]

- [ ] T01 — [Task title] (`U1`, AC: [criterion]) — `docs/tasks/<plan-id>/T01-<name>.md`
- [ ] T02 — [Task title] (`U2a`, AC: [criterion]) — `docs/tasks/<plan-id>/T02-<name>.md`
```

If the index does not exist, create it with a header and the new section. If it exists but is malformed, log a warning and append the section without reformatting existing content.

### Step 9: Return to Orchestrator

1. **Return the task manifest**:

   ```yaml
   plan-id: YYYY-MM-DD-NNN
   task-count: <N>
   tasks:
     - id: <plan-id>-T01
       path: docs/tasks/<plan-id>/T01-<name>.md
       unit: U1
       acceptance_criterion: "[criterion]"
       priority: P0
       dependencies: []
     - id: <plan-id>-T02
       path: docs/tasks/<plan-id>/T02-<name>.md
       unit: U2a
       acceptance_criterion: "[criterion]"
       priority: P1
       dependencies: [<plan-id>-T01]
   interactionMode: detailed | smart | autopilot
   ```

2. **Inform the Orchestrator** that the Plan workflow is complete. The task files are ready for the Work skill (`work/SKILL.md`) to execute in dependency order.

## Output: Task Artifacts

- Verify that **one task file exists per Acceptance Criterion** (never one task for multiple criteria), saved to `docs/tasks/<plan-id>/T<NN>-<name>.md`.
- Verify that each task carries **exactly one Acceptance Criterion** and **exactly one `files.test` entry** (its own test asserting that criterion).
- Verify that each task's `## Steps` are ordered **Red → Green → Refactor**, with the failing test written and confirmed before implementation.
- Verify that task IDs are zero-padded 2 digits matching dependency order, with no gaps.
- Verify that no task depends on a later task (dependency order is valid).
- Verify that `docs/tasks/<plan-id>/index.md` has been updated with an unchecked checklist for all tasks.
- Verify that the task manifest returned to the Orchestrator accurately reflects the saved files.

> The Task Artifacts are the handoff to the Work skill. Each task is self-contained around a single Acceptance Criterion and its test — executable without re-reading the full plan.