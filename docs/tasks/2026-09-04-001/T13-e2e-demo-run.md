---
id: 2026-09-04-001-T13
title: "End-to-end demo run and committed sample output"
plan-id: 2026-09-04-001
unit: U12
tier: deep
status: not-started
priority: P2
dependencies: [2026-09-04-001-T01, 2026-09-04-001-T02, 2026-09-04-001-T11, 2026-09-04-001-T12]
files:
  create:
    - generated-app/**
    - agent/tests/e2e-app.test.ts
  modify:
    - specs/car-inventory.md
  test:
    - agent/tests/e2e-app.test.ts
estimated-effort: "8 hours"
timestamp: 2026-09-04T22:00:00Z
---

# End-to-end demo run and committed sample output

## Goal
Prove the loop produces a runnable app and capture it as the submission's sample. One CLI invocation with a real provider key must produce an app where typecheck and test pass, covering all six required behaviors.

## Acceptance Criterion
One `npm run agent -- --spec specs/car-inventory.md` invocation with a real provider key produces an app where `npm run typecheck` and `npm run test` pass inside `generated-app/`, covering all six required behaviors: Apollo/MSW car list, breakpoint-correct responsive images, MUI cards, AddCar mutation form, model search with year/make sorting, and a `useCars()` hook.

## Steps
1. **Red — Write the failing test:** add `agent/tests/e2e-app.test.ts` asserting: (a) breakpoints: viewport 640/641/1023/1024 px -> mobile/tablet/tablet/desktop URL selected; (b) mutation: submit AddCar -> new car appears through existing MSW in-memory store; (c) hook contract: `useCars()` exposes `cars`, `loading`, `error` and is the only place `useQuery` appears. Run and confirm failure (generated app doesn't exist yet).
2. **Green — Implement:** run the full pipeline with a real provider key (`npm run agent -- --spec specs/car-inventory.md`); commit the resulting `generated-app/` as the sample output; refine `specs/car-inventory.md` if needed to cover all six behaviors. If the generated app fails typecheck/test, iterate on the prompts (T07) or repair loop (T11) — not by hand-editing the output.
3. **Refactor:** verify the committed sample is reproducible (re-run produces equivalent output); ensure the spec is clear and complete; confirm all six behaviors are test-covered.

## Test Scenarios
- Breakpoints: viewport 640 / 641 / 1023 / 1024 px -> mobile / tablet / tablet / desktop URL selected
- Mutation: submit AddCar -> new car appears through the existing MSW in-memory store
- Hook contract: `useCars()` exposes `cars`, `loading`, `error` and is the only place `useQuery` appears

## Acceptance Criteria
- [ ] One CLI invocation produces an app where typecheck and test pass, covering Apollo/MSW car list, responsive images, MUI cards, AddCar form, search with sorting, and useCars() hook

## Dependencies
- 2026-09-04-001-T01: Agent sub-project wiring must be in place to run the CLI
- 2026-09-04-001-T02: CLI config must resolve provider and flags for the real run
- 2026-09-04-001-T11: Repair loop must be working to converge on a green generated app
- 2026-09-04-001-T12: Run trace must capture the demo run's evidence

## Notes
- Learning gap: responsive image selection in jsdom — capture as a `pattern` learning after this task.
- The generated app requires a real API key for the initial run; subsequent CI/evaluator runs use the replay fixture from T12.
- This task may require iterating on prompts (T07) if the generated code doesn't converge — that's expected and part of the workflow.
- The six required behaviors are drawn from the README's spec requirements.
