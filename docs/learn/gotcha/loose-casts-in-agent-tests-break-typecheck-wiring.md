---
slug: loose-casts-in-agent-tests-break-typecheck-wiring
type: gotcha
domain: typescript
priority: normal
applicability:
  current_project: 9
  general: 6
tags: [typescript, testing, type-safety, vitest]
confidence: high
summary: agent/tsconfig.json includes agent/tests/**, so a bad `as` cast in a test file fails agent:typecheck — which in turn fails T01's wiring test; narrow discriminated unions with `if (!result.ok) throw` instead of casting.
created_at: 2026-09-04T23:14:00Z
updated_at: 2026-09-04T23:14:00Z
source:
  type: candidate
  reference: 2026-09-04-002-review#1
  extracted_at: 2026-09-04T23:14:00Z
related: [agent-tsconfig-standalone-no-extends-app-root, test-config-isolation-behaviorally-not-regex]
---

# Loose Casts in Agent Tests Fail a Sibling Suite, Not Just Their Own

## Problem

A newly added `agent/tests/*.test.ts` passes its own vitest run, yet the *next* `npm run
agent:test` reports the OLD wiring test failing:
`agent and app typechecking are isolated > passes cleanly before the probe is introduced`.
The failure message is a wall of `TS2322`/`TS2352` from the new test file.

## Trap

Type errors are cross-cutting in this repo: `agent/tsconfig.json` compiles `agent/**` **including
the tests**, and `agent/tests/wiring.test.ts` executes `npm run agent:typecheck` as a behavioral
baseline assertion (per the config-isolation pattern). So any type mistake in a new test file —
typically a loose `as { config: Record<string, unknown> }` cast over a discriminated union, or a
hand-rolled duplicate of the real function signature — turns a green new suite into a red sibling
suite, pointing at code you didn't touch.

## Solution

Run `npm run agent:typecheck` **before** declaring Green (not just the AC test). Fix by deleting
the cast: narrow the union properly —

```ts
if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
const cfg = result.config; // typed AgentConfig, no cast
```

and let `loadModule()`'s return type be **inferred** from the dynamic imports instead of
re-declaring the function signatures.

## Prevention

- Never re-declare a production signature inside a test; import and narrow. A hand-written
  structural copy drifts the moment the real type uses interfaces (no index signature) or
  discriminated unions.
- Green gate for any agent task = AC test **and** both typechecks **and** the wiring test — the
  wiring test is a tripwire for exactly this trap.

## Related Learnings

- `agent-tsconfig-standalone-no-extends-app-root` — why tests are compiled at all.
- `test-config-isolation-behaviorally-not-regex` — the wiring test whose baseline assertion fires.

## Source

Task 2026-09-04-001-T02, Green gate (commit `253cdf9`): first 12/12 vitest pass still produced a
wiring-test regression via `agent:typecheck`.
