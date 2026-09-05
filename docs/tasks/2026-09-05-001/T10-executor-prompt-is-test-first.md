---
id: 2026-09-05-001-T10
title: "Give the executor its criterion and Red-before-Green order"
plan-id: 2026-09-05-001
unit: U6
tier: deep
status: completed
priority: P1
dependencies: [2026-09-05-001-T05, 2026-09-05-001-T07]
files:
  create: []
  modify:
    - agent/src/prompts/generator.ts
    - agent/tests/prompts.test.ts
  test:
    - agent/tests/prompts.test.ts
estimated-effort: "2 hours"
timestamp: 2026-09-05T16:40:00Z
---

# Give the executor its criterion and Red-before-Green order

## Goal

The generator's role said "one file per turn", which makes a test-first task impossible: the test
and the implementation are two files of one criterion.

## Acceptance Criterion

The per-task ask names the task's test file before its implementation file and states the acceptance criterion and three steps, so the executor writes Red before Green

## Steps

1. **Red — Write the failing test:** extend `agent/tests/prompts.test.ts`: for a component task the user turn contains `CarCard.test.tsx`, the criterion, all three steps, and the test path appears before the last mention of the implementation path; for a test-file task the role says the task's file *is* its test; and a planner-supplied criterion/steps win over the derived ones. Confirm failures.
2. **Green — Implement:** parameterise `generatorRole(task)` on the derived test file, add the criterion + steps section to the user turn, and state the write order in the closing instruction.
3. **Refactor:** let the derivation come from `plan-artifacts.ts` helpers so the task file and the executor prompt cannot describe different steps for the same task.

## Test Scenarios

- Order: `CarCard.test.tsx` before the last `CarCard.tsx` mention in the ask
- Self-test task: role contains `this task's file is its test` and no `.test.test.tsx`
- Planner wins: supplied `acceptanceCriterion`/`steps`/`testFile` appear verbatim

## Acceptance Criteria

- [x] The per-task ask names the task's test file before its implementation file and states the acceptance criterion and three steps, so the executor writes Red before Green

## Dependencies

- 2026-09-05-001-T05: the work skill supplies the procedure this ask now instantiates
- 2026-09-05-001-T07: `stepsFor`/`testFileFor` are the shared derivation

## Notes

- Existing assertions stay true: rules and exemplars remain in the system turn, `write_file` and `no placeholders` stay in the contract.
