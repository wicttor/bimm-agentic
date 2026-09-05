---
id: 2026-09-05-001-T07
title: "Render the final plan document deterministically"
plan-id: 2026-09-05-001
unit: U5
tier: deep
status: completed
priority: P1
dependencies: [2026-09-05-001-T06]
files:
  create:
    - agent/src/plan-artifacts.ts
  modify:
    - agent/tests/plan-artifacts.test.ts
  test:
    - agent/tests/plan-artifacts.test.ts
estimated-effort: "3 hours"
timestamp: 2026-09-05T16:40:00Z
---

# Render the final plan document deterministically

## Goal

The plan document is the run's durable record; nothing in it may disagree with the task list, so it
is rendered from that list rather than written by the model.

## Acceptance Criterion

`writePlanArtifacts` writes `docs/plans/<plan-id>-<slug>.md` carrying every field in the plan skill's `plan` field list, a High-Level Technical Design rendered from the task graph, Implementation Units grouped into phases by dependency depth, and a Risk Analysis derived from the plan's own observable gaps

## Steps

1. **Red — Write the failing test:** create `agent/tests/plan-artifacts.test.ts` asserting the frontmatter field list, `phases-inlined: scope, research, design`, `interactionMode: autopilot`, the four required sections, `T01 --> T02` mermaid edges, phase grouping, and that the risk table names how many tasks lacked a criterion or a test file. Confirm failures.
2. **Green — Implement:** implement `renderFinalPlan` with `selectTier`, `dependencyDepth`, `derivePlanTitle`, `deriveOverview`, `renderMermaid`, `renderUnits` and `renderRisks`; keep it free of LLM calls.
3. **Refactor:** express tier selection exactly as `references/plan-tier-selection.md` does (complexity sets the base, risk only raises it) and name the risk-floor branch in a comment.

## Test Scenarios

- Frontmatter: all 15 required keys present, `interactionMode: autopilot`
- Graph: mermaid block contains one edge per resolved dependency
- Phases: a 3-deep chain produces Phase 1/2/3 units
- Honest gaps: 2 tasks without a criterion -> the plan says `2 task(s) planned without an explicit Acceptance Criterion`
- Empty plan -> `{ ok: false }` and nothing written

## Acceptance Criteria

- [x] `writePlanArtifacts` writes `docs/plans/<plan-id>-<slug>.md` carrying every field in the plan skill's `plan` field list, a High-Level Technical Design rendered from the task graph, Implementation Units grouped into phases by dependency depth, and a Risk Analysis derived from the plan's own observable gaps

## Dependencies

- 2026-09-05-001-T06: the renderer consumes the widened `Task` type

## Notes

- `phases-inlined` exists because the plan skill's field list requires `scope-id`/`research-id`/`design-id`: they carry the plan-id, and the extra key says why no files exist for them.
- Related Approaches in the plan record why there is no second LLM call for this document.
