---
title: Work Input Artifact
description: Template for the Work Input Artifact produced by the Orchestrator. Carries the input shape (plan-id, task-file, or ad-hoc description) and interactionMode; consumed by Triage.
type: template
version: 1.0
timestamp: "2026-08-07"
---

# Work Input Artifact

The Orchestrator produces a Work Input Artifact as the entry point to the Work workflow. It carries the input shape (one of plan-id, task-file, or ad-hoc description) and the user-selected `interactionMode`. Triage consumes it.

## Schema

```yaml
type: work-input
timestamp: ISO-8601 timestamp (e.g., 2026-08-07T14:30:00Z)
source: user | saved-prompt | document | combination
status: complete
interactionMode: detailed | smart | autopilot

# Input shape — exactly one of the following:
plan-id: YYYY-MM-DD-NNN | null          # plan-based: points at docs/tasks/<plan-id>/index.md
task-file: docs/tasks/<plan-id>/T<NN>-<name>.md | null   # task-file input (also accepts a task-id like <plan-id>-T03)
ad-hoc: "<raw work description>" | null  # ad-hoc input

# Optional context carried for ad-hoc:
goals: [ ... ]
constraints: [ ... ]
references: [ ... ]
```

## Validation Rules

- **type:** Required. Must be `work-input`.
- **timestamp:** Required. ISO-8601.
- **source:** Required. One of `user`, `saved-prompt`, `document`, `combination`.
- **status:** Required. `complete` (the Orchestrator marks it complete once it has the input and the interaction mode).
- **interactionMode:** Required. One of `detailed`, `smart`, `autopilot`. (If missing, default to `smart`; see [error-handling.md](../../error-handling.md) Category 5.)
- **Input shape:** Exactly one of `plan-id`, `task-file`, `ad-hoc` must be non-null. If all three are null/empty, the Orchestrator asks: "What would you like to work on? Provide a plan-id, a task file, or describe the task." (Category 3.)
- **plan-id:** When present, matches `YYYY-MM-DD-NNN` and resolves to a non-empty `docs/tasks/<plan-id>/index.md`. If not, ask to run `/plan <id>` first or switch to ad-hoc.
- **task-file:** When present, resolves to exactly one task file (or a task-id resolving uniquely). If it matches multiple files, ask the user to disambiguate.
- **ad-hoc:** When present, a non-empty work description.

## Example

```yaml
type: work-input
timestamp: 2026-08-07T09:00:00Z
source: user
status: complete
interactionMode: smart
plan-id: 2026-07-10-001
goals: null
constraints: null
references: null
```

Ad-hoc example:

```yaml
type: work-input
timestamp: 2026-08-07T09:05:00Z
source: user
status: complete
interactionMode: detailed
plan-id: null
task-file: null
ad-hoc: "Fix the login redirect loop when a session expires mid-request"
goals: ["Users land on the login page instead of a 500"]
constraints: ["No new dependencies"]
references: null
```

## Notes

- The Orchestrator's Pre-Flight Check ensures `docs/tasks/` and `docs/plans/.work/.{triage,prepare,execute,review}/` exist (self-healing via `mkdir -p`) before handing the Work Input Artifact to Triage.
- `interactionMode` flows from this artifact into every downstream artifact (Triage → Prepare → Execute → Review); the orchestrator quality gate #2 cross-checks it is identical across all.