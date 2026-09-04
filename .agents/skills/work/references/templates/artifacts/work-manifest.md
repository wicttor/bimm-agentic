---
title: Work Manifest Artifact
description: Template for the Work Manifest produced by the Triage phase. Carries the resolved, dependency-ordered task list (one AC per task, one test per task), ready-tasks, related learnings, and any dependency-warning; consumed by Prepare.
type: template
version: 1.0
timestamp: "2026-08-07"
---

# Work Manifest Artifact

The product of the **Triage** phase is a resolved, dependency-ordered Work Manifest. It normalizes the three input shapes (plan-based, task-file, ad-hoc) into one structure: a list of tasks, each carrying exactly one Acceptance Criterion and one test, ordered by dependency, with status and readiness flags. Prepare consumes it.

## Schema

```yaml
triage-id: YYYY-MM-DD-NNN-triage
work-id: YYYY-MM-DD-NNN
work-branch: work/<short-description> | null      # git branch for this run (Triage Step 2d)
work-branch-base: <branch-name> | null            # base used when the branch was created
work-branch-state: created | checked-out | already-on | skipped-by-user | not-a-git-repo
input-shape: plan-based | task-file | ad-hoc
interactionMode: detailed | smart | autopilot
status: complete
timestamp: ISO-8601 timestamp

# Resolved task list (dependency-ordered; one AC per task)
tasks:
  - id: <work-id>-T<NN>
    title: "[Task title]"
    unit: U<NN> | U<NN><letter>
    acceptance-criterion: "[exactly one, verifiable]"
    files:
      create: [path/to/file, ...]
      modify: [path/to/file, ...]
      test: [path/to/test]          # exactly one
    priority: P0 | P1 | P2
    dependencies: [<task-id>, ...]
    status: not-started | in-progress | completed | blocked | skipped   # current task-file status
    risk: low | medium | high                  # carried for execution-mode selection
    ready: true | false                        # deps completed and status not completed

ready-tasks: [<task-id>, ...]                 # subset of tasks runnable this session
already-complete-tasks: [<task-id>, ...]      # completed tasks (skipped on resume)

related-learnings:                            # per-task; from docs/learn/index.md
  <task-id>:
    - docs/learn/XXX.md — [1-line applicability note]

learning-gaps:
  - gap_name: "[Domain] — [what's missing]"
    domain: [primary domain]
    relevance: why this matters for the task
    suggested_action: "Research external resource" | "Document post-implementation"

dependency-warning: null | proceeded-without-upstream | expanded-to-upstream   # task-file shape only
work-state: ready | nothing-ready              # nothing-ready if no task is runnable
```

Also save the manifest to `docs/plans/.work/.triage/<triage-id>.md` for future reference or reuse.

## Validation Rules

- **triage-id:** Required. Format `YYYY-MM-DD-NNN-triage`.
- **work-id:** Required. For plan-based/task-file, equals the `plan-id` (inherited). For ad-hoc, a freshly allocated `YYYY-MM-DD-NNN` (per [id-generation.md](../../id-generation.md)). The `docs/tasks/<work-id>/` directory must exist (ad-hoc creates it; plan-based already has it).
- **work-branch:** Required. Format `work/<slug>` (kebab-case, ≤ 50 chars); `null` only when `work-branch-state` is `skipped-by-user` or `not-a-git-repo`. Must be consistent with `work-branch-state` (`created`/`checked-out`/`already-on` require a branch).
- **work-branch-base:** Required. The base branch used at creation (Triage Step 2d.4); `null` when no branch was created.
- **work-branch-state:** Required. One of `created`, `checked-out`, `already-on`, `skipped-by-user`, `not-a-git-repo`.
- **input-shape:** Required. One of `plan-based`, `task-file`, `ad-hoc`.
- **interactionMode:** Required, propagated from the Work Input Artifact.
- **status:** Required. `complete`.
- **tasks:** Required, non-empty unless `work-state: nothing-ready`. Each task must carry:
  - exactly one `acceptance-criterion` and exactly one `files.test` entry
  - `files` repository-relative
  - `dependencies` referencing task-ids that exist (plan-based: in the index; task-file/ad-hoc: in the manifest or parent plan)
- **ready-tasks:** Required (may be empty). Subset of `tasks` whose dependencies are all `completed` and whose status is not `completed`.
- **already-complete-tasks:** Required (may be empty). Tasks with `status: completed` — skipped on resume.
- **related-learnings:** Required (may be empty per task). References `docs/learn/index.md` entries.
- **dependency-warning:** Required for the task-file shape (`proceeded-without-upstream` or `expanded-to-upstream` record the upstream-dep decision); `null` for other shapes.
- **work-state:** Required. `nothing-ready` if `ready-tasks` is empty and no task is runnable.

## Example (plan-based)

```yaml
triage-id: 2026-08-07-001-triage
work-id: 2026-07-10-001
work-branch: work/redis-session-store
work-branch-base: main
work-branch-state: created
input-shape: plan-based
interactionMode: smart
status: complete
timestamp: 2026-08-07T14:30:00Z
tasks:
  - id: 2026-07-10-001-T01
    title: "Redis client connects and backs the SessionStore interface"
    unit: U1
    acceptance-criterion: "The Redis client connects from REDIS_URL with retry, and SessionStore exports get/save/delete"
    files: { create: [src/lib/redis-client.ts, src/lib/session-store.ts], modify: [], test: [src/lib/redis-client.test.ts] }
    priority: P0
    dependencies: []
    status: not-started
    risk: high
    ready: true
ready-tasks: [2026-07-10-001-T01]
already-complete-tasks: []
related-learnings:
  2026-07-10-001-T01:
    - docs/learn/pattern/redis-retry-2026-07-02.md — connection retry pattern reused here
learning-gaps: []
dependency-warning: null
work-state: ready
```

## Notes

- The manifest is in **dependency order**: no task appears before its dependencies (topological, stable by unit number).
- The work branch is created in Triage Step 2d, before any task file or index is written; branch setup is idempotent, so a re-run resumes on the same branch. The orchestrator's quality gate verifies branch coherence before Execute.
- Resume-safe: Prepare/Execute read each task's current `status` from its task file, not from the manifest alone — the manifest is the resolved plan, the task files are the live state.
- For `task-file` input with the "Proceed anyway" choice, the manifest contains only the single task and `dependency-warning: proceeded-without-upstream`; for "Run upstream first", it contains the unmet upstream tasks plus this task and `dependency-warning: expanded-to-upstream`. Downstream dependents are never included.