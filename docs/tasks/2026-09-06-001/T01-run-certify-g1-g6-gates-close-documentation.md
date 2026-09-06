---
id: 2026-09-06-001-T01
title: "Run and certify G1–G6 gates and close documentation"
plan-id: 2026-09-06-001
unit: U1
tier: fast
status: not-started
priority: P1
dependencies: []
files:
  create:
    - README.md
  modify: []
  test:
    - src/__tests__/README.test.ts
estimated-effort: "4 hours"
timestamp: 2026-09-06T01:23:40Z
---

# Run and certify G1–G6 gates and close documentation

## Goal

Run and evidence the six verification gates (G1–G6) against root, agent, and samples/output — including the open plan-accuracy findings (sample package.json missing @mui/material/@apollo/client/graphql/msw deps, sample never wiring sortCars into its hook/App, sample omitting mileage from ADD_CAR, silent AddCar error path, non-resettable handlers store) — then document each gate's named command and observed result plus cost in the README.

## Acceptance Criterion

README gains a Verification Gates section documenting G1–G6 with observed results and cost, and the readme test passes green.

## Steps

1. (Red) Write README.test.ts asserting a '## Verification Gates' section listing G1–G6, each with a named command, an observed result, and a cost note; confirm it fails (section absent).
2. (Green) Run the gates: root typecheck+test, agent typecheck+177 tests, samples/output install+typecheck+test+build, boot-check on root and samples, mutation certificate evidence; fix any failing gate scoped to documentation closure (note the sample package.json dependency gap); record observed results and cost in README; make the test pass.
3. (Refactor) Consolidate gate evidence into a table, verify all named commands are reproducible, and confirm typecheck/tests remain green with the README updated.

## Test Scenarios

- README gains a Verification Gates section documenting G1–G6 with observed results and cost, and the readme test passes green.

## Acceptance Criteria

- [ ] README gains a Verification Gates section documenting G1–G6 with observed results and cost, and the readme test passes green.

## Dependencies

- None

## Notes

- Must export: (none declared).
- Executed by the work skill in autopilot. The only files this task may create are the ones named above; no `.work/` phase artifacts are written for it.
