---
title: Findings Artifact
description: Template for the Findings Artifact produced by the Analyze phase. Carries the per-finding list (severity + category + repo-relative location + message + a requirement trace OR a scope-creep flag + optional non-binding suggested-fix + optional tool corroboration), the per-category and per-severity tallies, and the scope-creep-ran flag; consumed by Report.
type: template
version: 1.0
timestamp: "2026-08-08"
---

# Findings Artifact

The product of the **Analyze** phase is the Findings set: a per-finding list where each finding carries a **severity** (`blocker` / `major` / `minor` / `nit`), a **category** (`quality` / `security` / `tests` / `documentation` / `integration` / `scope-creep`), a repository-relative **location**, a `message`, and **either** a **requirement `trace`** **or** a **`scope-creep: true`** flag (orchestrator quality gate #5), plus aggregator tallies. Report consumes it.

## Schema

```yaml
analyze-id: YYYY-MM-DD-NNN-analyze
prepare-id: YYYY-MM-DD-NNN-prepare
scope-id: YYYY-MM-DD-NNN-scope
review-id: YYYY-MM-DD-NNN
input-shape: change-set | work-linked | ad-hoc
interactionMode: detailed | smart | autopilot
status: complete
timestamp: ISO-8601 timestamp

findings: [] |                         # empty list when the review was clean or nothing-to-review
  - id: F01
    severity: blocker | major | minor | nit
    category: quality | security | tests | documentation | integration | scope-creep
    location: "src/lib/redis-client.ts:42" | "src/lib/redis-client.ts:hunk-2"   # repository-relative
    message: "[1-2 sentence description of the issue]"
    trace: "C1" | "general-quality" | "no-requirements"   # present when in-scope (NOT scope-creep)
    scope-creep: true | false         # opposite of trace: a finding with scope-creep: true carries NO trace
    suggested-fix: "[non-binding suggestion; Review is read-only]"   # optional
    corroborated-by: "eslint rule @typescript-eslint/no-explicit-any" | null   # optional; tool evidence
    tentative-file: false | true      # echoes the boundary's tentative flag (work-linked blocked/skipped file)

tallies:
  by-severity:
    blocker: <N>
    major: <N>
    minor: <N>
    nit: <N>
  by-category:
    quality: <N>
    security: <N>
    tests: <N>
    documentation: <N>
    integration: <N>
    scope-creep: <N>

scope-creep-ran: true | "skipped (no requirements)"   # false only via the skipped string; never silently absent

work-id: YYYY-MM-DD-NNN | null          # work-linked only; null otherwise
```

Also save the Findings to `docs/review/.analyze/<analyze-id>.md`.

## Validation Rules

- **analyze-id:** Required. Format `YYYY-MM-DD-NNN-analyze`.
- **prepare-id, scope-id, review-id, input-shape:** Required, inherited (cross-phase consistency).
- **interactionMode:** Required, identical to the upstream artifacts.
- **findings:** Required (may be empty — a clean review or nothing-to-review). Each finding must carry:
  - `id` unique within this set (`F01`, `F02`, …)
  - `severity` one of `blocker`/`major`/`minor`/`nit` (per [severity-rubric.md](../../severity-rubric.md))
  - `category` one of the six (per [review-categories.md](../../review-categories.md))
  - `location` repository-relative (`file:line` or `file:hunk`)
  - `message` (1–2 sentences)
  - **exactly one of** `trace` **or** `scope-creep: true` (findings coherence, orchestrator gate #5). A `trace: no-requirements` is used for non-creep findings when `spec-content: none`. A `scope-creep: true` finding carries **no** `trace`.
  - `suggested-fix` and `corroborated-by` optional (suggested-fix is non-binding — Review is read-only)
  - `tentative-file` echoes the boundary's `tentative` flag for work-linked blocked/skipped files
- **tallies.by-severity / by-category:** Required. Counts must match the findings list exactly.
- **scope-creep-ran:** Required. `true` only when the scope-creep category actually ran (i.e., `spec-content` was present); otherwise `skipped (no requirements)`. Never silently `false`-absent.
- **work-id:** Required for work-linked input; `null` otherwise.
- **status:** Required. `complete`.

## Example (mixed severities, one scope-creep finding)

```yaml
analyze-id: 2026-08-08-001-analyze
prepare-id: 2026-08-08-001-prepare
scope-id: 2026-08-08-001-scope
review-id: 2026-08-08-001
input-shape: change-set
interactionMode: smart
status: complete
timestamp: 2026-08-08T15:00:00Z
findings:
  - id: F01
    severity: major
    category: tests
    location: "src/lib/session-store.ts:22"
    message: "Production-code change to get/save/delete ships no test for the new behavior."
    trace: C2
    scope-creep: false
    suggested-fix: "Add session-store.test.ts covering get/save/delete per C2."
    corroborated-by: null
    tentative-file: false
  - id: F02
    severity: major
    category: scope-creep
    location: "src/lib/cache.ts:hunk-1"
    message: "Adds a new TTL cache layer beyond C1/C2; no requirement it serves."
    trace: null
    scope-creep: true
    suggested-fix: "Split the cache layer into its own task with its own AC, or roll back here."
    corroborated-by: null
    tentative-file: false
  - id: F03
    severity: minor
    category: quality
    location: "src/lib/redis-client.ts:42"
    message: "Magic number 3 for retry count; extract to a named constant."
    trace: C1
    scope-creep: false
    suggested-fix: "const MAX_RETRIES = 3;"
    corroborated-by: null
    tentative-file: false
tallies:
  by-severity: { blocker: 0, major: 2, minor: 1, nit: 0 }
  by-category: { quality: 1, security: 0, tests: 1, documentation: 0, integration: 0, scope-creep: 1 }
scope-creep-ran: true
work-id: null
```

## Example (ad-hoc, no requirements — scope-creep skipped)

```yaml
analyze-id: 2026-08-08-002-analyze
prepare-id: 2026-08-08-002-prepare
scope-id: 2026-08-08-002-scope
review-id: 2026-08-08-002
input-shape: ad-hoc
interactionMode: autopilot
status: complete
timestamp: 2026-08-08T15:30:00Z
findings:
  - id: F01
    severity: nit
    category: documentation
    location: "src/auth/session.ts:8"
    message: "Public export lacks a docstring."
    trace: no-requirements
    scope-creep: false
    suggested-fix: null
    corroborated-by: null
    tentative-file: false
tallies:
  by-severity: { blocker: 0, major: 0, minor: 0, nit: 1 }
  by-category: { quality: 0, security: 0, tests: 0, documentation: 1, integration: 0, scope-creep: 0 }
scope-creep-ran: "skipped (no requirements)"
work-id: null
```

## Notes

- **Findings coherence** (orchestrator gate #5): every finding has a `severity`, a `category`, a repo-relative `location`, and **exactly one of** `trace` / `scope-creep: true`. Report refuses a Findings set that violates this (Category 2 recovery — re-run Analyze).
- `trace: no-requirements` is the correct trace for any non-creep finding when `spec-content: none` (scope-creep cannot be assessed; never set `scope-creep: true` without a spec).
- `suggested-fix` is **non-binding** — Review is read-only; the user turns it into a follow-up `/plan` + `/work` or a manual edit, never applied inline.
- `corroborated-by` records tool evidence; tools corroborate, never create findings outside the change boundary (see [severity-rubric.md](../../severity-rubric.md)).
- `scope-creep-ran` must be `skipped (no requirements)` exactly when `spec-content` was `none`; the tallies `scope-creep: 0` in that case is consistent (no creep findings emitted).