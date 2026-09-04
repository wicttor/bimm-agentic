---
id: 2026-09-04-001-T02
title: "CLI entry and config resolution"
plan-id: 2026-09-04-001
unit: U1b
tier: deep
status: not-started
priority: P0
dependencies: [2026-09-04-001-T01]
files:
  create:
    - agent/src/index.ts
    - agent/src/config.ts
    - .env.example
    - specs/car-inventory.md
  modify: []
  test:
    - agent/tests/config.test.ts
estimated-effort: "4 hours"
timestamp: 2026-09-04T22:00:00Z
---

# CLI entry and config resolution

## Goal
Give the deliverable a runnable `--spec` entry point that resolves provider, model, and loop limits, and fails loudly before any network call when configuration is missing or invalid.

## Acceptance Criterion
The CLI parses `--spec`, `--out`, `--provider`, `--model`, `--max-retries`, `--max-iterations`, `--dry-run`, and exits with an error naming the exact missing variable (e.g. `ANTHROPIC_API_KEY`) instead of an ambiguous network failure when no key is present.

## Steps
1. **Red — Write the failing test:** add `agent/tests/config.test.ts` asserting: (a) full flags produce a typed config with documented defaults; (b) missing `ANTHROPIC_API_KEY` -> non-zero exit naming `ANTHROPIC_API_KEY`, zero requests; (c) unknown provider `--provider gemini` -> rejected listing supported providers; (d) `--dry-run` -> planning path completes with zero HTTP calls via `FakeProvider`; (e) `.env.example` names required env vars and no secret is committed. Run and confirm failure (CLI/config don't exist yet).
2. **Green — Implement:** create `agent/src/config.ts` (flag parsing, env validation, typed config with defaults), `agent/src/index.ts` (CLI entry with `--spec` parsing), `.env.example` (naming `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `LLM_PROVIDER`), and `specs/car-inventory.md` (sample spec).
3. **Refactor:** ensure error messages are specific and actionable; verify `--dry-run` short-circuits before any provider instantiation.

## Test Scenarios
- Full flags: `--spec specs/car-inventory.md --max-retries 2` -> typed config with documented defaults for the rest
- Missing key: no `ANTHROPIC_API_KEY` -> non-zero exit naming `ANTHROPIC_API_KEY`, zero requests attempted
- Unknown provider: `--provider gemini` -> rejected, listing supported providers
- Dry run: `--dry-run` -> the planning path completes with zero HTTP calls via `FakeProvider`
- Env contract: `.env.example` names `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `LLM_PROVIDER`, and no secret value is committed

## Acceptance Criteria
- [ ] CLI parses all flags and exits with an error naming the exact missing variable instead of an ambiguous network failure

## Dependencies
- 2026-09-04-001-T01: Agent sub-project must be wired (tsconfig, vitest, scripts) before CLI code can be compiled and tested

## Notes
- `LLM_PROVIDER` auto-detects from whichever API key is present.
- `--dry-run` uses `FakeProvider` — no network calls at all.
- Node >= 20.6 required for `--env-file` (verified locally on Node 26).
