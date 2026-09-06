# Book Inventory Manager — Variant Spec

Input spec for the agent CLI demonstrating spec-driven generalization.
This variant spec renames key entities and fields from the Car Inventory spec
to show that the agent generates correspondingly renamed files and queries
with no source-code changes to the agent itself.

## What to build

A single-page **Book Inventory Manager** in the provided React + TypeScript boilerplate,
backed by the existing mock GraphQL API (Apollo Client queries in `src/graphql/queries.ts`,
MSW handlers in `src/mocks/`). Do not add a real backend — MSW's in-memory store is the
database.

## Required behaviors

1. **Book list** — on load, fetch all books with the existing `GET_BOOKS` query and render
   the list.
2. **Book cards** — each book is a Material UI `Card` showing title, author, year, genre, and
   the book's cover image.
3. **Responsive images** — the schema carries `mobile`, `tablet`, and `desktop` cover image
   URLs. Pick by viewport width: `<= 640px` mobile, `641px–1023px` tablet, `>= 1024px`
   desktop.
4. **Add-book form** — a form that submits a new book through the existing `ADD_BOOK`
   mutation; the new book then appears in the list.
5. **Search and sorting** — a search bar filtering by title text, plus sorting by year or
   author name.
6. **`useBooks()` hook** — all GraphQL access lives in one custom hook exposing `books`,
   `loading`, and `error`; components must not call `useQuery`/`useMutation` directly.
7. **Unit tests** — vitest + Testing Library tests covering list rendering, search,
   sorting, the add-book mutation round-trip, and the three responsive-image breakpoints,
   following the `MockedProvider` pattern of `src/__tests__/Example.test.tsx`.

## Constraints

- Import shared types from `@/types` and operations from `@/graphql/queries` via the `@/`
  alias; do not redefine existing queries or the `Book` type.
- Match the existing fixtures' `__typename: "Book"` convention.
- The result must pass `npm run typecheck` (strict, `noUnusedLocals`, `noUnusedParameters`,
  `noUncheckedIndexedAccess`) and `npm run test` inside the generated app.

## Out of scope

- Real network APIs, persistence, auth, routing/state libraries, restyling beyond MUI
  defaults.
