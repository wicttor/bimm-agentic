---
title: Ad-Hoc Input Resolution
description: Authoritative reference for the Triage phase. Defines how a raw work description is resolved into task-shaped work (one Acceptance Criterion per task, one test per task, Red-first), including problem-frame collection, AC extraction, sizing, dependency ordering, and priority assignment.
type: reference
version: 1.0
timestamp: "2026-08-07"
---

# Ad-Hoc Input Resolution

Authoritative reference for the **Triage** phase (Step 2c). Defines how a raw work description (bug, feature, change) is resolved into the same task-shaped work the `/plan` Tasks phase produces — **one Acceptance Criterion per task, one test per task, Red → Green → Refactor** — so ad-hoc work is fully interchangeable with plan-based work downstream.

## Core Rule (mirrors `/plan`)

- **One Acceptance Criterion per task.** Each derived task carries exactly one `## Acceptance Criterion` and exactly one `files.test` entry (its own test asserting that criterion).
- **One test per task.** Never one test asserting multiple criteria. Never one task bundling multiple criteria.
- **Red-first.** Each task's `## Steps` are ordered Red → Green → Refactor, with the failing test written and confirmed before implementation.

## Resolution Steps

### 1. Collect the Problem Frame and Intended Behavior

If the description is missing or vague on either, ask the user one question at a time:

1. **Problem Frame:** "What problem are you trying to solve? Describe it in 1–2 sentences." (maps to the task's `## Goal`)
2. **Intended Behavior:** "What should happen after this is implemented? Describe the desired outcome." (maps to the observable outcome)
3. **Success Criteria:** "How will we know this is complete? What specific outcomes define success?" Collect 1–3 criteria.

If both are present and concrete from the description, extract them and skip the prompts.

### 2. Extract Acceptance Criteria

Derive 1–3 Acceptance Criteria from the success criteria — **one AC per task**. Phrase each as a single, verifiable outcome (not a bundle). If a criterion would need > 5 files or > 1 day of effort, **split it into finer sub-criteria** (each its own task) rather than slicing a task partway through a criterion (mirror the `/plan` task-slicing Rule 2). Sub-IDs use letters: `U1` → `T01a`, `T01b` (never extra digits).

### 3. Assign Files Per Task

For each task, populate from the description and a read of the codebase:

- `files.create` — new files the implementation needs.
- `files.modify` — existing files touched.
- `files.test` — **exactly one** dedicated test file for this task's single AC; resolved repo-relative.

At least one of `create`, `modify`, or `test` must be non-empty. All paths repository-relative, backtick-formatted in the task file.

### 4. Draft Steps (Red → Green → Refactor)

For each task, draft the three steps:

1. **Red** — write the failing test in `files.test[0]` asserting this AC; confirm it fails for the right reason.
2. **Green** — implement the minimum code in `files.create`/`files.modify` to make the test pass.
3. **Refactor** — clean up naming, duplication, and structure while keeping the test green.

### 5. Order by Dependencies

Order tasks so each task's dependencies are satisfied by earlier tasks (topological order, stable by original unit number):

```
1. Start with all tasks as "remaining".
2. Find tasks whose dependencies are all already ordered -> "ready".
3. If none ready: a cycle exists -> surface to the user (break or abort).
4. Sort ready tasks by original unit number; append to "ordered".
5. Repeat until all tasks are ordered.
```

### 6. Assign Priorities

| Priority | Criteria                                           |
| -------- | -------------------------------------------------- |
| P0       | Blocks all other tasks (foundation, infra, schema) |
| P1       | On the critical path but not blocking              |
| P2       | Can be deferred or parallelized                    |

### 7. Infer Tier (for task frontmatter)

Infer the `/plan` tier from the derived task count:

| Tier     | Task count | Max files/task | Max effort/task |
| -------- | ---------- | -------------- | --------------- |
| fast     | 1–3        | 3              | Half day        |
| standard | 4–8        | 5              | 1 day           |
| deep     | 8–15       | 5              | 1 day           |

Default to `fast` when task count ≤ 3. The tier is recorded in each task's frontmatter (`tier` field) for traceability with `/plan` task files; it does not change Work's behavior (Work runs tasks identically regardless of tier).

## Materialization

After resolution, materialize the tasks as files (Triage Step 2c.3):

- **Filename:** `docs/tasks/<work-id>/T<NN>-<kebab-case-name>.md` (`<NN>` zero-padded 2 digits matching dependency order).
- **Schema:** the `/plan` [Task Artifact template](../../plan/references/templates/artifacts/task.md) — set `plan-id` to `work-id`, `status: not-started`, the inferred `tier`.
- **Index:** create `docs/tasks/<work-id>/index.md` with the `- [ ]` checklist for all tasks (same format as the `/plan` Tasks phase index).

Then build the manifest by reading the created files back (confirming shape parity with plan-based tasks).

## Validation (Triage Step 3 re-checks)

Each derived task must pass before the manifest is accepted:

- exactly one `## Acceptance Criterion` and exactly one `files.test`
- Red → Green → Refactor step ordering, test written and confirmed first
- repository-relative, backtick-formatted paths
- dependencies reference task-ids that exist in the manifest

On any failure, regenerate the offending task from Step 2 onward (Category 2 recovery per [error-handling.md](error-handling.md)).

## Smart Pause Triggers

Triage pauses in Smart mode when the input shape is `ad-hoc` (the resolved task list was **inferred**, not user-authored — confirm it matches intent). This is the ad-hoc-specific trigger; see Triage Step 7 for the full list.

## Error Handling

| Scenario                                   | Recovery                                              |
| ------------------------------------------ | ----------------------------------------------------- |
| Description empty or unobservable          | Ask the user the problem-frame/intended-behavior prompts |
| A criterion needs > 5 files / > 1 day       | Split into finer sub-criteria (Step 2)                |
| Dependency cycle among derived tasks        | Surface to the user; ask to break or abort             |
| `docs/tasks/<work-id>/` write fails         | Category 4 recovery per [error-handling.md](error-handling.md) |

## Notes

- This reference reuses the `/plan` task-slicing heuristics (one AC per task, sub-ID letters, topological order, P0/P1/P2) so ad-hoc tasks are indistinguishable from `/plan`-produced tasks.
- The resolved tasks inherit the same Task Artifact schema as `/plan`, so Execute and Review treat them identically to plan-based tasks.