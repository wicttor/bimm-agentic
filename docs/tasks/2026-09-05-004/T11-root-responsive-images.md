---
id: 2026-09-05-004-T11
title: "CarCard switches image src across 640/1024 breakpoints (mutation-certified)"
plan-id: 2026-09-05-004
unit: U6b
tier: deep
status: completed
priority: P1
dependencies:
  - 2026-09-05-004-T10
files:
  create: []
  modify:
    - src/components/CarCard.tsx
  test:
    - src/__tests__/CarCard.test.tsx
estimated-effort: "2 hours"
timestamp: "2026-09-04T09:05:00-04:00"
---

# CarCard switches image src across 640/1024 breakpoints (mutation-certified)

## Goal

Deliver FR-2 in the root app: the card image picks `mobile` ≤ 640px, `tablet` 641–1023px, `desktop` ≥ 1024px — using a real breakpoint mechanism — proven by tests that die when the selection logic is removed.

## Acceptance Criterion

`src/__tests__/CarCard.test.tsx` is green: with `matchMedia` mocked at 500px the rendered `img src` equals `car.mobile`, at 800px `car.tablet`, at 1400px `car.desktop`; and temporarily deleting the breakpoint-selection line in `CarCard.tsx` turns the test red (mutation-certified), then restoring it returns green.

## Steps

1. **Red — Write the failing test:** create `src/__tests__/CarCard.test.tsx` with a matchMedia mock (define `window.matchMedia` keyed on injected widths; MUI `useMediaQuery` works with it — document the recipe for the learning gap). Assert the three width→src mappings. Confirm red.
2. **Green — Implement:** adapt the generated responsive selection (lifted from T08 output) into `src/components/CarCard.tsx` — e.g. MUI `useMediaQuery('(max-width: 640px)')` / `('(min-width: 1024px)')` selecting the URL (or an equivalent `<picture>`/`srcset` scheme the generated app uses). Run to green.
3. **Refactor:** extract the breakpoint logic if it grew branches; run the full root suite + typecheck; perform and record the mutation check in the commit notes.

## Test Scenarios

- Breakpoint: matchMedia at 500 -> img src = mobile URL; 800 -> tablet; 1400 -> desktop
- Mutation-certify: delete selection line -> at least one width assertion red; restore -> green

## Acceptance Criteria

- [x] Three-width image switching test green and certified to die without the selection logic

## Execution Notes (T11, 2026-09-04)

- **Files touched:** `src/components/CarCard.tsx` (rewrite: useMediaQuery-based selection), `src/__tests__/CarCard.test.tsx` (create)
- **Breakpoint mechanism:** Switched from `srcSet`/`sizes` (CSS-level, untestable in jsdom) to `useMediaQuery` (JS-level, testable via matchMedia mock). MUI's `useMediaQuery` uses `matchMedia` internally.
- **Mutation certification:** Hardcoded `imageSrc = car.desktop` → 2 tests fail (mobile + tablet). Restored → all 4 pass. Tests are mutation-certified.
- **Gate evidence:** Root typecheck 0, root test 3 files / 10 tests pass (4 new in CarCard.test.tsx). Agent typecheck 0. Boot-check PASS.

## Dependencies

- 2026-09-05-004-T10: CarCard exists in root src/

## Notes

- Learnings: `presence-only-assertions-survive-mutation`, `mutation-check-ac-certifying-tests`. This closes part of the "jsdom matchMedia recipe" learning gap — capture via `/learn` after.
