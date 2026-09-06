---
id: 2026-09-05-004-T02
title: "Sample spec demands all seven functional requirements"
plan-id: 2026-09-05-004
unit: U1b
tier: deep
status: completed
priority: P0
dependencies:
  - 2026-09-05-004-T01
files:
  create: []
  modify:
    - agent/samples/cars.spec.txt
  test:
    - agent/src/spec-parser/index.test.ts
estimated-effort: "1 hour"
timestamp: "2026-09-04T09:05:00-04:00"
---

# Sample spec demands all seven functional requirements

## Goal

Extend the rewritten spec so its required-features statements cover every README functional requirement (FR-1–FR-7) plus the extras, and certify by assertion that the parsed Spec carries them — without baking any of this into agent prompts (anti-memorization).

## Acceptance Criterion

The parsed Spec's `requiredFeatures` contains ≥ 7 distinct statements, traceable to spec lines, covering: GraphQL/Apollo/MSW data layer, responsive-image breakpoints (640/1024), MUI cards, AddCar mutation with cache refresh, search by model, sort by year and make, `useCars()` hook extraction, and unit tests; optional features carry the extras (GetCar, year filter, useCarFilters).

## Steps

1. **Red — Write the failing test:** in `agent/src/spec-parser/index.test.ts`, add a case asserting `parseSpec(cars.spec.txt).requiredFeatures.length >= 7` and that the joined feature text matches each of: /graphql|apollo|msw/i, /breakpoint|640|1024|responsive/i, /card|mui/i, /mutation|add/i, /search|filter/i, /sort/i, /hook/i, /test/i. Confirm red against the current 3-sentence spec.
2. **Green — Implement:** write the feature statements into `agent/samples/cars.spec.txt` as plain requirement sentences mirroring README FR-1–FR-7 (including "new car appears without a page reload" and "components must not call Apollo hooks directly"), and the three optional extras into the optional section. Run to green.
3. **Refactor:** keep wording domain-neutral in structure (requirements about "the app" and fields named in the entity block), so the same spec shape generalizes; re-run T01's assertions to confirm both stay green.

## Test Scenarios

- FR coverage: parsed requiredFeatures -> >= 7 entries, each FR demand keyword group matched by at least one feature statement
- Traceability: every matched feature string appears verbatim in cars.spec.txt (no parser synthesis)

## Acceptance Criteria

- [x] Parsed requiredFeatures ≥ 7 statements covering every FR demand; extras present as optional features

## Dependencies

- 2026-09-05-004-T01: spec file must already be in its new parser-compatible shape

## Notes

- This task is the anti-memorization load-bearer: FR text must live ONLY here, never in `agent/src/generator/prompts.ts` (U2 adds generic inventory context, not answers).
- Learning `sibling-schema-copy-drops-validation-guards`: if the schema is touched to separate optional features, keep `.min` guards intact.
