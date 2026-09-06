---
id: 2026-09-05-004-T06
title: "Root vitest scoped to src/ so nested sample tests never run"
plan-id: 2026-09-05-004
unit: U4a
tier: deep
status: completed
priority: P0
dependencies: []
files:
  create:
    - agent/test/repo-vitest-scoping.test.ts
  modify:
    - vitest.config.ts
  test:
    - agent/test/repo-vitest-scoping.test.ts
estimated-effort: "1 hour"
timestamp: "2026-09-04T09:05:00-04:00"
---

# Root vitest scoped to src/ so nested sample tests never run

## Goal

Before U5 drops a full test tree into `agent/samples/output/`, pin the root project's vitest `include` to `src/**/*.test.*` (and keep agent-side runs clean), so one runner never collects another project's tests with foreign aliases.

## Acceptance Criterion

`npm run test` at repo root collects and executes only test files under `src/` and exits 0 — with `agent/` and `agent/samples/output/` present on disk.

## Steps

1. **Red — Write the failing test:** create `agent/test/repo-vitest-scoping.test.ts` that (a) reads the root `vitest.config.ts` text and asserts an explicit `include` of `src/**/*.test.{ts,tsx}`, and (b) spawns `npx vitest list --reporter=json` in the repo root and asserts every collected file path starts with `src/`. Confirm red (no include today).
2. **Green — Implement:** add the `include` (and `exclude` guard) to `vitest.config.ts`. Run to green.
3. **Refactor:** confirm the root suite still runs its own tests (`Example.test.tsx`) and the agent's config is untouched (its scoping already exists per prior learnings).

## Test Scenarios

- Config text -> explicit src-scoped include present
- vitest list at root -> zero collected files outside src/

## Acceptance Criteria

- [x] Root `npm run test` executes only src/ tests and passes with samples present

## Dependencies

- None

## Notes

- Learning `vitest-default-include-picks-up-nested-projects` is the direct motivation. Learning `fscp-filter-tests-absolute-paths`: spawn with explicit cwd resolved from `import.meta.url` (learning `vitest-fixture-paths-resolve-from-cwd`).
