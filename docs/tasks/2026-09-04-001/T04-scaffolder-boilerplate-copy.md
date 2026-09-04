---
id: 2026-09-04-001-T04
title: "Scaffolder: boilerplate copy"
plan-id: 2026-09-04-001
unit: U3
tier: deep
status: not-started
priority: P0
dependencies: [2026-09-04-001-T02]
files:
  create:
    - agent/src/scaffold.ts
  modify: []
  test:
    - agent/tests/scaffold.test.ts
estimated-effort: "3 hours"
timestamp: 2026-09-04T22:00:00Z
---

# Scaffolder: boilerplate copy

## Goal
Produce an isolated, runnable app copy the agent may mutate, without ever touching the reference `src/`. This ensures the boilerplate exemplars remain read-only throughout every generation run.

## Acceptance Criterion
Scaffolding copies the app subset (`src/`, `public/`, `index.html`, `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`) into the output directory, excludes `node_modules/`, `agent/`, `docs/` and any pre-existing output, and refuses to overwrite a non-empty output directory unless `--force` is passed.

## Steps
1. **Red — Write the failing test:** add `agent/tests/scaffold.test.ts` asserting: (a) fresh empty out dir -> `generated-app/src/types.ts` present, `generated-app/agent/` absent; (b) clobber guard: out dir already has `src/App.tsx` -> refuses; `--force` replaces; (c) read-only guarantee: reference `src/App.tsx` byte-identical after scaffolding. Run and confirm failure (scaffolder doesn't exist yet).
2. **Green — Implement:** create `agent/src/scaffold.ts` with a `scaffold(rootDir, outDir, options)` function that copies the boilerplate subset, applies exclusion filters, and enforces the clobber guard.
3. **Refactor:** ensure exclusion list is configurable; verify the copy is a deep copy (not symlinks); confirm `node_modules/`, `agent/`, `docs/` are never copied.

## Test Scenarios
- Fresh: empty out dir -> `generated-app/src/types.ts` present, `generated-app/agent/` absent
- Clobber guard: out dir already has `src/App.tsx` -> refuses; `--force` replaces
- Read-only guarantee: reference `src/App.tsx` byte-identical after scaffolding

## Acceptance Criteria
- [ ] Scaffolding copies the app subset into the output directory, excludes node_modules/agent/docs, and refuses to overwrite non-empty output without --force

## Dependencies
- 2026-09-04-001-T02: CLI config must resolve `--out` and `--force` flags before scaffolder can be invoked

## Notes
- The reference `src/` is **never written to** — this is a hard invariant across all units.
- `generated-app/` and the trace directory are disposable (gitignored except the one committed sample).
- This task is parallel-safe with T03 (no dependency between them).
