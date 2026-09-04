---
title: Task Slicing Rules
description: Reference for the Tasks phase. Defines how to decompose a plan's implementation units into Acceptance-Criterion-sized task files — one task per AC, one test per task, TDD-ordered, dependency-ordered, and registered in the index.
type: reference
version: 2.0
timestamp: "2026-08-07"
---

# Task Slicing Rules

This file documents the rules for decomposing a finalized plan into individual task files during the **Tasks** phase (Phase 5). The model is **one task per Acceptance Criterion**, with **one test per task** (test written first, Red→Green→Refactor), ordered by dependency, saved to `docs/tasks/<plan-id>/`, and registered in `docs/tasks/<plan-id>/index.md`.

## When to Apply

Task slicing runs after the Generate phase has produced a validated Final Plan. The Tasks phase reads the plan's Implementation Units — each of which carries one or more **Acceptance Criteria** — and produces one task file per criterion.

## Core Slicing Heuristics

### Rule 1: One Task Per Acceptance Criterion (Default)

Each **Acceptance Criterion** on an Implementation Unit becomes **exactly one task**. The task inherits the unit's goal, dependencies, and file paths, and gets its **own dedicated test file** in `files.test`. A task never spans more than one Acceptance Criterion.

### Rule 2: Never Split Within an Acceptance Criterion

If a single Acceptance Criterion would need > 5 files or > 1 day of effort, do **not** slice the task partway through the criterion. Instead, **split the criterion into two or more finer sub-criteria** in the originating unit, then create one task per sub-criterion. This keeps the one-task-one-test-one-AC invariant intact.

Split criteria use sub-identifiers: `U2` → `U2a`, `U2b` (letters, not extra digits). Never renumber the original units or criteria.

### Rule 3: No Merging Across Criteria

Do not merge tasks. A task always carries exactly one Acceptance Criterion. (Adjacent trivial units that genuinely share a single criterion are, by definition, already one criterion — they yield one task.)

### Rule 4: Preserve Dependency Order

Tasks must be ordered so a task's dependencies are fully satisfied by earlier tasks. Never produce a task that depends on a later task.

```
valid ordering:
  T1 (no deps) → T2 (deps: T1) → T3 (deps: T1, T2)

invalid ordering:
  T2 (deps: T3) → T1 (no deps) → T3 (deps: T1)
```

### Rule 5: Never Renumber Units or Criteria

When slicing, preserve the original `U#` identifiers from the plan. If a unit's criteria are split (Rule 2), use sub-identifiers (e.g., `U2a`, `U2b`). Never renumber — units and criteria are referenced by the plan and downstream execution.

## Sizing Guidance by Plan Tier

| Tier     | Target Tasks | Max Files Per Task | Suggested Max Effort Per Task |
| -------- | ------------ | ------------------ | ----------------------------- |
| Fast     | 1–3          | 3                  | Half day                      |
| Standard | 4–8          | 5                  | 1 day                        |
| Deep     | 8–15         | 5                  | 1 day                        |

These are **guidance**, not hard limits. If a tier's task count would exceed the target, split criteria finer (Rule 2). If it would fall short, that is acceptable — never manufacture criteria to hit a target, and never merge criteria to reduce the count.

## Task File Schema

Each task file is markdown with this schema (see [task.md template](templates/artifacts/task.md)):

```yaml
---
id: <plan-id>-T<NN>
title: "[Task title]"
plan-id: <plan-id>
unit: U<NN> | U<NN><letter>
tier: fast | standard | deep
status: not-started
priority: P0 | P1 | P2
dependencies: [<task-id>, ...]
files:
  create: [path/to/file, ...]
  modify: [path/to/file, ...]
  test: [path/to/test]          # exactly one — the test for this task's AC
estimated-effort: "<hours or days>"
timestamp: ISO-8601 timestamp
---

# [Task Title]

## Goal
[Inherited from the unit, scoped to this one criterion. 1-2 sentences.]

## Acceptance Criterion
[Exactly one, single, verifiable criterion this task delivers.]

## Steps
1. **Red — Write the failing test:** add the test at `files.test[0]` asserting this Acceptance Criterion. Run it and confirm it fails for the right reason.
2. **Green — Implement:** add the minimum code in `files.create`/`files.modify` to make the test pass.
3. **Refactor:** clean up naming, duplication, and structure while keeping the test green.

## Test Scenarios
- [Scenario]: [Input -> Expected Outcome]   # the assertion(s) for this criterion (may be one)

## Acceptance Criteria
- [ ] [This task's single Acceptance Criterion, restated as a checkable box]

## Dependencies
- [task-id]: [why this task must complete first, or "None"]

## Notes
[Any context, gotchas, references to learnings, or links to related tasks. Optional.]
```

## File-Naming Convention

Task files are named:

```
docs/tasks/<plan-id>/T<NN>-<kebab-case-name>.md
```

Where:

- `<plan-id>` — The plan's ID (e.g., `2026-07-03-001`)
- `<NN>` — Zero-padded 2-digit task number, matching dependency order (01, 02, ..., 10)
- `<kebab-case-name>` — Short descriptive name (e.g., `redis-client-setup`)

**Example:**

```
docs/tasks/2026-07-03-001/
  T01-redis-client-setup.md
  T02-session-store-interface.md
  T03-session-middleware-refactor.md
```

## Task ID Generation

```
1. Read the plan-id from the Final Plan artifact.
2. Tasks are numbered NN in dependency order (01, 02, ...).
3. If a criterion is split (Rule 2): use letters, not extra digits: U2a -> T02a, T02b.
4. The `unit` field records the originating unit (or sub-ID).
```

## Dependency Ordering Algorithm

```
function order_tasks(tasks):
  # tasks is a list of {id, unit, dependencies, ...}
  ordered = []
  remaining = copy(tasks)
  while remaining:
    ready = [t for t in remaining if all(d in ordered for d in t.dependencies)]
    if not ready:
      raise CycleError("Dependency cycle detected among: " + remaining)
    # Sort ready tasks by original unit number for stable ordering
    ready.sort(by: unit_number)
    ordered.extend(ready)
    remaining.remove(ready)
  return ordered
```

**Cycle handling:** If no task is ready (all have unsatisfied dependencies), a cycle exists. Log the error, surface the involved tasks to the user, and ask whether to break the cycle manually (by removing a dependency) or abort.

## Priority Assignment

| Priority | Criteria                                           |
| -------- | -------------------------------------------------- |
| P0       | Blocks all other tasks (foundation, infra, schema) |
| P1       | On the critical path but not blocking             |
| P2       | Can be deferred or parallelized                    |

Default: Phase 1 (Foundation) tasks → `P0`; Phase 2 (Integration) → `P1`; Phase 3 (Rollout)/optional → `P2`. Adjust based on risk analysis (a rollout task mitigating a HIGH risk may be `P1`).

## Index Registration

After saving all task files, update `docs/tasks/<plan-id>/index.md`:

```markdown
## <plan-id> — [Plan Title]

- [ ] T01 — [Task title] (`U1`, AC: [criterion]) — `docs/tasks/<plan-id>/T01-<name>.md`
- [ ] T02 — [Task title] (`U2a`, AC: [criterion]) — `docs/tasks/<plan-id>/T02-<name>.md`
```

Mark each task with `- [ ]` (unchecked). The Work skill will check them off as tasks complete.

## Error Handling

| Scenario                                | Recovery                                        |
| --------------------------------------- | ----------------------------------------------- |
| `docs/tasks/` directory missing         | Create it; create `<plan-id>/` subdirectory     |
| `docs/tasks/<plan-id>/index.md` missing | Create empty index; append the plan's section   |
| Dependency cycle detected among tasks   | Surface cycle to user; ask to break or abort    |
| Criterion would need > 5 files / > 1 day | Split the criterion into finer sub-criteria (Rule 2) |
| Plan has no Implementation Units        | Abort; ask user to re-run Generate phase        |
| Task count exceeds tier target          | Log warning; split criteria finer, or proceed (targets are guidance) |

## Interaction Mode Behavior

Per [interaction-mode-propagation.md](interaction-mode-propagation.md), the Tasks phase **always asks the user**, even in Autopilot mode:

| Mode      | Behavior                                         |
| --------- | ------------------------------------------------ |
| Detailed  | Show full task list + full file content; ask to save |
| Smart     | Show task list summary; ask to save              |
| Autopilot | Show task count; ask to save (always asks)       |

The question asked:

```
The plan has been sliced into <N> tasks (T01–T<NN>); one per Acceptance Criterion,
each with its own failing-first test.
Would you like me to create the task files in docs/tasks/<plan-id>/?
  - Yes: Create all task files and update the index
  - Review: Show the task list first, then ask again
  - No: Skip task creation (plan is still saved for manual slicing)
```

## Notes

- Tasks are the handoff point to the Work skill (`work/SKILL.md`); each must be self-contained around a single Acceptance Criterion and its test — executable without re-reading the full plan.
- Every task is Test-Driven: write the failing test first, confirm Red, implement to Green, refactor while green.
- One test per task (one test per AC). Never one test asserting multiple criteria.
- Preserve the plan's `Related Learnings` in task files touching the relevant domain, so the Work phase has context.
- If the user declines task creation, the plan remains the unit of work — the user can slice manually later.