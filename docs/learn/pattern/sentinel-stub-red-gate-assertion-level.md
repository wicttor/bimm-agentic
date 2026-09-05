---
slug: sentinel-stub-red-gate-assertion-level
type: pattern
domain: testing
priority: important
applicability:
  current_project: 8
  general: 7
tags: [testing, tdd, vitest, type-safety]
created_at: 2026-09-04T20:20:00-04:00
updated_at: 2026-09-04T20:20:00-04:00
source:
  type: candidate
  reference: 2026-09-04-003-review#2
  extracted_at: 2026-09-04T20:20:00-04:00
confidence: high
summary: Satisfy a Red gate that demands an assertion failure (not an import/setup error) by creating modules as type-correct stubs that return an empty, well-shaped result, so the new test runs and fails on the acceptance-criterion assertions themselves.
related:
  [
    loose-casts-in-agent-tests-break-typecheck-wiring,
    test-config-isolation-behaviorally-not-regex,
    provider-agnostic-function-calling-five-wire-divergences,
  ]
---

# Sentinel Stubs Keep the Red Gate at Assertion Level

## Problem

A test-first gate that requires "the new test fails for the right reason — an assertion fires, **not**
a setup/import/compile error" is hard to satisfy literally on a task whose modules do not exist yet.
The obvious Red — write the test, run it, watch it fail — fails at _collection_
(`Cannot find module '../src/llm/anthropic.ts'`, `Tests: no tests`), which proves only that files are
missing. Two other tempting Reds are equally weak: a stub that throws
`NotImplementedError` makes the test die at the call site rather than on an assertion, and a stub
that already returns real values turns Red into a false pass.

## Pattern

Create the production modules as **sentinel stubs**: the full type surface exists and each
implementation compiles, but every behavior returns an **empty, well-shaped result**.

- Export the real interface and types so the test file itself typechecks.
- Give each class its final constructor signature and declare it `implements` the shared interface,
  so interface drift is caught by the compiler during Red, not discovered at Green.
- Make the unimplemented method resolve to the _empty member of the result type_ — e.g. an empty
  collection plus zero-filled counters and the neutral terminal value — never throw, never return
  `undefined`.

The test then runs to completion and fails on the acceptance-criterion **assertions**
(`expected undefined to be defined`, `expected [] to have length 1 but got +0`,
`expected 'stop' to be 'max_tokens'`). That failure list doubles as the specification: one entry per
AC scenario, all visibly unimplemented.

Run the import-level failure **first and separately**, purely as evidence that nothing was
pre-implemented, then record in the log that it was not the gate's payload. Three distinct Red
signals, three distinct meanings: _files missing_ (setup) → _behavior absent_ (assertions) →
_behavior present_ (Green).

## When to Apply

- Any test suite that is **typechecked** (so a test importing nonexistent modules cannot even run),
  and any harness that distinguishes an assertion failure from a compile/import failure.
- Whenever the AC has several independent clauses: the sentinel's empty result makes each clause
  fail separately, which is exactly the coverage proof you want before implementing.
- When the interface shape is itself part of the AC (substitutability, shared interface): stubbing at
  the type level pins that constraint from the very first run.
- **Not** when the task is to fix one behavior in an existing module — there Red is the single
  modified assertion, no scaffolding needed.

## Example

Task `2026-09-04-001-T03` (commit `be635ba`): `agent/src/llm/{anthropic,openai,fake}.ts` were created
as stubs whose `complete()` resolved
`{ toolCalls: [], usage: {inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0}, stopReason: "stop" }`.
The result (`agent/tests/llm-adapters.test.ts`, 18 tests): **18/18 failed on assertions, zero import,
setup, or compile errors** — then Green made all 18 pass with no test weakened in between. Had the
stubs thrown instead, Red would have reported 18 identical `NotImplementedError`s and proven nothing
about which AC clause any test checks.

## Related Learnings

- `loose-casts-in-agent-tests-break-typecheck-wiring` — the reason the stubs must be _type-correct_:
  the test file is typechecked, so a Red that only "runs under vitest" can still break a sibling
  suite.
- `test-config-isolation-behaviorally-not-regex` — same discipline, different object: assert observed
  outcomes, never the shape of source text.
- `provider-agnostic-function-calling-five-wire-divergences` — the entry whose adapter test this Red
  gate served.
