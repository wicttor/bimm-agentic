---
id: 2026-09-05-001-T06
title: "Widen the plan schema without splitting it from the validator"
plan-id: 2026-09-05-001
unit: U4
tier: deep
status: completed
priority: P1
dependencies: [2026-09-05-001-T04]
files:
  create: []
  modify:
    - agent/src/prompts/planner.ts
    - agent/src/plan-schema.ts
    - agent/src/plan.ts
    - agent/tests/prompts.test.ts
    - agent/tests/plan.test.ts
  test:
    - agent/tests/prompts.test.ts
estimated-effort: "1 hour 30 minutes"
timestamp: 2026-09-05T16:40:00Z
---

# Widen the plan schema without splitting it from the validator

## Goal

Task artifacts need a criterion, one test file and three steps; the generator needs the original
four keys; and neither set may be validated by a hand-copied list of field names.

## Acceptance Criterion

`TASK_PLAN_JSON_SCHEMA` keeps `file`/`purpose`/`dependsOn`/`exports` as its entire required set, declares the Tasks-phase keys as optional, opts into `additionalProperties`, and `validateTaskPlan` type-checks exactly the declared keys off that same object — so the advertised and accepted shapes cannot diverge

## Steps

1. **Red — Write the failing test:** update `agent/tests/prompts.test.ts`: assert the required set is unchanged, the full property set is the four plus `title`,`unit`,`acceptanceCriterion`,`testFile`,`steps`,`priority`,`effort`, that a fully-populated task and a task with an unknown extra key both validate, and that `steps: "red"` does not. Confirm the failures.
2. **Green — Implement:** add the optional keys to the schema, set `additionalProperties: true`, and rewrite `validateTaskPlan` to loop over `TASK_PLAN_JSON_SCHEMA.properties` instead of naming fields; carry the new fields through `Task` and `normalizeTask` in `plan.ts`.
3. **Refactor:** keep the four required keys' error strings byte-identical (`file: must be a string`, `dependsOn[0]: must be a string`) so `plan.ts`'s re-ask messages and existing tests stay meaningful.

## Test Scenarios

- Back-compat: 4-key task -> valid, `plan()` returns 2 tasks unchanged
- Wider answer: all optional keys present -> valid and preserved on `Task`
- Unknown key -> valid (information, not a defect)
- Type violation: `steps: "red"` -> invalid with a named error, one re-ask

## Acceptance Criteria

- [x] `TASK_PLAN_JSON_SCHEMA` keeps `file`/`purpose`/`dependsOn`/`exports` as its entire required set, declares the Tasks-phase keys as optional, opts into `additionalProperties`, and `validateTaskPlan` type-checks exactly the declared keys off that same object

## Dependencies

- 2026-09-05-001-T04: the planner prompt is where the optional keys are advertised

## Notes

- `normalizeTask` copies optional fields only when present, so a bare 4-key plan stays distinguishable from one the model annotated — the artifact renderer's fallbacks depend on that difference.
