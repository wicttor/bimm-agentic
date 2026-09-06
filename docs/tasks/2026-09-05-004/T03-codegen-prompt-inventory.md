---
id: 2026-09-05-004-T03
title: "Code-gen prompt embeds boilerplate module inventory"
plan-id: 2026-09-05-004
unit: U2a
tier: deep
status: completed
priority: P0
dependencies: []
files:
  create: []
  modify:
    - agent/src/generator/prompts.ts
  test:
    - agent/src/generator/prompts.test.ts
estimated-effort: "3 hours"
timestamp: "2026-09-04T09:05:00-04:00"
---

# Code-gen prompt embeds boilerplate module inventory

## Goal

Give the code generator structured awareness of the modules already present in the copied boilerplate (`@/graphql/queries` documents, `@/graphql/client`, `@/mocks/*`, `@/types`, `App.tsx`/`main.tsx` wiring) so generated code imports and composes them instead of inventing hardcoded data layers.

## Acceptance Criterion

`buildCodePrompt` embeds a boilerplate module inventory read from the workspace cwd — including each inventoried path and the exported GraphQL document names (`GetCars`, `GetCar`, `AddCar`) — plus an explicit "import from existing modules, never recreate them; use `@/` alias" directive; a workspace without the boilerplate files falls back without crashing.

## Steps

1. **Red — Write the failing test:** in `agent/src/generator/prompts.test.ts`, add cases with a temp workspace fixture containing stub `src/graphql/queries.ts`, `src/mocks/data.ts`, `src/types.ts`: assert the prompt string contains those module paths, the `GetCars`/`AddCar` document names, and the never-recreate + `@/` directive. Second case: bare temp dir -> prompt still builds, no throw. Confirm red.
2. **Green — Implement:** add an inventory builder (path list + light export-name scan — regex on `export const NAME` / gql tag names is enough; no LLM) and splice the summary into `buildCodePrompt`. Keep the existing few-shot Example pair behavior.
3. **Refactor:** cap inventory size (paths + names only, no file bodies); ensure output is deterministic (sorted paths) so tests don't flake.

## Test Scenarios

- Fixture with stub graphql/mocks/types -> prompt contains each path + GetCars/GetCar/AddCar + never-recreate directive; no node_modules entries
- Bare fixture -> fallback prompt, no throw

## Acceptance Criteria

- [x] buildCodePrompt embeds the cwd module inventory + never-recreate directive; graceful fallback when absent

## Dependencies

- None

## Notes

- Learnings: `presence-only-assertions-survive-mutation` — assert exact substrings (document names), not "prompt is non-empty". `failure-feedback-loop-must-capture-every-gate` — inventory must also reach the retry prompt (T05 wires the gate; keep prompt builder shared).
- Resolve fixture paths from `import.meta.url` (learning `vitest-fixture-paths-resolve-from-cwd`).
