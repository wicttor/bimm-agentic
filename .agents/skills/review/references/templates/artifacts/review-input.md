---
title: Review Input Artifact
description: Template for the Review Input Artifact produced by the Orchestrator. Carries the input shape (change-set, work-id/Work review-id, or ad-hoc) and interactionMode, plus an optional requirements ref; consumed by Scope.
type: template
version: 1.0
timestamp: "2026-08-08"
---

# Review Input Artifact

The Orchestrator produces a Review Input Artifact as the entry point to the Review workflow. It carries the input shape (one of change-set, work-id/Work review-id, or ad-hoc) and the user-selected `interactionMode`, plus an optional requirements ref that sharpens scope-creep detection. Scope consumes it.

## Schema

```yaml
type: review-input
timestamp: ISO-8601 timestamp (e.g., 2026-08-08T14:30:00Z)
source: user | saved-prompt | document | combination
status: complete
interactionMode: detailed | smart | autopilot

# Input shape — exactly one of the following:
change-set: "<git spec>" | null         # change-set: diff range ("<base>..<head>"), commit range ("A..B"), "HEAD", staged, branch-vs-base, or paths/globs
work-id: YYYY-MM-DD-NNN | null          # work-linked: reviews a /work run's changes
work-review-id: YYYY-MM-DD-NNN-review | null   # work-linked: scopes to a specific Work review run (resolved to its work-id)
ad-hoc: "<target description>" | null   # ad-hoc input (a module/symbol/path described in prose)

# Optional requirements ref — sharpens scope-creep detection (Scope runs the category only when present)
requirements-ref:
  type: plan-id | task-criterion | spec-doc | null
  path: "docs/plans/<plan-id>.md | docs/tasks/<plan-id>/T<NN>-<name>.md | <spec-doc path> | null"

# Optional context carried:
goals: [ ... ]
constraints: [ ... ]
references: [ ... ]
```

## Validation Rules

- **type:** Required. Must be `review-input`.
- **timestamp:** Required. ISO-8601.
- **source:** Required. One of `user`, `saved-prompt`, `document`, `combination`.
- **status:** Required. `complete` (the Orchestrator marks it complete once it has the input and the interaction mode).
- **interactionMode:** Required. One of `detailed`, `smart`, `autopilot`. (If missing, default to `smart`; see [error-handling.md](../../error-handling.md) Category 5.)
- **Input shape:** Exactly one of `change-set`, `work-id` (or `work-review-id`), `ad-hoc` must be non-null. If all three are null/empty, the Orchestrator asks: "What would you like to review? Provide a git ref/range, a work-id, or describe a target." (Category 3.)
- **change-set:** When present, parses to a concrete git invocation (the repo must be a git working tree); an empty diff is accepted (Scope records `change-boundary.empty: true`).
- **work-id / work-review-id:** When present, resolves to a non-empty `docs/tasks/<work-id>/index.md` (and, for `work-review-id`, to `docs/plans/.work/.review/<review-id>.md`). If not, ask to run `/work <work-id>` first or switch to change-set input.
- **ad-hoc:** When present, a non-empty target description; Scope maps it to concrete files/paths (asks the user to name a file/module/path if it maps to none).
- **requirements-ref:** Optional. `type` is one of `plan-id` / `task-criterion` / `spec-doc` / `null` with a matching `path`; when `null`, scope-creep detection is skipped (legitimate, not an error).

## Example (change-set, with a requirements ref)

```yaml
type: review-input
timestamp: 2026-08-08T09:00:00Z
source: user
status: complete
interactionMode: smart
change-set: "main..feature/redis-session"
work-id: null
work-review-id: null
ad-hoc: null
requirements-ref:
  type: plan-id
  path: "docs/plans/2026-07-10-001-redis-session-store.md"
goals: null
constraints: null
references: null
```

## Example (work-linked, no requirements ref)

```yaml
type: review-input
timestamp: 2026-08-08T09:05:00Z
source: user
status: complete
interactionMode: detailed
change-set: null
work-id: 2026-07-10-001
work-review-id: null
ad-hoc: null
requirements-ref:
  type: plan-id
  path: "docs/tasks/2026-07-10-001/index.md"
goals: null
constraints: null
references: null
```

## Example (ad-hoc, no requirements ref)

```yaml
type: review-input
timestamp: 2026-08-08T09:10:00Z
source: user
status: complete
interactionMode: autopilot
change-set: null
work-id: null
work-review-id: null
ad-hoc: "review the auth module — src/auth/*"
requirements-ref:
  type: null
  path: null
goals: null
constraints: null
references: null
```

## Notes

- The Orchestrator's Pre-Flight Check ensures `docs/review/.{scope,prepare,analyze,report}/` and `docs/review/index.md` exist (self-healing via `mkdir -p`) before handing the Review Input Artifact to Scope.
- `interactionMode` flows from this artifact into every downstream artifact (Scope → Prepare → Analyze → Report); the orchestrator quality gate #2 cross-checks it is identical across all.
- For work-linked input, the Work `review-id` and the Review skill's own `review-id` are **distinct** (see [id-generation.md](../../id-generation.md)); the `work-review-id` here is only an input resolver, never reused as the Review skill's umbrella id.