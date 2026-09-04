---
id: 2026-09-04-001-T14
title: "Generalization check and architecture write-up"
plan-id: 2026-09-04-001
unit: U13
tier: deep
status: not-started
priority: P2
dependencies: [2026-09-04-001-T13]
files:
  create:
    - agent/README.md
    - specs/variant-inventory.md
  modify:
    - README.md
  test:
    - agent/tests/generalization.test.ts
estimated-effort: "6 hours"
timestamp: 2026-09-04T22:00:00Z
---

# Generalization check and architecture write-up

## Goal
Show the agent is spec-driven rather than Car-hardcoded, and document the architecture, decisions, and tradeoffs for the secondary 30% of the rubric (Agent Design write-up, creativity, and reproducibility).

## Acceptance Criterion
A structurally different variant spec (different entity and field names) drives the planner to emit correspondingly renamed files and queries with no source-code change to the agent, and the documentation records the provider choice, the two-loop architecture with the diagram, the pi-SDK rejection rationale, tradeoffs, and measured cost per run.

## Steps
1. **Red — Write the failing test:** add `agent/tests/generalization.test.ts` asserting: (a) variant spec: a "Book Inventory" spec -> plan contains book-shaped files, no `Car` literals reachable from the prompt builders; (b) docs completeness: the write-up contains architecture, tradeoffs, cost, and how-to-run sections. Run and confirm failure (variant spec and docs don't exist yet).
2. **Green — Implement:** create `specs/variant-inventory.md` (a structurally different spec — e.g., "Book Inventory" with different entities, fields, and queries), create `agent/README.md` (architecture diagram, provider choice rationale, pi-SDK rejection, tradeoffs, measured cost, how-to-run), update root `README.md` to reference the agent documentation.
3. **Refactor:** verify no `Car` literals are reachable from the prompt builders when the variant spec is used; ensure the write-up is clear and complete for a reviewer; confirm the cost figures are from real runs (T12's trace), not estimates.

## Test Scenarios
- Variant spec: a "Book Inventory" spec -> plan contains book-shaped files, no `Car` literals reachable from the prompt builders
- Docs completeness: the write-up contains architecture, tradeoffs, cost, and how-to-run sections

## Acceptance Criteria
- [ ] A variant spec drives renamed files/queries with no agent source change, and documentation records provider choice, two-loop architecture, pi-SDK rejection, tradeoffs, and measured cost

## Dependencies
- 2026-09-04-001-T13: E2E demo must succeed first to provide measured cost data and prove the loop works

## Notes
- This task closes out the submission checklist: agent source, README with setup + architecture + decisions, sample spec, sample output, `.env.example`, and the write-up.
- The variant spec test proves the agent is not Car-hardcoded — a key rubric requirement.
- The pi-SDK rejection rationale (visibility, not licensing) must be documented honestly.
- Cost figures must come from T12's real trace data, not estimates.
