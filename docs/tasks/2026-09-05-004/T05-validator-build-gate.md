---
id: 2026-09-05-004-T05
title: "Validator adds npm run build gate with stderr in retry context"
plan-id: 2026-09-05-004
unit: U3
tier: deep
status: completed
priority: P0
dependencies: []
files:
  create: []
  modify:
    - agent/src/validator/run-checks.ts
    - agent/src/validator/retry.ts
  test:
    - agent/src/validator/run-checks.test.ts
estimated-effort: "3 hours"
timestamp: "2026-09-04T09:05:00-04:00"
---

# Validator adds npm run build gate with stderr in retry context

## Goal

Make "the output is a runnable project" machine-checked: the self-validation loop runs `npm run build` alongside typecheck and tests, and a build failure's stderr is captured into the retry error context — closing the AR-4/AR-6 gap where a non-bootable app could pass validation.

## Acceptance Criterion

`runChecks` executes the build gate alongside typecheck and tests; on build failure the `ValidationResult` names the build gate and the error context passed to `validateAndRetry`'s retry contains the build stderr excerpt (no empty-context leg for any gate).

## Steps

1. **Red — Write the failing test:** in `agent/src/validator/run-checks.test.ts`, mock the process runner so typecheck/tests succeed but build exits non-zero with distinctive stderr; assert the result flags the build gate and that the assembled retry context string contains that stderr excerpt. Confirm red (build leg absent today).
2. **Green — Implement:** add the `npm run build` leg to `run-checks.ts`, capture stdout+stderr, extend `retry.ts` context assembly to include build output for every failing gate.
3. **Refactor:** keep gate definitions data-driven (one list: name → command) so a future gate can't be added with a missing capture leg (learning `failure-feedback-loop-must-capture-every-gate`); full agent suite + both tsc passes green.

## Test Scenarios

- Build fails, others green -> ValidationResult lists build; retry prompt contains stderr excerpt (mutant: drop capture -> red)
- All gates green -> no retry invoked

## Acceptance Criteria

- [x] runChecks includes the build gate and its failure output reaches the retry context

## Dependencies

- None

## Notes

- Mutation-certify the capture: an empty-context retry leg was review finding F03/F04 in plan 001 — the test must fail if the excerpt splice is deleted.
- Remember `&&`-chained npm scripts hide errors after the first (learning `vitest-green-masks-typecheck-gate`) — run gates individually.
