---
title: Review Kit Artifact
description: Template for the Review Kit Artifact produced by the Prepare phase. Carries the gathered diffs/hunks for the change boundary, the enriched context callers, the resolved spec-content, the derived test context (runner + per-file covering tests + ships-own-tests), and the static-analysis tool inventory; consumed by Analyze.
type: template
version: 1.0
timestamp: "2026-08-08"
---

# Review Kit Artifact

The product of the **Prepare** phase is a Review Kit: the gathered **diffs/hunks** for the change boundary's `required` files (with the enriched `context` callers/importers), the resolved **spec-content** (when `requirements-source` is not `none`), the derived **test context** (test runner + per-file covering tests + whether the change ships its own tests), and the **tool inventory** (linters / type-checkers / test runner). Analyze consumes it. Prepare gathers materials; it does not run the analysis.

## Schema

```yaml
prepare-id: YYYY-MM-DD-NNN-prepare
scope-id: YYYY-MM-DD-NNN-scope
review-id: YYYY-MM-DD-NNN
input-shape: change-set | work-linked | ad-hoc
interactionMode: detailed | smart | autopilot
status: complete
timestamp: ISO-8601 timestamp

diffs: none |                    # "none" when change-boundary.empty was true
  - path: "src/lib/redis-client.ts"
    status: added | modified | deleted | renamed
    renamed-from: "<old path>"   # only for renamed
    tentative: false | true      # carried from the change boundary
    added-lines: N
    removed-lines: M
    hunks:                        # omitted for `current-contents` attribution / deleted files
      - { start: <line>, body: "<hunk text>" }
    diff-source: "<base>..<head>" | working-tree | working-tree-fallback | current-contents

context:                           # enriched from Scope's seed — callers/importers
  - path: "src/api/session.ts"
    role: "caller of redis-client.connect()"

spec-content: none |               # "none" when requirements-source.type == none
  - criterion: "C1: <short criterion>"
    expected-behavior:
      - "<observable behavior>"

test-context:
  test-runner: npm | pnpm | pytest | go | cargo | rspec | phpunit | mvn | gradle | unknown
  package-manager: npm | pnpm | null   # Node.js only; null otherwise
  per-changed-file:
    - path: "src/lib/redis-client.ts"
      covering-tests: [ "src/lib/redis-client.test.ts" ]   # may be empty
      ships-own-tests: true | false    # true if a test file appears in the required (added/modified) set covering this file
  change-ships-tests: true | false    # true if ANY test file is in the required set

tool-inventory:
  linters:
    - { name: "eslint", command: "npx eslint", configured: true }
  type-checkers:
    - { name: "tsc", command: "npx tsc --noEmit", configured: true }
  test-runner-present: true | false   # whether a runner was detected (echoes test-runner != unknown)

work-id: YYYY-MM-DD-NNN | null    # work-linked only; null otherwise
```

Also save the Review Kit to `docs/review/.prepare/<prepare-id>.md`.

## Validation Rules

- **prepare-id:** Required. Format `YYYY-MM-DD-NNN-prepare`.
- **scope-id, review-id, input-shape:** Required, inherited from Scope (cross-phase consistency).
- **interactionMode:** Required, identical to the Scope artifact.
- **diffs:** Required. `none` only when the change boundary was `empty: true`; otherwise one entry per `required` file. Each entry has a repo-relative `path`, a `status`, `added-lines`/`removed-lines` counts, and `hunks` (omitted for `current-contents`/deleted); `diff-source` matches the boundary's attribution.
- **context:** Required (may be empty). Enriched from Scope's seed; each entry repo-relative with a one-line `role`.
- **spec-content:** Required. `none` when `requirements-source.type: none`; otherwise the structured criteria list (so Analyze skips the scope-creep category deterministically).
- **test-context.test-runner:** Required (may be `unknown` if undetected). Informs the tests category; not an authoritative gate.
- **test-context.per-changed-file:** Required. One entry per changed file with `covering-tests` (may be empty) and `ships-own-tests`. A production-code file with `covering-tests: []` and `ships-own-tests: false` is a Prepare Smart pause trigger (test-gap).
- **test-context.change-ships-tests:** Required. `true` if any test file is in the `required` set.
- **tool-inventory:** Required (each list may be empty). Each tool has a `configured` flag. An all-empty inventory is a Prepare Smart pause trigger (warn, do not block).
- **work-id:** Required for work-linked input; `null` otherwise.
- **status:** Required. `complete`.

## Example (change-set, with requirements)

```yaml
prepare-id: 2026-08-08-001-prepare
scope-id: 2026-08-08-001-scope
review-id: 2026-08-08-001
input-shape: change-set
interactionMode: smart
status: complete
timestamp: 2026-08-08T14:35:00Z
diffs:
  - path: "src/lib/redis-client.ts"
    status: added
    tentative: false
    added-lines: 64
    removed-lines: 0
    hunks:
      - { start: 1, body: "+export function connect(url: string) { ... }" }
    diff-source: "main..feature/redis-session"
  - path: "src/lib/session-store.ts"
    status: modified
    tentative: false
    added-lines: 12
    removed-lines: 4
    hunks:
      - { start: 22, body: " ... get/save/delete ..." }
    diff-source: "main..feature/redis-session"
context:
  - { path: "src/api/session.ts", role: "caller of session-store.get()" }
spec-content:
  - criterion: "C1: Redis client connects with retry"
    expected-behavior:
      - "connect() reads REDIS_URL"
      - "connect() retries up to 3 times on connection failure"
test-context:
  test-runner: pnpm
  package-manager: pnpm
  per-changed-file:
    - { path: "src/lib/redis-client.ts", covering-tests: ["src/lib/redis-client.test.ts"], ships-own-tests: true }
    - { path: "src/lib/session-store.ts", covering-tests: [], ships-own-tests: false }
  change-ships-tests: true
tool-inventory:
  linters:
    - { name: "eslint", command: "npx eslint", configured: true }
  type-checkers:
    - { name: "tsc", command: "npx tsc --noEmit", configured: true }
  test-runner-present: true
work-id: null
```

## Notes

- The orchestrator's quality gate #2 cross-checks `interactionMode` is identical across Scope/Prepare/Analyze/Report artifacts.
- `spec: none` (from `requirements-source.type: none`) propagates deterministically so Analyze skips the scope-creep category — Prepare does not guess requirements.
- `test-context.covering-tests: []` with `ships-own-tests: false` is the test-gap signal Analyze elevates to a `tests`-category finding (often `major` per [severity-rubric.md](../../severity-rubric.md)).
- Tools are **corroborative only**; Prepare inventories them but does not run them. Analyze may run a tool to corroborate a finding, never to create one outside the change boundary.