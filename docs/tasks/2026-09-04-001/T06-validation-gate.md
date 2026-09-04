---
id: 2026-09-04-001-T06
title: "Validation gate with structured error parsing"
plan-id: 2026-09-04-001
unit: U5
tier: deep
status: not-started
priority: P0
dependencies: [2026-09-04-001-T04, 2026-09-04-001-T05]
files:
  create:
    - agent/src/validate.ts
    - agent/src/parse-tsc.ts
    - agent/src/parse-vitest.ts
  modify: []
  test:
    - agent/tests/validate.test.ts
estimated-effort: "5 hours"
timestamp: 2026-09-04T22:00:00Z
---

# Validation gate with structured error parsing

## Goal
Convert real compiler and test output into typed, per-file error data the repair loop can act on. This is the most failure-prone seam in the design — the repair pass depends entirely on it.

## Acceptance Criterion
The validator runs `typecheck` and `test` inside the output directory and returns `{ tool, file, line, code, message }[]` covering the `noUncheckedIndexedAccess`, `noUnusedLocals`, and `noUnusedParameters` failure classes, and reports zero errors for the untouched scaffold.

## Steps
1. **Red — Write the failing test:** add `agent/tests/validate.test.ts` asserting: (a) clean: untouched scaffold -> `[]`, `ok: true`; (b) type fixture: `arr[i]` under `noUncheckedIndexedAccess` -> one error with correct project-relative file path; (c) test fixture: failing `vitest --reporter=json` output -> error mapped to its test file and assertion message; (d) missing deps: no `node_modules` in output dir -> actionable "run npm install" error, not a stack trace. Run and confirm failure (validator doesn't exist yet).
2. **Green — Implement:** create `agent/src/validate.ts` (orchestrates `typecheck` + `test` in output dir), `agent/src/parse-tsc.ts` (parses tsc diagnostics into `{ tool, file, line, code, message }[]`), `agent/src/parse-vitest.ts` (parses `vitest --reporter=json` output into same shape).
3. **Refactor:** ensure parsers handle edge cases (empty output, malformed JSON, missing fields); verify the four strict-compiler flags are covered; confirm the "missing deps" error is actionable.

## Test Scenarios
- Clean: untouched scaffold -> `[]`, `ok: true`
- Type fixture: `arr[i]` under `noUncheckedIndexedAccess` -> one error with the correct project-relative file path
- Test fixture: failing `vitest --reporter=json` output -> error mapped to its test file and assertion message
- Missing deps: no `node_modules` in output dir -> actionable "run npm install" error, not a stack trace

## Acceptance Criteria
- [ ] Validator runs typecheck and test in output dir and returns structured per-file errors covering noUncheckedIndexedAccess, noUnusedLocals, and noUnusedParameters, with zero errors for untouched scaffold

## Dependencies
- 2026-09-04-001-T04: Scaffolder must produce the output directory the validator runs commands in
- 2026-09-04-001-T05: Tool registry provides the `run_command` tool the validator uses to invoke typecheck/test

## Notes
- Learning gap: machine-readable validation output — capture as a `gotcha` learning after this task, recording concrete TS codes encountered.
- The four strict flags (`noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`, `strict`) are derived from the boilerplate's `tsconfig.json`, not hardcoded.
- This is the critical seam: if parsing is wrong, the repair loop cannot converge.
