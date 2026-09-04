---
title: Review Report Artifact
description: Template for the Review Report Artifact produced by the Report phase. Carries the approval status (approved / changes-requested / rejected) with rationale, the findings rollup (counts by severity and by category), non-binding recommendations, the scope-creep summary, learnings-to-capture for /learn, and the registry/work-index registration state. The Review skill's final deliverable.
type: template
version: 1.0
timestamp: "2026-08-08"
---

# Review Report Artifact

The product of the **Report** phase is the Review Report — the Review skill's final deliverable. It records the **approval status** (`approved` / `changes-requested` / `rejected`) derived deterministically from the Findings tallies per [approval-criteria.md](../../approval-criteria.md), with a one-line rationale tied to the counts; the findings rollup (by severity and by category); non-binding **recommendations**; the **scope-creep summary**; **learnings-to-capture** candidates (handed to `/learn`); and the registration state. A registry row is appended to `docs/review/index.md` always; for work-linked input, a distinct `## Review Report — <report-id>` block is appended to `docs/tasks/<work-id>/index.md`.

## Schema

```yaml
report-id: YYYY-MM-DD-NNN-report
analyze-id: YYYY-MM-DD-NNN-analyze
prepare-id: YYYY-MM-DD-NNN-prepare
scope-id: YYYY-MM-DD-NNN-scope
review-id: YYYY-MM-DD-NNN
input-shape: change-set | work-linked | ad-hoc
interactionMode: detailed | smart | autopilot
status: complete
timestamp: ISO-8601 timestamp

approval-status: approved | changes-requested | rejected
rationale: "[one-line, tied to the driving counts]"

findings-rollup:
  by-severity: { blocker: <N>, major: <N>, minor: <N>, nit: <N> }
  by-category: { quality: <N>, security: <N>, tests: <N>, documentation: <N>, integration: <N>, scope-creep: <N> }
  total: <N>

recommendations:
  blocking: [ "F<NN> @ <location>: <action>"          # for changes-requested/rejected — actionable blocker/major fixes
            | null ]
  polish: [ "F<NN> @ <location>: <optional improvement>"    # for approved (minor/nit) suggestions
          | null ]

scope-creep-summary: none | "<count> finding(s)" | "skipped (no requirements)"

learnings-to-capture:
  - title: "[working title]"
    domain: [primary domain]
    source: { finding-id }            # the finding id where this surfaced
    summary: "[1-2 sentence summary]"
    type: confirmed-pattern | refuted-assumption | gotcha | forced-decision

learning-gaps:
  - gap_name: "[Domain] — [what's missing]"
    domain: [primary domain]
    suggested_action: "Research external resource" | "Document post-review"

work-id: YYYY-MM-DD-NNN | null          # work-linked only; null otherwise

registration:
  registry-row-appended: true          # appended to docs/review/index.md (idempotent on report-id)
  work-index-block-appended: true | skipped   # work-linked only; skipped if the work index is missing
```

Also save the Review Report to `docs/review/.report/<report-id>.md`.

## Closing Blocks

### Registry row (appended to `docs/review/index.md`, always)

```
- <report-id> — <target-summary> — <approval-status> — docs/review/.report/<report-id>.md
```

### Work-index block (appended to `docs/tasks/<work-id>/index.md`, work-linked only)

```markdown
## Review Report — <report-id>

- **Status:** approved | changes-requested | rejected
- **Findings:** <blocker> blocker, <major> major, <minor> minor, <nit> nit
- **Scope creep:** none | <count> | skipped (no requirements)
- **Learnings to capture:** <count> (run `/learn` to persist)
- **Review Report:** docs/review/.report/<report-id>.md
```

Both the registry row and the work-index block are **append-only** and **idempotent on `report-id`**: a re-run overwrites the entry with the same id, never duplicates it. The work-index block is deliberately distinct from Work's own `## Work Report — <review-id>` block (different label, different skill, different `report-id`).

## Validation Rules

- **report-id:** Required. Format `YYYY-MM-DD-NNN-report`.
- **analyze-id, prepare-id, scope-id, review-id, input-shape:** Required, inherited (cross-phase consistency).
- **interactionMode:** Required, identical across Prepare/Analyze/Report (orchestrator quality gate #2).
- **approval-status:** Required. One of `approved`, `changes-requested`, `rejected`, derived per [approval-criteria.md](../../approval-criteria.md) (the derivation is non-discretionary: `rejected` iff blocker ≥ 1; `changes-requested` iff no blocker and (major ≥ 1 or scope-creep present); `approved` otherwise).
- **rationale:** Required. One line surfacing the driving counts.
- **findings-rollup:** Required. Counts by severity and by category must match the Findings artifact's tallies.
- **recommendations:** Required. `blocking` populated for `changes-requested`/`rejected` (actionable blocker/major fixes); `polish` populated for `approved` (minor/nit). Either list may be empty (e.g. a genuinely clean approved review has `blocking: null`, `polish: []`).
- **scope-creep-summary:** Required. `none`, `"<count> finding(s)"`, or `skipped (no requirements)` (consistent with the Findings `scope-creep-ran`).
- **learnings-to-capture:** Required (may be empty). Each candidate has title/domain/source/summary/type. Review does not write `docs/learn/` directly — these are handed to `/learn`.
- **learning-gaps:** Required (may be empty).
- **work-id:** Required for work-linked input (and the work-index block is then expected); `null` otherwise (and the work-index block is `skipped`).
- **registration.registry-row-appended:** Required, must be `true`.
- **registration.work-index-block-appended:** Required for work-linked input (`true` or `skipped`); `skipped` for other input.
- **status:** Required. `complete`.

## Example (changes-requested — two majors, one scope-creep)

```yaml
report-id: 2026-08-08-001-report
analyze-id: 2026-08-08-001-analyze
prepare-id: 2026-08-08-001-prepare
scope-id: 2026-08-08-001-scope
review-id: 2026-08-08-001
input-shape: change-set
interactionMode: smart
status: complete
timestamp: 2026-08-08T15:45:00Z
approval-status: changes-requested
rationale: "2 major finding(s) and 1 scope-creep finding(s); no blocker"
findings-rollup:
  by-severity: { blocker: 0, major: 2, minor: 1, nit: 0 }
  by-category: { quality: 1, security: 0, tests: 1, documentation: 0, integration: 0, scope-creep: 1 }
  total: 3
recommendations:
  blocking:
    - "F01 @ src/lib/session-store.ts:22: Add tests for get/save/delete per C2"
    - "F02 @ src/lib/cache.ts:hunk-1: Split the cache layer off into its own task or roll back"
  polish:
    - "F03 @ src/lib/redis-client.ts:42: Extract MAX_RETRIES constant"
scope-creep-summary: "1 finding(s)"
learnings-to-capture:
  - title: "TTL cache layers tend to creep into session-store changes — split before estimating"
    domain: data-storage
    source: { finding-id: F02 }
    summary: "Scope-creep finding F02 recurred; confirming the pattern of cache layers bundling into session work."
    type: confirmed-pattern
learning-gaps: []
work-id: null
registration:
  registry-row-appended: true
  work-index-block-appended: skipped
```

## Example (approved — clean review)

```yaml
report-id: 2026-08-08-002-report
analyze-id: 2026-08-08-002-analyze
prepare-id: 2026-08-08-002-prepare
scope-id: 2026-08-08-002-scope
review-id: 2026-08-08-002
input-shape: ad-hoc
interactionMode: autopilot
status: complete
timestamp: 2026-08-08T15:50:00Z
approval-status: approved
rationale: "no blocker, no major, no scope-creep (0 minor, 0 nit)"
findings-rollup:
  by-severity: { blocker: 0, major: 0, minor: 0, nit: 0 }
  by-category: { quality: 0, security: 0, tests: 0, documentation: 0, integration: 0, scope-creep: 0 }
  total: 0
recommendations:
  blocking: null
  polish: []
scope-creep-summary: "skipped (no requirements)"
learnings-to-capture: []
learning-gaps: []
work-id: null
registration:
  registry-row-appended: true
  work-index-block-appended: skipped
```

## Notes

- The Review Report is the primary deliverable of the Review skill. The Orchestrator marks the workflow complete and may chain to `/learn` when `learnings-to-capture` is non-empty.
- Approval is **non-discretionary**: the same tallies always produce the same status. Reviewer judgment lives in finding severities and the scope-creep flag, not in the approval derivation (see [approval-criteria.md](../../approval-criteria.md)).
- **No GitHub sync:** this skill does not post comments/reviews/labels. The registry row + (work-linked) work-index block are the only outbound writes — both local, both on disk.
- For work-linked input, Review's `approval-status` is **independent** of Work's own `work-state`; the two verdicts coexist (the `## Review Report` block sits next to Work's `## Work Report` block).