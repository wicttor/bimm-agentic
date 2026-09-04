---
title: Work Report Artifact
description: Template for the Work Report produced by the Review phase. Carries the final task-outcome rollup, simplification/consolidation summary, regression check, scope-creep findings, learnings to capture, and work-state; appended to the task index as the closing status block.
type: template
version: 1.0
timestamp: "2026-08-07"
---

# Work Report Artifact

The product of the **Review** phase is the Work Report — the Work skill's final deliverable. It rolls up task outcomes, the simplification/consolidation summary, the regression check, scope-creep findings, learnings to capture (handed to `/learn`), and the final `work-state`. A closing `## Work Report — <review-id>` block is appended to `docs/tasks/<work-id>/index.md`.

## Schema

```yaml
review-id: YYYY-MM-DD-NNN-review
execute-id: YYYY-MM-DD-NNN-execute
prepare-id: YYYY-MM-DD-NNN-prepare
triage-id: YYYY-MM-DD-NNN-triage
work-id: YYYY-MM-DD-NNN
work-branch: work/<short-description> | null   # inherited from the Work Manifest
input-shape: plan-based | task-file | ad-hoc
interactionMode: detailed | smart | autopilot
executionMode: inline | serial | parallel
status: complete
timestamp: ISO-8601 timestamp

task-outcome-rollup:
  total: <N>
  completed: <N>
  for-review: <N>
  blocked: <N>
  skipped: <N>

gate-decision: "[summary of gate outcome; e.g., 'Gate passed: clean regression check, no scope creep' OR 'Gate blocked: regressions-found (3 new failures) + scope-creep in 2 files']"

simplification-summary: "[what was simplified/clipped across completed tasks' changed files]"
consolidations: "[shared logic extracted / abstractions introduced, or 'none']"

regression-check:
  state: clean | regressions-found
  failing-tests: [test-path or test-id, ...]   # present only when state == regressions-found
  baseline-state: green | snapshot-and-continue

scope-creep: none | [ { task-id, file, why-exceeds-ac } ]

learnings-to-capture:
  - title: "[working title]"
    domain: [primary domain]
    source: { task-id, gate }
    summary: "[1-2 sentence summary]"
    type: confirmed-pattern | refuted-assumption | gotcha | forced-decision

learning-gaps:
  - gap_name: "[Domain] — [what's missing]"
    domain: [primary domain]
    suggested_action: "Research external resource" | "Document post-implementation"

work-state: for-review | complete | partial | nothing-done

index-block-appended: true   # the ## Work Report — <review-id> block was appended to docs/tasks/<work-id>/index.md (idempotent on review-id)
```

Also save the Work Report to `docs/plans/.work/.review/<review-id>.md`.

## Closing Index Block (appended to docs/tasks/<work-id>/index.md)

```markdown
## Work Report — <review-id>

- **Status:** complete | partial | for-review | nothing-done
- **Work branch:** work/<short-description> | null
- **Tasks:** <completed>/<total> completed, <for-review> for-review, <blocked> blocked, <skipped> skipped
- **Gate decision:** [summary of regression/scope-creep gate outcome]
- **Regression check:** clean | regressions-found (<N>)
- **Scope creep:** none | <count> finding(s)
- **Learnings to capture:** <count> (run `/learn` to persist)
- **Work Report:** docs/plans/.work/.review/<review-id>.md
```

The block is **append-only** and **idempotent on `review-id`**: a re-run overwrites the block with the same `review-id`, never duplicates it.

## Validation Rules

- **review-id:** Required. Format `YYYY-MM-DD-NNN-review`.
- **execute-id, prepare-id, triage-id, work-id, work-branch, input-shape:** Required, inherited (cross-phase consistency).
- **interactionMode, executionMode:** Both required, identical across Prepare/Execute/Review (orchestrator quality gate #2).
- **task-outcome-rollup:** Required. Matches the Execution Log's aggregator counts. Now includes `for-review` count (new status).
- **gate-decision:** Required. Brief summary of the gate outcome (e.g., "Gate passed: clean regression check, no scope creep" OR "Gate blocked: regressions-found (3 failures) + scope-creep in 2 files").
- **simplification-summary, consolidations:** Required (consolidations may be `none`).
- **regression-check.state:** Required. `clean` or `regressions-found`; `failing-tests` present only when `regressions-found`. **Binary threshold**: any test failure = gate blocks.
- **scope-creep:** Required. `none` or a list of per-task findings. Any scope-creep = gate blocks.
- **learnings-to-capture:** Required (may be empty). Each candidate has title/domain/source/summary/type. Work does not write `docs/learn/` directly — these are handed to `/learn`.
- **learning-gaps:** Required (may be empty). Carries forward the Work Manifest's gaps plus any Review revealed.
- **work-state:** Required. `for-review` (gate blocked by regressions/scope-creep; tasks await Standalone Review approval) | `complete` (all tasks completed + gate passed) | `partial` (some blocked/skipped, gate passed for non-blocked) | `nothing-done` (empty run or all blocked early).
- **index-block-appended:** Required, must be `true`.
- **status:** Required. `complete`.

## Example (partial — one blocked task, regression-clean, scope-creep none)

```yaml
review-id: 2026-08-07-004-review
execute-id: 2026-08-07-003-execute
prepare-id: 2026-08-07-002-prepare
triage-id: 2026-08-07-001-triage
work-id: 2026-07-10-001
work-branch: work/redis-session-store
input-shape: plan-based
interactionMode: smart
executionMode: serial
status: complete
timestamp: 2026-08-07T15:45:00Z
task-outcome-rollup:
  total: 2
  completed: 1
  blocked: 1
  skipped: 0
simplification-summary: "Extracted shared retry config into src/lib/redis-config.ts (used by T01)."
consolidations: "src/lib/redis-config.ts (retry pattern shared; DRY)"
regression-check:
  state: clean
  failing-tests: []
  baseline-state: green
scope-creep: none
learnings-to-capture:
  - title: "Redis TTL must be propagated to the SET command, not just the key"
    domain: data-storage
    source: { task-id: 2026-07-10-001-T02a, gate: green }
    summary: "TTL test failed because TTL was set on the key separately; SET ... EX must carry the TTL."
    type: gotcha
learning-gaps:
  - gap_name: "Redis failover in production — no learning yet"
    domain: infrastructure
    suggested_action: "Document post-implementation"
work-state: partial
index-block-appended: true
```

## Notes

- The Work Report is the primary deliverable of the Work Skill. The Orchestrator marks the workflow complete and may chain to `/learn` when `learnings-to-capture` is non-empty.
- Task-status coherence is re-verified at Review Step 0 (the `task-outcome-rollup` must match the Execution Log and the task files / index).
- The closing index block lets a future `/work <work-id>` resume or a glance at `docs/tasks/<work-id>/index.md` show how the run ended without re-reading the Work Report file.
