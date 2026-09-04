# Car Inventory Manager — Spec

Input spec for the agent CLI (`node agent/src/index.ts --spec specs/car-inventory.md`).
This is the natural-language description the planner (T08) decomposes into file tasks; it
is deliberately prose, not code. The boilerplate (`src/`, `agent/tests/../` exemplars) is
the read-only reference the generator must follow.

## What to build

A single-page **Car Inventory Manager** in the provided React + TypeScript boilerplate,
backed by the existing mock GraphQL API (Apollo Client queries in `src/graphql/queries.ts`,
MSW handlers in `src/mocks/`). Do not add a real backend — MSW's in-memory store is the
database.

## Required behaviors

1. **Car list** — on load, fetch all cars with the existing `GET_CARS` query and render
   the list.
2. **Car cards** — each car is a Material UI `Card` showing make, model, year, color, and
   the car's image.
3. **Responsive images** — the schema carries `mobile`, `tablet`, and `desktop` image
   URLs. Pick by viewport width: `<= 640px` mobile, `641px–1023px` tablet, `>= 1024px`
   desktop.
4. **Add-car form** — a form that submits a new car through the existing `ADD_CAR`
   mutation; the new car then appears in the list.
5. **Search and sorting** — a search bar filtering by model text, plus sorting by year or
   make.
6. **`useCars()` hook** — all GraphQL access lives in one custom hook exposing `cars`,
   `loading`, and `error`; components must not call `useQuery`/`useMutation` directly.
7. **Unit tests** — vitest + Testing Library tests covering list rendering, search,
   sorting, the add-car mutation round-trip, and the three responsive-image breakpoints,
   following the `MockedProvider` pattern of `src/__tests__/Example.test.tsx`.

## Constraints

- Import shared types from `@/types` and operations from `@/graphql/queries` via the `@/`
  alias; do not redefine existing queries or the `Car` type.
- Match the existing fixtures' `__typename: "Car"` convention.
- The result must pass `npm run typecheck` (strict, `noUnusedLocals`, `noUnusedParameters`,
  `noUncheckedIndexedAccess`) and `npm run test` inside the generated app.

## Out of scope

- Real network APIs, persistence, auth, routing/state libraries, restyling beyond MUI
  defaults.
