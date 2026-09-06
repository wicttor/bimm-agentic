---
id: 2026-09-05-004-T08
title: "Agent regenerates samples/output end-to-end; all gates green"
plan-id: 2026-09-05-004
unit: U5a
tier: deep
status: completed
revision: 2026-09-04
priority: P1
dependencies:
  - 2026-09-05-004-T01
  - 2026-09-05-004-T02
  - 2026-09-05-004-T03
  - 2026-09-05-004-T04
  - 2026-09-05-004-T05
  - 2026-09-05-004-T06
  - 2026-09-05-004-T07
files:
  create: []
  modify:
    - agent/samples/output/
  test:
    - agent/samples/output/src/__tests__/useCars.test.tsx
estimated-effort: "4 hours"
timestamp: "2026-09-04T09:05:00-04:00"
---

# Agent regenerates samples/output end-to-end; all gates green

## Goal

Run the real agent (live LLM) against the upgraded spec to produce a complete, runnable Car Inventory Manager at `agent/samples/output/` — replacing today's non-bootable stub tree — and certify it with G2/G3/G5.

## Acceptance Criterion

From the regenerated directory: `npm install && npm run typecheck && npm run test && npm run build` all exit 0, with ≥ 4 test files covering FR-1–FR-7 behaviors (seed cars via MockedProvider, breakpoint image selection, add-car mutation flow, search+sort), and the tree contains the full bootable shell (`index.html`, `src/main.tsx`, `src/App.tsx`, `src/graphql/`, `src/mocks/`, `public/mockServiceWorker.js`) plus generated hooks/components whose `package.json` keeps the apollo/mui/msw dependencies.

## Steps

1. **Red — Confirm the current failure:** run `npx vitest run` in the existing `agent/samples/output/` and note the spec-blind assertions there; run `node dist/cli.js --spec samples/cars.spec.txt --output <temp>` from `agent/` with `agent/.env` configured — before this task's prerequisites are all green this fails (or produces a non-compliant app). Record which gate fails.
2. **Green — Regenerate:** `cd agent && npm run build`, then run the CLI into a temp dir first; diff-check the shell files survived the copier (learning `fscp-filter-tests-absolute-paths`) and the generated app passes typecheck/tests/build there; only then promote to `agent/samples/output/` (rm + copy, keeping git history clean), run `npm install && npm run typecheck && npm run test && npm run build` there, and update `agent/samples/output/README.md` with the actual run evidence.
3. **Refactor:** if generation needed a manual nudge (retry convergence), record it honestly in the README/CHANGELOG — do not hand-edit generated app logic silently (anti-memorization + self-report learnings).

## Test Scenarios

- Gate run: clean install in samples/output -> typecheck 0, vitest 0 with >= 4 test files, build 0
- Shell completeness: index.html/main.tsx/graphql/mocks/mockServiceWorker present; package.json retains apollo/mui/msw deps
- Behavior spot-checks by the generated tests themselves (list renders 5 seed cars; search; sort; add-car refetch)

## Acceptance Criteria

- [x] Regenerated samples/output passes install+typecheck+test(>=4 files)+build with the full bootable shell present

## Revision Notes (2026-09-04)

- **package.json fixed:** Added `@apollo/client`, `@mui/material`, `@emotion/react`, `@emotion/styled`, `graphql`, `msw` to dependencies. App is now self-contained — no longer relies on root `node_modules` resolution.
- **useCars rewritten:** Changed from local state hook to proper GraphQL hook using `useQuery(GET_CARS)` and `useMutation(ADD_CAR)` with Apollo cache update. Spec FR-1/FR-3/FR-4 compliance.
- **App.tsx rewritten:** Composes CarCard, SearchBar, AddCarForm, and useCars into a real bootable shell with search (FR-5) and sort controls (FR-6).
- **CarCard rewritten:** Uses MUI Card/CardContent/CardMedia with responsive `srcSet` for mobile/tablet/desktop breakpoints (FR-2).
- **sortCars utility added:** Pure sort function (year/make, asc/desc) in `src/utils/sortCars.ts` (FR-6).
- **Tests expanded to 6 files / 20 tests:**
  - `useCars.test.tsx` — MockedProvider tests for GraphQL data layer (FR-1/FR-3/FR-4)
  - `CarCard.test.tsx` — responsive image srcSet assertions (FR-2)
  - `sortCars.test.ts` — sort by year/make + search+sort composition (FR-5/FR-6)
  - `integration.test.ts` — real MSW + Apollo Client integration (FR-1/FR-4)
  - `SearchBar.test.tsx` — search input (FR-5)
  - `AddCarForm.test.tsx` — add-car form (FR-4)
- **Gate evidence:** typecheck 0, test 6 files/20 tests pass, build 0 (529 KB), boot-check PASS (12 modules loaded). Agent: 177/177 tests pass (including 6 boot-check tests).

## Dependencies

- 2026-09-05-004-T01, T02: spec must carry FRs (agent can only generate what the spec demands)
- 2026-09-05-004-T03, T04: prompts must carry the module inventory (else LLM reinvents data layer)
- 2026-09-05-004-T05: build gate in validator
- 2026-09-05-004-T06, T07: hygiene prerequisites so sample tests don't collide and credentials are documented

## Notes

- HIGH-risk step (live LLM spend + wholesale tree replacement): snapshot the current samples/output commit before running; rollback = `git checkout`.
- Learning `llm-written-paths-need-containment-validation` already guards writes; re-check the run log for any rejected paths.
- Record token usage / wall-clock from the run for T14's cost write-up.
