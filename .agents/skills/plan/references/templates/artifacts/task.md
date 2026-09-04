---
title: Task Artifact
description: Template for the Task Artifact produced by the Tasks phase. One task per Acceptance Criterion; one test per task; Red→Green→Refactor Steps. Defines the schema for a single executable, test-driven task file.
type: template
version: 2.0
timestamp: "2026-08-07"
---

# Task Artifact

The product of the **Tasks** phase (Phase 5) is a set of granular, executable, **test-driven** task files — **one per Acceptance Criterion**. Each task carries exactly one Acceptance Criterion and exactly one test file, follows Red→Green→Refactor, and is self-contained enough to execute without re-reading the full plan. It is the handoff point to the Work skill (`work/SKILL.md`).

## Core rule

- **One Acceptance Criterion per task.**
- **One test per task** (in `files.test`, exactly one entry) — that test asserts this task's single Acceptance Criterion.
- **Test-Driven:** `## Steps` run **Red → Green → Refactor** (write the failing test first and confirm it fails, implement the minimum code to pass, then refactor with the test green).

## Schema

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
timestamp: ISO-8601 timestamp (e.g., 2026-08-07T14:30:00Z)
---

# [Task Title]

## Goal
[What this task accomplishes, inherited from the implementation unit and scoped to this one criterion. 1-2 sentences.]

## Acceptance Criterion
[Exactly one, single, verifiable criterion this task delivers.]

## Steps
1. **Red — Write the failing test:** add the test at `files.test[0]` asserting this Acceptance Criterion. Run it and confirm it fails for the right reason (not a setup/import error).
2. **Green — Implement:** add the minimum code in `files.create`/`files.modify` to make the test pass.
3. **Refactor:** clean up naming, duplication, and structure while keeping the test green.

## Test Scenarios
- [Scenario]: [Input -> Expected Outcome]   # the assertion(s) for this criterion (may be a single scenario)

## Acceptance Criteria
- [ ] [This task's single Acceptance Criterion, restated as a checkable box]

## Dependencies
- [task-id]: [why this task must complete first, or "None"]

## Notes
[Any context, gotchas, references to learnings, or links to related tasks. Optional.]
```

## Validation Rules

- **id:** Required. Format `<plan-id>-T<NN>` where `NN` is zero-padded 2 digits matching dependency order. Sub-IDs use letters (e.g., `T02a`).
- **title:** Required. Short, action-oriented (e.g., "Set up Redis client and session store interface").
- **plan-id:** Required. Must match the Final Plan's `plan-id` for traceability.
- **unit:** Required. The originating implementation unit (e.g., `U1`, `U2a`). A task never spans more than one Acceptance Criterion, so it records exactly one unit (or one sub-id).
- **tier:** Required. Inherited from the Final Plan (`fast | standard | deep`).
- **status:** Required. Initial value `not-started`. The Work skill updates this to `in-progress`, `completed`, or `blocked`.
- **priority:** Required. `P0` (blocks all), `P1` (critical path), `P2` (deferrable).
- **dependencies:** Required (may be empty list). Must reference task IDs that appear earlier in dependency order.
- **files:** Required. `test` must contain **exactly one** path — the test for this task's single Acceptance Criterion. At least one of `create`, `modify`, or `test` must be non-empty. All paths must be repository-relative.
- **estimated-effort:** Required. Rough estimate in hours or days. Used by the Work phase for sequencing.
- **Goal:** Required. 1–2 sentences, inherited from the unit and scoped to this criterion.
- **Acceptance Criterion:** Required. **Exactly one** verifiable criterion. Single, not bundled.
- **Steps:** Required. Exactly three, in **Red → Green → Refactor** order, with the failing test written and confirmed **before** implementation.
- **Test Scenarios:** Required for foundation/integration tasks (phases 1–2). Optional for rollout-only tasks. Format: `[Scenario]: [Input -> Expected Outcome]`. May be a single scenario (one task = one criterion = one test).
- **Acceptance Criteria (checkbox):** Required. Exactly one checkable item restating the criterion above.
- **Notes:** Optional. May reference learnings, gotchas, or related tasks.

## Example

```yaml
---
id: 2026-07-03-001-T01
title: "Redis client connects and backs the SessionStore interface"
plan-id: 2026-07-03-001
unit: U1
tier: standard
status: not-started
priority: P0
dependencies: []
files:
  create:
    - src/lib/redis-client.ts
    - src/lib/session-store.ts
  test:
    - src/lib/redis-client.test.ts
estimated-effort: "4 hours"
timestamp: 2026-07-03T09:00:00Z
---

# Redis client connects and backs the SessionStore interface

## Goal
Create a Redis client wrapper that connects from `REDIS_URL` with retry-on-failure, and define the `SessionStore` interface it satisfies. This is the foundation for all later session work.

## Acceptance Criterion
The Redis client connects using `REDIS_URL` with retry on failure, and `SessionStore` exports `get`, `save`, and `delete` — verified by a failing-then-passing test.

## Steps
1. **Red — Write the failing test:** add `src/lib/redis-client.test.ts` asserting: store `{id, data}` → retrieve returns the same data; a 1s TTL session returns null after expiry; dropping the connection makes `get` throw a retryable error. Run it and confirm it fails (interface/client not yet implemented).
2. **Green — Implement:** add `ioredis` to `package.json`; create `src/lib/redis-client.ts` (configured client with connection retry) and `src/lib/session-store.ts` (`get`, `save`, `delete`) until the test passes.
3. **Refactor:** keep the client wrapper thin (business logic belongs in the store implementation — T02); ensure all three test scenarios stay green.

## Test Scenarios
- Store/retrieve session: store {id, data} -> retrieve returns same data
- TTL expiration: store with 1s TTL -> after 1s, get returns null
- Connection error: drop connection -> get throws retryable error

## Acceptance Criteria
- [ ] Redis client connects from `REDIS_URL` with retry on failure and `SessionStore` exposes `get`/`save`/`delete` (all three test scenarios pass)

## Dependencies
- None

## Notes
- Reuse the connection retry pattern from `docs/learn/pattern/redis-retry-2026-07-02.md` if it exists.
- Feature flag `feature.redis_sessions` is added in T04, not here.
- T02 implements the Redis-backed `SessionStore`; keep this task limited to the client + interface + its own test.
```

## File-Naming Convention

Task files are named and stored as:

```
docs/tasks/<plan-id>/T<NN>-<kebab-case-name>.md
```

**Example:**

```
docs/tasks/2026-07-03-001/
  T01-redis-client-and-session-store-interface.md
  T02a-redis-session-store-implementation.md
  T02b-session-middleware-refactor.md
  T04-dual-write-cutover.md
```

## Usage in Workflow

1. **Tasks Phase** reads the Final Plan's Implementation Units and slices them into tasks per [task-slicing-rules.md](../../task-slicing-rules.md) — **one task per Acceptance Criterion**.
2. Each task file is saved to `docs/tasks/<plan-id>/T<NN>-<name>.md`.
3. **Tasks Phase** updates `docs/tasks/<plan-id>/index.md` with a checklist of all tasks for the plan.
4. **Work skill** (`work/SKILL.md`) reads task files, runs each task's Red→Green→Refactor cycle, and updates `status` and the index checklist.

## Index Entry Format

After saving all task files, append a section to `docs/tasks/<plan-id>/index.md`:

```markdown
## 2026-07-03-001 — Migrate Session Storage to Redis

- [ ] T01 — Redis client connects and backs the SessionStore interface (`U1`, AC: client connects with retry + SessionStore get/save/delete) — `docs/tasks/2026-07-03-001/T01-redis-client-and-session-store-interface.md`
- [ ] T02a — Redis-backed SessionStore implementation (`U2a`, AC: get/save/delete persist sessions to Redis with TTL) — `docs/tasks/2026-07-03-001/T02a-redis-session-store-implementation.md`
- [ ] T02b — Session middleware refactor (`U2b`, AC: middleware loads valid sessions and rejects invalid/expired JWTs) — `docs/tasks/2026-07-03-001/T02b-session-middleware-refactor.md`
- [ ] T04 — Dual-write and cutover (`U4`, AC: dual-write to Redis with feature-flagged cutover) — `docs/tasks/2026-07-03-001/T04-dual-write-cutover.md`
```

The `- [ ]` (unchecked) markers are updated to `- [x]` by the Work skill as tasks complete.

## Missing Field Recovery

If a task file is incomplete at validation, use this recovery workflow:

| Field               | Validation                           | Recovery                                            |
| ------------------- | ------------------------------------ | --------------------------------------------------- |
| id                  | Matches `<plan-id>-T<NN>`            | Regenerate from dependency order                    |
| unit                | References a single plan unit        | Ask user to map the task to one unit                |
| files.test          | Exactly one path                     | Ask user for the single test file for this criterion |
| files (create/modify) | At least one path non-empty        | Ask user which files the task touches               |
| Acceptance Criterion | Exactly one, verifiable             | Ask user to state the single criterion              |
| Steps               | Red → Green → Refactor ordering     | Re-sequence; ensure test is written and run first    |
| Test Scenarios      | Present for phases 1–2              | Inherit from the unit's test scenarios              |
| Acceptance Criteria | Exactly one checkable item          | Derive from the single Acceptance Criterion         |
| dependencies        | References earlier task IDs         | Re-run dependency ordering algorithm                 |

**Note:** If a task cannot be produced because the plan has no Implementation Units (or a unit has no Acceptance Criteria), abort the Tasks phase and ask the user to re-run the Design/Generate phases — the plan is incomplete.