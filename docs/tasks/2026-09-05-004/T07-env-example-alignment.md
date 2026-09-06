---
id: 2026-09-05-004-T07
title: "Root .env.example documents the LLM_* keys the agent reads"
plan-id: 2026-09-05-004
unit: U4b
tier: deep
status: completed
priority: P0
dependencies: []
files:
  create: []
  modify:
    - .env.example
  test:
    - agent/src/readme.test.ts
estimated-effort: "30 minutes"
timestamp: "2026-09-04T09:05:00-04:00"
---

# Root .env.example documents the LLM\_\* keys the agent reads

## Goal

Submission requirement #2: the `.env.example` must list exactly the keys the agent consumes. The agent reads `LLM_BASE_URL`/`LLM_API_KEY`/`LLM_MODEL` from `agent/.env`; the root template still advertises `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`, which nothing reads.

## Acceptance Criterion

Root `.env.example` documents `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL` (with a note to copy to `agent/.env`) and no longer contains `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`.

## Steps

1. **Red — Write the failing test:** extend `agent/src/readme.test.ts` (existing doc-certificate pattern) with a case reading the root `.env.example`: contains each `LLM_*` name and the `agent/.env` instruction; does NOT contain OPENAI*/ANTHROPIC* assignments. Confirm red.
2. **Green — Implement:** rewrite `.env.example` accordingly (values as placeholders; mirror `agent/.env.example`'s fail-fast note). Run to green.
3. **Refactor:** confirm `.gitignore` variants rule still covers `agent/.env` (learnings `dotenv-ignore-rule-must-cover-variants`, `env-file-convention-ships-gitignore-rule` — no change needed if already covered).

## Test Scenarios

- Doc assertion: .env.example -> contains LLM_BASE_URL/LLM_API_KEY/LLM_MODEL + 'agent/.env'; absence of never-read vendor keys

## Acceptance Criteria

- [x] Root .env.example lists exactly the keys the agent reads; doc test certifies it

## Dependencies

- None

## Notes

- Do not invent knobs the code never reads (learning `silent-vendor-default-reroutes-llm-traffic` note on LLM_TEMPERATURE).
