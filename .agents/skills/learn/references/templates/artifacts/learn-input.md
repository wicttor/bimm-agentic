---
title: Learn Input Artifact
description: Template for the Learn Input Artifact produced by the Orchestrator. Carries the input shape (explicit type+text, candidate ref, or maintain flag) and interactionMode; consumed by Capture (authoring shapes) or routed directly to Maintain (maintain shape).
type: template
version: 1.0
timestamp: "2026-08-08"
---

# Learn Input Artifact

The Orchestrator produces a Learn Input Artifact as the entry point to the Learn workflow. It carries the input shape (one of explicit `<type> <text>`, a candidate ref, or a `maintain` flag) and the user-selected `interactionMode`. The Orchestrator routes an authoring shape to Capture; a `maintain` shape bypasses Capture/Refine/Index and routes directly to Maintain.

## Schema

```yaml
type: learn-input
timestamp: ISO-8601 timestamp (e.g., 2026-08-08T14:30:00Z)
source: user | saved-prompt | document | combination
status: complete
interactionMode: detailed | smart | autopilot
shape: explicit | candidate | maintain   # REQUIRED. Determines the route.

# Input cargo — exactly one shape's fields:
explicit:
  type: decision | pattern | gotcha | workflow   # REQUIRED when shape == explicit
  text: "<prose | file ref | commit ref | short description>"   # REQUIRED when shape == explicit
candidate:
  ref: "work-review-id | review-report-id"        # REQUIRED when shape == candidate
  # e.g. "2026-07-10-001-review" (Work) or "2026-08-08-001-report" (Review)
maintain:
  run: true                                       # REQUIRED when shape == maintain

# Optional context carried (explicit/candidate):
goals: [ ... ]
constraints: [ ... ]
references: [ ... ]
```

## Validation Rules

- **type:** Required. Must be `learn-input`.
- **timestamp:** Required. ISO-8601.
- **source:** Required. One of `user`, `saved-prompt`, `document`, `combination`.
- **status:** Required. `complete` (the Orchestrator marks it complete once it has the input and the interaction mode).
- **interactionMode:** Required. One of `detailed`, `smart`, `autopilot`. (If missing, default to `smart`; see [error-handling.md](../../error-handling.md) Category 5.)
- **shape:** Required. One of `explicit`, `candidate`, `maintain`.
- **Exactly one shape's cargo is present** (the others null/absent):
  - `explicit` requires `explicit.type` ∈ the four types **and** non-empty `explicit.text`.
  - `candidate` requires a non-empty `candidate.ref` resolving to a Work `review-id` or Review `report-id`.
  - `maintain` requires `maintain.run: true`.
- **Routing:** the Orchestrator routes `shape: maintain` directly to the Maintain phase (Phase 4); `shape: explicit` and `shape: candidate` route to Capture (Phase 1). A routing mismatch (e.g., a `maintain` shape reaching Capture) is a Category 2 error ([error-handling.md](../../error-handling.md)).

## Example (explicit author)

```yaml
type: learn-input
timestamp: 2026-08-08T09:00:00Z
source: user
status: complete
interactionMode: smart
shape: explicit
explicit:
  type: decision
  text: "Use pnpm over npm when both lockfiles exist; prefer the packageManager field lock for invocations"
goals: null
constraints: null
references: null
```

## Example (candidate curation)

```yaml
type: learn-input
timestamp: 2026-08-08T09:05:00Z
source: user
status: complete
interactionMode: detailed
shape: candidate
candidate:
  ref: "2026-07-10-001-review"      # a Work review-id with a learnings-to-capture list
```

## Example (maintain)

```yaml
type: learn-input
timestamp: 2026-08-08T09:10:00Z
source: user
status: complete
interactionMode: smart
shape: maintain
maintain:
  run: true
```

## Notes

- The Orchestrator's Pre-Flight Check ensures `docs/learn/`, `docs/learn/.{capture,refine,index,maintain}/` exist, and seeds `docs/learn/index.md` if missing (self-healing via `mkdir -p`), before routing the artifact.
- `interactionMode` flows from this artifact into every downstream artifact (Capture → Refine → Index for authoring; straight to Maintain otherwise); the orchestrator quality gate #2 cross-checks it is identical across the authoring chain (Maintain carries it standalone).
- The shape **determines the route**, not just the allocation: a `maintain` shape never reaches Capture, Refine, or Index. The phase ids reflect this — `maintain-id` is standalone (no `learn-id` umbrella) per [id-generation.md](../../id-generation.md).