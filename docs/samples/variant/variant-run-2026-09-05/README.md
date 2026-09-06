# Variant Sample — Book Inventory (T14)

Generated from spec: `docs/examples/variant-specs/variant-rename.md`

This sample demonstrates that the agent is spec-driven, not hardcoded to the Car Inventory.
The variant spec describes a Book Inventory Manager with different entities and fields,
and the agent generates correspondingly renamed files and components with no source-code changes.

## Verification

Generated files:
- `src/useBooks.ts` — GraphQL hook for book data
- `src/AddBookForm.tsx` — Add book form component
- `src/BookList.tsx` — Book list component
- `src/__tests__/BookList.test.tsx` — Tests for BookList

Key properties:
- All generated files contain Book entities and useBooks hook
- No Car references or useCars hook in generated code
- Demonstrates generalization beyond the example spec

Run at: 2026-09-05T04:51:57.978Z
