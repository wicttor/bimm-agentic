---
id: 2026-09-04-001-T07
title: "Prompt library and contract enforcement"
plan-id: 2026-09-04-001
unit: U6
tier: deep
status: not-started
priority: P1
dependencies: [2026-09-04-001-T03]
files:
  create:
    - agent/src/prompts/planner.ts
    - agent/src/prompts/generator.ts
    - agent/src/prompts/repair.ts
    - agent/src/prompts/exemplars.ts
  modify: []
  test:
    - agent/tests/prompts.test.ts
estimated-effort: "5 hours"
timestamp: 2026-09-04T22:00:00Z
---

# Prompt library and contract enforcement

## Goal
Make every model call structured and constrained — role, hard rules, few-shot exemplars, output contract. Rules are derived from the reference files, not duplicated as prose, so they stay in sync with the boilerplate.

## Acceptance Criterion
Each prompt builder renders the boilerplate's non-negotiable rules — import `GET_CARS`/`ADD_CAR` from `@/graphql/queries`, `Car` from `@/types`, use the `@/` alias, `__typename: "Car"` in fixtures, the 640/1024 breakpoint table, and the four strict-compiler flags — by reading them from the reference files rather than duplicating them as prose.

## Steps
1. **Red — Write the failing test:** add `agent/tests/prompts.test.ts` asserting: (a) generator prompt for a card component -> contains the `@/graphql/queries` rule and the `Example.tsx` exemplar; (b) planner prompt -> contains the task-JSON schema instruction and the "do not redefine queries/handlers" rule; (c) drift guard: a `Car` field removed from the fixture disappears from the rendered prompt (proves derivation, not hardcoding). Run and confirm failure (prompts don't exist yet).
2. **Green — Implement:** create `agent/src/prompts/planner.ts` (spec -> task-plan prompt with JSON schema), `agent/src/prompts/generator.ts` (per-task generation prompt with rules + exemplars), `agent/src/prompts/repair.ts` (error-context repair prompt), `agent/src/prompts/exemplars.ts` (reads boilerplate files to derive rules and exemplar content).
3. **Refactor:** ensure all rules are derived from files, not hardcoded; verify the prompt builders are composable and testable in isolation.

## Test Scenarios
- Generator prompt for a card component -> contains the `@/graphql/queries` rule and the `Example.tsx` exemplar
- Planner prompt -> contains the task-JSON schema instruction and the "do not redefine queries/handlers" rule
- Drift guard: a `Car` field removed from the fixture disappears from the rendered prompt (proves derivation, not hardcoding)

## Acceptance Criteria
- [ ] Each prompt builder renders boilerplate rules by reading reference files rather than duplicating them as prose

## Dependencies
- 2026-09-04-001-T03: LLM adapter defines the message/tool types that prompt builders produce

## Notes
- The drift-guard test is critical: it proves rules are derived from files, not hardcoded strings.
- The 640/1024 breakpoint table and four strict-compiler flags must appear verbatim in generator prompts.
- This task is on the Phase 2 critical path — T08, T09, T10 all depend on it.
