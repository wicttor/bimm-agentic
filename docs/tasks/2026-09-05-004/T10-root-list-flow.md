---
id: 2026-09-05-004-T10
title: "Root app lists 5 seed cars via useCars -> Apollo/MSW as MUI cards"
plan-id: 2026-09-05-004
unit: U6a
tier: deep
status: completed
priority: P1
dependencies:
  - 2026-09-05-004-T08
files:
  create:
    - src/hooks/useCars.ts
    - src/components/CarCard.tsx
  modify:
    - src/App.tsx
  test:
    - src/__tests__/useCars.test.tsx
estimated-effort: "3 hours"
timestamp: "2026-09-04T09:05:00-04:00"
---

# Root app lists 5 seed cars via useCars -> Apollo/MSW as MUI cards

## Goal

Lift the generated list flow into the root project so `:5173` shows a real inventory: `useCars()` owns the `GetCars` query (Apollo + MSW), `App.tsx` renders the cars as MUI Cards via `CarCard`, and the placeholder text is gone.

## Acceptance Criterion

`npm run test` and `npm run typecheck` at repo root pass with `src/__tests__/useCars.test.tsx` green: `useCars()` fetches the 5 MSW seed cars (via `MockedProvider`/MSW server), `App` renders 5 MUI `Card` elements showing make/model/year/color through `CarCard`, and no component other than `useCars.ts` imports Apollo hooks (FR-1, FR-3, FR-6).

## Steps

1. **Red — Write the failing test:** create `src/__tests__/useCars.test.tsx` following the boilerplate `MockedProvider` pattern (`src/__tests__/Example.test.tsx`): render `App` (or a harness) with GET_CARS mocked to `seedCars`; assert 5 cards with the seed makes/models appear and the placeholder string is absent. Confirm red against the placeholder `App.tsx`.
2. **Green — Implement:** copy/adapt the generated `useCars.ts` and `CarCard.tsx` from `agent/samples/output/src/` into root `src/` (preserve provenance: same content, note source in commit message), rewrite `src/App.tsx` to wire them (MUI Container/Grid + heading + card list), keeping `@/` imports and existing `main.tsx` shell. Run to green.
3. **Refactor:** remove the now-unused `Example.tsx` pair only if the few-shot sourcing in T03's fallback still behaves (it reads those files — keep them, they're the generator's few-shot source; just ensure they don't render in App).

## Test Scenarios

- Fetch+render: GET_CARS mocked with 5 seedCars -> 5 MUI cards, each shows make, model, year, color
- Hook ownership: static import check in test (read CarCard.tsx source) -> no `@apollo/client` import outside hooks/useCars.ts

## Acceptance Criteria

- [x] Root typecheck+test green with 5 seed cars rendered as MUI cards through useCars()

## Execution Notes (T10, 2026-09-04)

- **Files touched:** `src/hooks/useCars.ts` (create), `src/components/CarCard.tsx` (create, lifted from samples/output), `src/App.tsx` (rewrite), `src/__tests__/useCars.test.tsx` (create), `src/graphql/queries.ts` (fix: add mileage to selection sets), `src/__tests__/Example.test.tsx` (fix: add mileage to mock data)
- **Hook ownership:** Only `useCars.ts` imports from `@apollo/client`. CarCard and App are Apollo-free.
- **Example.tsx preserved:** Kept as few-shot source for the generator (per T03's fallback). It no longer renders in App.
- **Gate evidence:** Root typecheck 0, root test 2 files / 6 tests pass (4 new in useCars.test.tsx + 2 existing in Example.test.tsx). Agent typecheck 0. Boot-check PASS on samples/output.

## Dependencies

- 2026-09-05-004-T08: the generated source being lifted must exist first

## Notes

- Do NOT hand-improve logic beyond the generated version; if the generated code needs a change, change it in samples via a regeneration note and re-lift — provenance matters for the memorization rule.
- Learning `presence-only-assertions-survive-mutation`: assert actual card contents, not "5 divs exist".
