---
id: 2026-09-05-003-T01
title: "Give the CLI a stage grammar and an exit-code vocabulary"
plan-id: 2026-09-05-003
unit: U1
tier: deep
status: not-started
priority: P0
dependencies: []
files:
  create:
    - agent/tests/cli-stages.test.ts
  modify:
    - agent/src/config.ts
  test:
    - agent/tests/cli-stages.test.ts
estimated-effort: "2 hours"
timestamp: 2026-09-05T18:45:00Z
---

# Give the CLI a stage grammar and an exit-code vocabulary

## Goal

One CLI has to address three stages instead of one whole pipeline, and the driver needs to tell
"finished" apart from "stopped" without reading prose. This task adds the grammar and the codes; no
stage behaviour yet.

## Acceptance Criterion

`resolveConfig` accepts a leading subcommand (`plan`, `work`, `drive`, `trace`), defaults a bare `--spec` run to the `plan` stage, parses `--plan-id`, `--task`, `--gate validate|none`, `--no-commit`, `--force-add`, `--max-sessions`, and `agent/src/index.ts` exports the five exit codes (0, 2, 3, 4, 5) as named constants

## Steps

1. **Red — Write the failing test:** create `agent/tests/cli-stages.test.ts` asserting: `["--spec","x.md"]` resolves `stage: "plan"`; `["work","--plan-id","2026-09-05-003"]` resolves `stage: "work"` with that `planId`; `--gate none` → `gate: "none"`, `--gate bogus` → a config error naming `validate` and `none`; `--max-sessions 0` → an error naming the minimum, unset → 50; `--no-commit` and `--force-add` flip booleans; `--task` is accepted with `work`; and that `EXIT_OK/EXIT_CONFIG_ERROR/EXIT_GENERATION_ERROR/EXIT_TASK_BLOCKED/EXIT_QUEUE_EMPTY` are 0/2/3/4/5 and pairwise distinct. Confirm every case fails for a missing field or a missing export — not an import error.
2. **Green — Implement:** add `stage`, `planId`, `task`, `gate`, `commit`, `forceAdd`, `maxSessions` to `AgentConfig`; strip the leading subcommand in `resolveConfig` before `parseFlags` (defaulting to `plan` when argv[0] is not a known subcommand), extend `FLAG_NAMES`, reuse `parseIntegerFlag` for `--max-sessions`; export the two new constants from `agent/src/index.ts` alongside the existing three. Keep `trace` dispatching the way it does today so replay never breaks.
3. **Refactor:** keep `resolveConfig` pure — no I/O, no stage execution; a flag is resolved here and acted on in its own stage module.

## Test Scenarios

- Bare flags: `--spec x.md` → stage `plan`, `commit: true`, `gate: "validate"`
- Subcommand: `work --plan-id 2026-09-05-003` → stage `work`, `planId` carried
- Gate: `--gate none` accepted; `--gate bogus` rejected naming both valid values
- Budget: `--max-sessions 0` rejected; unset → 50
- Exit codes: five named constants, 0/2/3/4/5, distinct

## Acceptance Criteria

- [ ] `resolveConfig` accepts a leading subcommand (`plan`, `work`, `drive`, `trace`), defaults a bare `--spec` run to the `plan` stage, parses `--plan-id`, `--task`, `--gate validate|none`, `--no-commit`, `--force-add`, `--max-sessions`, and `agent/src/index.ts` exports the five exit codes (0, 2, 3, 4, 5) as named constants

## Dependencies

- None

## Notes

- The subcommand-before-`parseFlags` shape already exists for `trace` in `agent/src/index.ts`; this generalises it rather than inventing a parser.
- `agent/tests/config.test.ts` currently asserts `parseFlags` rejects unknown arguments — its "Unknown argument" message enumerates `FLAG_NAMES`, so widening the list changes that assertion. Read it before writing Red, and keep both tests green.
- `--dry-run` stays meaningful for every stage: it resolves config and exits before a provider is instantiated.
