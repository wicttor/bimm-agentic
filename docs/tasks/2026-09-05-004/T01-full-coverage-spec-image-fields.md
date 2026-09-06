---
id: 2026-09-05-004-T01
title: "Full-coverage sample spec parses with image fields and no phantom entities"
plan-id: 2026-09-05-004
unit: U1a
tier: deep
status: completed
priority: P0
dependencies: []
files:
  create: []
  modify:
    - agent/samples/cars.spec.txt
  test:
    - agent/src/spec-parser/index.test.ts
estimated-effort: "1 hour"
timestamp: "2026-09-04T09:05:00-04:00"
---

# Full-coverage sample spec parses with image fields and no phantom entities

## Goal

Rewrite `agent/samples/cars.spec.txt` so the Car entity's fields include the three responsive image URL fields, and prove the richer prose still parses cleanly through the existing spec parser — the foundation for FR-driven regeneration.

## Acceptance Criterion

`parseSpec` on the new `cars.spec.txt` returns an entity whose fields include `mobile`, `tablet`, and `desktop` — with no phantom entities created from feature prose.

## Steps

1. **Red — Write the failing test:** in `agent/src/spec-parser/index.test.ts`, add a case that runs `parseSpec` against the repo-relative `agent/samples/cars.spec.txt` and asserts `entities` includes one entity whose `fields` ⊇ {mobile, tablet, desktop}, and that no entity name matches feature-prose words. Run `npx vitest run src/spec-parser` and confirm it fails for the right reason (fields missing in current spec), not an import error.
2. **Green — Implement:** rewrite `agent/samples/cars.spec.txt` in the parser's supported syntax: Car entity with fields `make, model, year, color, mobile (image URL for viewports ≤640px), tablet (image URL for 641–1023px), desktop (image URL for ≥1024px)`. Keep prose in the features section only. Run the test to green.
3. **Refactor:** ensure the field descriptions stay plain text the parser tolerates; re-run the full agent suite (`npx vitest run`) to confirm no other spec fixture broke.

## Test Scenarios

- Full spec parse: cars.spec.txt -> entities[0].fields ⊇ {mobile, tablet, desktop}; exactly 1 entity for Car
- Guard: feature prose lines (starting "The system must…") -> no extra entities (raw-line-regex-overmatch regression)

## Acceptance Criteria

- [x] `parseSpec` returns the Car entity with the three image URL fields and zero phantom entities from prose

## Dependencies

- None

## Notes

- Learning `raw-line-regex-heuristics-overmatch`: the parser treats lines loosely; keep field lines within the current supported `field: description` format and avoid heading-like syntax in prose.
- Learning `vitest-fixture-paths-resolve-from-cwd`: resolve `cars.spec.txt` from `import.meta.url`, not process cwd.
- FR traceability lives in the spec body per README FR-1–FR-7; T02 adds the feature-statement assertions.
