---
id: 2026-09-05-004-T04
title: "Planner prompt carries the inventory so tasks target existing structure"
plan-id: 2026-09-05-004
unit: U2b
tier: deep
status: completed
priority: P0
dependencies:
  - 2026-09-05-004-T03
files:
  create: []
  modify:
    - agent/src/planner/index.ts
  test:
    - agent/src/planner/index.test.ts
estimated-effort: "2 hours"
timestamp: "2026-09-04T09:05:00-04:00"
---

# Planner prompt carries the inventory so tasks target existing structure

## Goal

Feed the same boilerplate module inventory (from T03's builder) into the planner prompt so planned tasks declare `src/App.tsx` modifications and `src/hooks/` + `src/components/` creations that reuse existing modules, instead of planning new configuration or data-layer files.

## Acceptance Criterion

The planner prompt (as built by `planSpec`'s prompt construction) contains the module inventory paths and document names, and an instruction that tasks must MODIFY `src/App.tsx` and CREATE feature files under `src/hooks/`/`src/components/` importing existing modules rather than recreating `graphql/`, `mocks/`, or config files.

## Steps

1. **Red — Write the failing test:** in `agent/src/planner/index.test.ts`, stub the LLM (existing pattern) and capture the prompt sent to `completeJson`; assert it contains the inventory substrings (paths + GetCars/AddCar) and the reuse directive. Confirm red.
2. **Green — Implement:** reuse T03's inventory builder in the planner's prompt assembly (same cwd source of truth). Keep task schema validation unchanged.
3. **Refactor:** confirm one inventory builder is shared by planner + codegen (no sibling-copy drift — learning `sibling-schema-copy-drops-validation-guards`).

## Test Scenarios

- planSpec with stub LLM -> captured prompt contains inventory paths, document names, and the modify-App/create-under-hooks directive
- No cwd (unit-level planner test) -> prompt still builds without the inventory section, no throw

## Acceptance Criteria

- [x] Planner prompt includes the module inventory and reuse directive; single shared inventory builder

## Dependencies

- 2026-09-05-004-T03: inventory builder must exist before planner consumes it

## Notes

- Mutation-certify (learning `mutation-check-ac-certifying-tests`): deleting the inventory splice must turn this test red — assert on content, not on call structure.
