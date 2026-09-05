---
id: 2026-09-05-001-T01
title: "Clear the pre-existing agent:typecheck failure"
plan-id: 2026-09-05-001
unit: U1
tier: deep
status: completed
priority: P0
dependencies: []
files:
  create: []
  modify:
    - agent/tests/generalization.test.ts
  test:
    - agent/tests/generalization.test.ts
estimated-effort: "10 minutes"
timestamp: 2026-09-05T16:40:00Z
---

# Clear the pre-existing agent:typecheck failure

## Goal

Every later change is measured against the agent sub-project's own gates, so the two unused-import
errors already on `main` have to go first.

## Acceptance Criterion

`npm run agent:typecheck` exits 0 — the unused `writeFileSync` and `join` imports in `agent/tests/generalization.test.ts` are removed

## Steps

1. **Red — Write the failing test:** run `npm run agent:typecheck` and confirm it fails with two `TS6133` unused-import errors naming `agent/tests/generalization.test.ts`.
2. **Green — Implement:** drop the two unused names from the import statements; touch nothing else.
3. **Refactor:** confirm no other import in the file is unused and that `npm run agent:test` still collects the suite.

## Test Scenarios

- Gate check: `npm run agent:typecheck` -> exit 0, no `TS6133` output

## Acceptance Criteria

- [x] `npm run agent:typecheck` exits 0

## Dependencies

- None

## Notes

- This failure was already present before the plan-skills work started; recording it as T01 keeps the baseline honest.
- Learnings applied: `docs/learn/decision/agent-tsconfig-standalone-no-extends-app-root.md` (the agent tsconfig is its own gate).
