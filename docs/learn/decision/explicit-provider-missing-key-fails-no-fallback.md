---
slug: explicit-provider-missing-key-fails-no-fallback
type: decision
domain: config
priority: important
applicability:
  current_project: 9
  general: 7
tags: [config, llm-integration, error-handling, cli]
confidence: high
summary: When LLM_PROVIDER or --provider names a provider whose API key is absent, the CLI fails naming that exact variable (e.g. ANTHROPIC_API_KEY) rather than silently falling back to a provider whose key happens to be present.
created_at: 2026-09-04T23:16:00Z
updated_at: 2026-09-04T23:16:00Z
source:
  type: candidate
  reference: 2026-09-04-002-review#3
  extracted_at: 2026-09-04T23:16:00Z
related: [dry-run-zero-network-proven-by-injection-spies]
---

# Explicit Provider Selection Never Falls Back on a Missing Key

## Problem

Config resolution precedence is `--provider` flag → `LLM_PROVIDER` env → auto-detect from present
API keys. What should happen when an **explicit** selection names a provider whose key is missing,
while another provider's key happens to exist (e.g. `LLM_PROVIDER=anthropic` but only
`OPENAI_API_KEY` is set)?

## Solution

**Fail.** The error names the exact missing variable for the requested provider
(`Missing environment variable ANTHROPIC_API_KEY (required by provider "anthropic") …`) and exits
non-zero before anything is instantiated. The same loud failure applies with no keys at all
(auto-detect defaults to `anthropic`, so the error names `ANTHROPIC_API_KEY`).

## Decision Rationale

- An explicit selection is user intent; silently switching providers changes which model, cost
  table, and prompt contracts the run uses — the worst time to discover that is after hours of
  generated output graded against the wrong provider's behavior.
- The README/AC demand "an error naming the exact missing variable instead of an ambiguous network
  failure" — a fallback is *another* ambiguity, just pre-network.
- Auto-detect (nothing explicit set) remains forgiving — Anthropic-first among present keys —
  because there, no user intent is being overridden.
- This rule was caught mid-Green: the initial T02 test encoded the wrong expectation (env=anthropic
  + only OpenAI key → pass); the test was corrected **against the AC**, not the implementation.

## Application

- `agent/src/config.ts` — `resolveProvider()` + the key check after it; the
  `ANTHROPIC_API_KEY`-naming assertion in `agent/tests/config.test.ts`.
- T03 adapters and T13 e2e runs inherit this contract; error text should keep naming the exact
  variable and the provider that requested it.

## Related Learnings

- `dry-run-zero-network-proven-by-injection-spies` — how the "before any network call" half of
  this rule is enforced.
