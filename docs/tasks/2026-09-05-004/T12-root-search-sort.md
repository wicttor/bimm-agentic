---
id: 2026-09-05-004-T12
title: "Root search-by-model and sort-by-year/make compose"
plan-id: 2026-09-05-004
unit: U6c
tier: deep
status: completed
priority: P1
dependencies:
  - 2026-09-05-004-T10
files:
  create:
    - src/components/SearchBar.tsx
  modify:
    - src/App.tsx
    - src/hooks/useCars.ts
  test:
    - src/__tests__/SearchBar.test.tsx
estimated-effort: "2 hours"
timestamp: "2026-09-04T09:05:00-04:00"
---

# Root search-by-model and sort-by-year/make compose

## Goal

Deliver FR-5 in the root app: a search bar filtering by model (live as-you-type) plus sorting by year and by make — both lifting the generated SearchBar/hook logic into root and proving they compose.

## Acceptance Criterion

`src/__tests__/SearchBar.test.tsx` is green: typing "amry" narrows rendered cards to Camry only; selecting sort by year (asc/desc) and by make reorders the rendered cards accordingly; applying search and sort together yields the intersection of both behaviors.

## Steps

1. **Red — Write the failing test:** create `src/__tests__/SearchBar.test.tsx` rendering the app (GET_CARS mocked with seedCars): assert the "amry" narrowing, year-order and make-order assertions on the rendered card sequence, and the composed case (query + sort). Confirm red.
2. **Green — Implement:** lift `SearchBar.tsx` and the filter/sort logic in `useCars.ts` from the T08 generated output into root (same provenance rule as T10 — adapt nothing beyond integration); wire the controls into `src/App.tsx` with MUI TextField/Select.
3. **Refactor:** keep sorting/filtering pure functions of (cars, query, sortKey) inside the hook so tests don't depend on render order accidents; root suite + typecheck green.

## Test Scenarios

- Search: type `amry` -> only Camry card rendered
- Sort: year desc -> Mustang(2025) before Camry(2024)...; make asc -> alphabetical makes
- Compose: `amry` + year sort -> filtered set in sorted order

## Acceptance Criteria

- [x] Search-by-model + sort-by-year/make (and their combination) pass root tests

## Execution Notes (T12, 2026-09-04)

- **Starting state:** a prior session left T12 partially wired (App.tsx search/sort controls, `SearchBar.tsx`, `src/utils/sortCars.ts`) and uncommitted, with 2/5 tests red. Commit `c00d334` checkpoints that state verbatim; Red then began from it.
- **Red:** the AC test was _normalized first_ — `getByLabelText`/order assertions replaced with exact visible-card sequences, direction made explicit per case, and one **vacuous** test fixed (it asserted `"a"` matches all 5 cars; `BMW X5` has no `a`, and it passed only because search was inert). 4 of 8 tests red, all assertion failures on the search behaviour.
- **Root cause (search):** MUI `TextField` spreads an unrecognized `aria-label` onto its root `<div>`, so the `<input>` had no accessible name and the typed query never reached state — the filter was correct but unreachable. Fixed in the implementation (`inputProps={{ "aria-label": "Search cars" }}`), not by weakening the locator.
- **Root cause (sort):** `sortCars` was already correct; the red `make asc` test had assumed selecting a field resets direction. Field and direction are independent controls, so the test now clicks `Make` + `↑ Asc` explicitly (and a second case pins `make desc`). No sort-implementation change.
- **Refactor:** filter lifted to a module-level pure `filterCars(cars, query)` in `useCars.ts`, symmetric with pure `sortCars`; `searchCars` is a `useCallback` over it. Behaviour-preserving.
- **Mutation certification:** 8 mutants, **all killed** — filter disabled, model-match dropped, case-insensitivity removed, direction ignored, field ignored, input order perturbed (catches tie handling), accessible name moved off the `<input>`, `onChange` detached. Each turned the AC suite red; sources restored with md5 verification.
- **Gate evidence:** `npx vitest run src/__tests__/SearchBar.test.tsx` → 8 passed. `npx vitest run` → 4 files / 18 passed. `npm run typecheck` (`tsc --noEmit`, separate from vitest per `vitest-green-masks-typecheck-gate`) → exit 0.
- **Scope:** changed only `src/components/SearchBar.tsx`, `src/hooks/useCars.ts`, `src/__tests__/SearchBar.test.tsx`. `src/utils/sortCars.ts` (undeclared, pre-existing) accepted as deviation; `AddCarForm.tsx` (T13 scope) and `CarCard.tsx` (T11) untouched.
- **Learning candidate:** the MUI `aria-label`-on-wrapper trap (jsdom resolves it to a non-editable DIV and `user.type` no-ops silently rather than throwing) — run `/learn` to capture.

## Dependencies

- 2026-09-05-004-T10: list flow and hook exist in root

## Notes

- Assert visible card titles/order (presence-only-assertions learning). If the generated app implements search differently than the spec wording, that's a spec-generation defect — fix upstream (T02 spec text), not by hand here.
