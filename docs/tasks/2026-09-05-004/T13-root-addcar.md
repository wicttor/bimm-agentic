---
id: 2026-09-05-004-T13
title: "AddCar mutation appends a card without reload"
plan-id: 2026-09-05-004
unit: U6d
tier: deep
status: completed
priority: P1
dependencies:
  - 2026-09-05-004-T10
files:
  create:
    - src/components/AddCarForm.tsx
  modify:
    - src/App.tsx
    - src/hooks/useCars.ts
  test:
    - src/__tests__/AddCarForm.test.tsx
estimated-effort: "2 hours"
timestamp: "2026-09-04T09:05:00-04:00"
---

# AddCar mutation appends a card without reload

## Goal

Deliver FR-4 in the root app: a form that submits via the `AddCar` GraphQL mutation through `useCars()`, with the new car appearing in the list without a page reload (Apollo cache update / refetch).

## Acceptance Criterion

`src/__tests__/AddCarForm.test.tsx` is green: filling make/model/year/color and submitting executes the `AddCar` mutation (MSW server handler) through `useCars()` — not a direct component-level Apollo hook — and a card for the new car appears in the list with no reload; existing 5 cars remain.

## Steps

1. **Red — Write the failing test:** create `src/__tests__/AddCarForm.test.tsx` using the MSW `server` (`@/mocks/server`) or MockedProvider with the AddCar mutation: userEvent fills the form, submits, waits for the 6th card; assert mutation reached the handler and list updated. Confirm red.
2. **Green — Implement:** lift `AddCarForm.tsx` and the addCar action (with `refetchQueries: [{ query: GET_CARS }]` or `update` per the plan-002 remedy) from T08's generated output into root; wire the form into `src/App.tsx` (MUI TextField/Button). Run to green.
3. **Refactor:** MUI validation for year (number, sane range) stays inside the generated form's existing logic — no new features; root suite + typecheck green.

## Test Scenarios

- AddCar: submit "Kia EV6 2026 Blue" -> 6th card with that text; GET_CARS refetched (or cache updated) without reload
- Hook ownership: AddCarForm source has no direct `useMutation` import (goes through useCars)

## Acceptance Criteria

- [x] Form submission adds a visible card via the AddCar mutation with no page reload

## Execution Notes (T13, 2026-09-04)

- **Pre-existing state:** `src/components/AddCarForm.tsx` was already in the tree (faithful lift of the sample + MUI adaptation, brought in by checkpoint `c00d334`). It is this task's own declared `files.create`, so the user chose **claim as-is** — the component was **left unmodified** and is certified by test instead of re-authored.
- **Real MSW path, not MockedProvider:** the AC names the _MSW server handler_, so the test renders `App` under a fresh `ApolloClient` (`HttpLink` + `InMemoryCache`) — Apollo serializes → fetch → MSW intercepts → the real handler mutates its store → response reparses into cache. The sample's `integration.test.ts` documents the same reasoning.
- **Red:** 2 failures on first run — one legitimate (new card rendered `Mileage: 0`, the data-drop finding below) and one **wrong-reason** setup error of my own (`ENOENT … src/__tests__/components/AddCarForm.tsx`: `resolve(fileURLToPath, "..")` stopped one level short). The setup error was fixed **before** accepting Red, since the gate forbids failing for import/path reasons. Clean Red = 1 assertion failure.
- **Authorized deviation (mileage):** the form collected `Mileage` but `ADD_CAR` declared only make/model/year/color **in both root and the generated sample**, so user-entered mileage was silently discarded and the handler's `?? 0` replaced it. User authorized fixing the contract: `$mileage: Int!` added to `ADD_CAR` (`src/graphql/queries.ts`, an undeclared file) and `addCar`'s parameter typed to `AddCarVariables` so a field can no longer be dropped without a type error. `src/mocks/handlers.ts` needed no change — it already read `variables["mileage"]`.
- **"Without reload" proven, not assumed:** fetch is wrapped and requests counted by `operationName`; the sixth card appears while `GetCars` is requested **exactly once** and `AddCar` once. This **resolves the task's open question**: the Apollo `update` cache-append alone satisfies FR-4 — no `refetchQueries` needed. Mutation **M5** (inserting `refetch()` after the mutation) turns the suite red, so the assertion is load-bearing, not decorative.
- **Store hazard:** `src/mocks/handlers.ts` keeps cars in a module-level `let`, which `server.resetHandlers()` does **not** reset — the store accumulates within a file. The suite therefore performs exactly **one** mutation against the shared store; the form-reset test installs private handlers via `server.use()`.
- **Order assertion composes with T12:** the new `2026 Kia EV6` must land **first** under the default `year desc` sort — proving it went through the real filter/sort render pipeline rather than being appended raw.
- **Mutation certification:** 9 mutants → **9 killed**, 0 survived, sources md5-verified (mileage constant, mileage removed from variables, mileage removed from the response set, cache-append neutered, refetch-instead-of-update, form constant mileage, form not reset, `onAdd` wiring detached, component-level Apollo hook). The T13 test file's own type errors surfaced here too: vitest was green while `tsc --noEmit` was red — `vitest-green-masks-typecheck-gate` recurring on my own code, which is why both gates are quoted separately below.
- **Gate evidence:** AC file `npx vitest run src/__tests__/AddCarForm.test.tsx` → 3 passed. Root suite `npx vitest run` → **5 files / 21 passed** (baseline 4/18). `npx tsc --noEmit` → exit **0**. `cd agent && npx tsc --noEmit` → exit 0; `cd agent && npx vitest run` → 16 files / **177 passed** (unchanged). `node agent/scripts/boot-check.mjs . --expect "Car Inventory Manager"` → exit **0**, 12 app modules. `pgrep -af 'vite --hos[t] 127.0.0.1'` → empty.
- **Findings surfaced, not fixed:** (1) the mileage fix makes root **diverge from the generated sample**, which still has the bug — a future regeneration would re-introduce it, so the durable fix is upstream (spec/code-gen prompt) for T14; (2) `AddCarForm` still synthesizes `mobile`/`tablet`/`desktop` URLs that the mutation contract ignores (the handler generates its own) — left as lifted, upstream issue; (3) a failed mutation is **silent** — no error UI exists for the mutation path (only the query has one).

## Dependencies

- 2026-09-05-004-T10: hook + list flow exist in root

## Notes

- Apollo cache refresh was a plan-002 risk; the MSW handler mutates the in-memory store, so a refetch path is the safest certification. Learning gap "refetchQueries vs update reliability" — record the observed behavior for /learn.
