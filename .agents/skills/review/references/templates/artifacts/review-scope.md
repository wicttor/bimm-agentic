---
title: Review Scope Artifact
description: Template for the Review Scope Artifact produced by the Scope phase. Carries the resolved change boundary (required files with status + context callers + attribution), the requirements source and parsed spec-content, the preliminary scope-creep check, related learnings, and the allocated review-id umbrella; consumed by Prepare.
type: template
version: 1.0
timestamp: "2026-08-08"
---

# Review Scope Artifact

The product of the **Scope** phase is a resolved Review Scope: a concrete **change boundary** (`required` files with status, an optional `context` list, an `attribution`/`diff-source`), the resolved **requirements source** (and parsed `spec-content` when present), the **preliminary scope-creep** check, related learnings, and the allocated **`review-id` umbrella** (Scope is the allocating phase). Prepare consumes it.

## Schema

```yaml
scope-id: YYYY-MM-DD-NNN-scope
review-id: YYYY-MM-DD-NNN                 # umbrella id, allocated here, carried through all 4 artifacts
input-shape: change-set | work-linked | ad-hoc
interactionMode: detailed | smart | autopilot
status: complete
timestamp: ISO-8601 timestamp

change-boundary:
  required:
    - path: "src/lib/redis-client.ts"
      status: added | modified | deleted | renamed
      renamed-from: "<old path>"          # only for renamed
      tentative: false | true             # true only for work-linked blocked/skipped-task files
  context:
    - path: "src/api/session.ts"
      role: "caller of redis-client.connect()"
  attribution: commits | working-tree | task-files | current-contents
  empty: false                            # true when a spec parses but touches no files
  diff-source: "<base>..<head>" | working-tree | working-tree-fallback | current-contents

requirements-source:
  type: plan-id | task-criterion | spec-doc | none
  path: "<repo-relative path> | none"
  spec-content:                            # only when type != none
    - criterion: "C1: <short criterion>"
      expected-behavior:
        - "<observable behavior>"
        - "<observable behavior>"

preliminary-scope-creep: [ { file, candidate-reason } ] | none | "skipped (no requirements)"

related-learnings:                         # scoped to the change boundary (whole review, not per file)
  - "docs/learn/XXX.md — [1-line applicability note]"

learning-gaps:
  - gap_name: "[Domain] — [what's missing]"
    domain: [primary domain]
    relevance: why this matters for the review
    suggested_action: "Research external resource" | "Document post-review"

work-id: YYYY-MM-DD-NNN | null             # work-linked only, for the index cross-link; null otherwise
```

Also save the Review Scope to `docs/review/.scope/<scope-id>.md`.

## Validation Rules

- **scope-id:** Required. Format `YYYY-MM-DD-NNN-scope`.
- **review-id:** Required. Allocated by Scope (umbrella); format `YYYY-MM-DD-NNN`. For work-linked, **distinct from** any Work `review-id` (the two skills' artifacts are independent; `work-id` is carried separately here).
- **input-shape:** Required. One of `change-set`, `work-linked`, `ad-hoc`.
- **interactionMode:** Required, propagated from the Review Input Artifact.
- **status:** Required. `complete`.
- **change-boundary.required:** Required (may be empty only when `empty: true`). Each entry has a repo-relative `path` and a `status`; `renamed-from` only for `renamed`; `tentative: true` only for work-linked blocked/skipped-task files.
- **change-boundary.context:** Required (may be empty). Separated from `required`; each entry has a repo-relative `path` and a one-line `role`.
- **change-boundary.attribution & diff-source:** Required and consistent (`commits` ⇄ real range; `current-contents` ⇄ `current-contents`).
- **change-boundary.empty:** Required. `true` is accepted (nothing-to-review; Prepare/Analyze/Report carry the empty outcome through); never silently empty.
- **requirements-source.type:** Required. One of `plan-id`, `task-criterion`, `spec-doc`, `none`.
- **spec-content:** Required present when `type != none` (a structured list); omitted/empty when `type: none`.
- **preliminary-scope-creep:** Required. A list, `none`, or `skipped (no requirements)` — the last only when `requirements-source.type: none`.
- **related-learnings:** Required (may be empty). References `docs/learn/index.md` entries.
- **learning-gaps:** Required (may be empty).
- **work-id:** Required (= the `work-id`) for work-linked input; `null` otherwise.

## Example (change-set, with requirements)

```yaml
scope-id: 2026-08-08-001-scope
review-id: 2026-08-08-001
input-shape: change-set
interactionMode: smart
status: complete
timestamp: 2026-08-08T14:30:00Z
change-boundary:
  required:
    - { path: "src/lib/redis-client.ts", status: added, tentative: false }
    - { path: "src/lib/session-store.ts", status: modified, tentative: false }
  context:
    - { path: "src/api/session.ts", role: "caller of session-store.get()" }
  attribution: commits
  empty: false
  diff-source: "main..feature/redis-session"
requirements-source:
  type: plan-id
  path: "docs/plans/2026-07-10-001-redis-session-store.md"
  spec-content:
    - criterion: "C1: Redis client connects with retry"
      expected-behavior:
        - "connect() reads REDIS_URL"
        - "connect() retries up to 3 times on connection failure"
    - criterion: "C2: SessionStore exports get/save/delete"
      expected-behavior:
        - "get(key) returns the stored value or null"
preliminary-scope-creep: none
related-learnings:
  - "docs/learn/pattern/redis-retry-2026-07-02.md — connection retry pattern applies"
learning-gaps: []
work-id: null
```

## Example (work-linked, no requirements ref)

```yaml
scope-id: 2026-08-08-002-scope
review-id: 2026-08-08-002
input-shape: work-linked
interactionMode: detailed
status: complete
timestamp: 2026-08-08T15:00:00Z
change-boundary:
  required:
    - { path: "src/lib/redis-config.ts", status: added, tentative: false }
    - { path: "src/lib/redis-client.ts", status: modified, tentative: true }
  context: []
  attribution: task-files
  empty: false
  diff-source: working-tree-fallback
requirements-source:
  type: none
  path: none
preliminary-scope-creep: "skipped (no requirements)"
related-learnings: []
learning-gaps: []
work-id: 2026-07-10-001
```

## Notes

- Scope is the **allocating phase** for the `review-id` umbrella; Prepare/Analyze/Report inherit it. The `review-id` shares the scope counter's NNN (see [id-generation.md](../../id-generation.md)).
- `required` vs `context` is a hard separation: Analyze files findings only against `required` files; `context` is reviewer aid.
- `requirements-source.type: none` is a legitimate input (the scope-creep category is skipped with a recorded note) — not an error (see [error-handling.md](../../error-handling.md)).
- `tentative: true` flags work-linked blocked/skipped-task files so Analyze treats their findings with the note that the file may be partial.