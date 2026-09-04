---
id: 2026-09-04-001-T01
title: "Sub-project wiring: agent tsconfig, vitest project, scripts, env contract"
plan-id: 2026-09-04-001
unit: U1a
tier: deep
status: not-started
priority: P0
dependencies: []
files:
  create:
    - agent/tsconfig.json
    - agent/vitest.config.ts
  modify:
    - package.json
    - vitest.config.ts
  test:
    - agent/tests/wiring.test.ts
estimated-effort: "4 hours"
timestamp: 2026-09-04T22:00:00Z
---

# Sub-project wiring: agent tsconfig, vitest project, scripts, env contract

## Goal
Establish `agent/` as an independently type-checked and independently tested TypeScript sub-project before any agent logic exists. This is the foundation that keeps agent code out of the app's compilation and test scope.

## Acceptance Criterion
`npm run typecheck` compiles only the app (`src/`), `npm run agent:typecheck` compiles only `agent/`, and `agent/**/*.test.ts` executes in a **node** environment that is never swept into the app's jsdom project.

## Steps
1. **Red — Write the failing test:** add `agent/tests/wiring.test.ts` asserting: (a) root `vitest.config.ts` pins `include` to `src/**` so `agent/tests/*.test.ts` is not collected by `npm run test`; (b) a deliberate type error inside `agent/src/` causes `npm run agent:typecheck` to fail while `npm run typecheck` still passes. Run the test and confirm it fails (config files and scripts don't exist yet).
2. **Green — Implement:** create `agent/tsconfig.json` (extends root or standalone, targeting the agent's `src/`), `agent/vitest.config.ts` (node environment, include `agent/tests/**`), add `agent:typecheck` script to root `package.json`, and pin root `vitest.config.ts` `include` to `src/**`. Use Node's `--env-file` (Node >= 20.6) for env loading — no `dotenv` dependency.
3. **Refactor:** verify both typecheck commands and both test commands run independently; clean up any path duplication in tsconfig extends chains.

## Test Scenarios
- Default-glob guard: root `vitest.config.ts` pins `include` to `src/**` -> `agent/tests/*.test.ts` is not collected by `npm run test`
- Isolation: a deliberate type error inside `agent/src/` -> `npm run typecheck` still passes while `npm run agent:typecheck` fails

## Acceptance Criteria
- [ ] `npm run typecheck` compiles only the app, `npm run agent:typecheck` compiles only `agent/`, and agent tests run in node environment separate from app's jsdom

## Dependencies
- None

## Notes
- The root `vitest.config.ts` currently declares **no `include`**, so its default glob would sweep agent tests into jsdom. Pinning it is a prerequisite, not optional cleanup.
- `.env` loading uses Node's `--env-file` (Node >= 20.6, verified locally) — no `dotenv` dependency.
- This is the first task; all subsequent agent tasks depend on this isolation working correctly.
