---
slug: test-config-isolation-behaviorally-not-regex
type: pattern
domain: testing
priority: important
applicability:
  current_project: 8
  general: 7
tags: [testing, vitest, typescript, config]
confidence: high
summary: Prove build/test config isolation with observable outcomes (vitest list collection, absent DOM globals, a throwaway type-error probe failing exactly one tsc project), not by regex-matching config file text, which yields vacuous tests.
created_at: 2026-09-04T23:12:00Z
updated_at: 2026-09-04T23:12:00Z
source:
  type: candidate
  reference: 2026-09-04-001-review#3
  extracted_at: 2026-09-04T23:12:00Z
related: [agent-tsconfig-standalone-no-extends-app-root, spawn-real-cli-entry-in-tests]
---

# Test Config Isolation Behaviourally, Not by Regex-on-Config

## Problem

Isolation requirements ("the app test run must never collect agent tests"; "a type error in `agent/`
must not fail the app typecheck") are properties of **tool behavior**, not of config text. Asserting
on config strings creates vacuous tests that pass while the real pipelines overlap.

## Pattern

Assert the **outcome** of running the real tooling:

1. **Collection**: run `vitest list --reporter=json` and assert no `agent/**` file appears in the
   app project's output (behavior, not `include` text).
2. **Environment**: from inside an agent test itself, assert `globalThis.window === undefined` —
   if jsdom ever swept the file in, the assertion fails from within.
3. **Compile isolation**: write a throwaway probe file with a deliberate type error under
   `agent/src/`, run BOTH `npm run typecheck` (must exit 0) and `npm run agent:typecheck` (must
   fail, naming the probe), then self-clean the probe in `afterAll`.
4. A single narrow structural check is acceptable only as a cheap precondition guard (e.g., the
   root config declares *some* explicit `include`) — never as the isolation proof itself.

## When to Apply

- Any AC of the form "X is compiled/tested only by project Y, never by Z".
- Multi-project vitest/tsconfig setups; CI split of sub-projects; anything where a silent glob or
  `extends` change would re-merge two compilation units.

## Example

`agent/tests/wiring.test.ts` (T01) — 6 behavioral assertions implementing exactly this triad
(`vitest list`, DOM-globals probe, type-error probe with cleanup). The probe test is the strongest
of the three: it re-runs both real npm scripts and asserts their **exit codes**, so any future
config edit that re-couples the units turns this test red.

## Related Learnings

- `agent-tsconfig-standalone-no-extends-app-root` — the decision this pattern guards.
- `spawn-real-cli-entry-in-tests` — same philosophy applied to a CLI entry point.
