---
slug: dry-run-zero-network-proven-by-injection-spies
type: pattern
domain: testing
priority: important
applicability:
  current_project: 8
  general: 7
tags: [testing, dependency-injection, network, agent-runtime]
confidence: high
summary: Prove "zero HTTP calls" structurally — an injectable createProvider seam whose spy counts instantiations plus a global fetch replacement that counts requests — instead of trusting a log line or waiting for a timeout.
created_at: 2026-09-04T23:15:00Z
updated_at: 2026-09-04T23:15:00Z
source:
  type: candidate
  reference: 2026-09-04-002-review#2
  extracted_at: 2026-09-04T23:15:00Z
related: [explicit-provider-missing-key-fails-no-fallback, spawn-real-cli-entry-in-tests]
---

# Prove Zero-Network Paths with Two Injection Spies

## Problem

ACs like "`--dry-run` completes with zero HTTP calls" and "missing config fails **before** any
network call" cannot be tested by inspecting results — a passing run that *did* hit the network is
indistinguishable from one that didn't without the right seams, and a test that merely waits/timeout
checks is flaky.

## Pattern

Make the property testable **by construction**, then assert two counters at zero:

1. **Instantiation spy** — the entry point accepts an injectable factory
   (`run(argv, { createProvider })`). The test injects a closure that increments a counter and
   returns a minimal fake. `creations === 0` proves short-circuiting *before* provider construction
   (the strongest form: no provider object exists, so no request is even possible).
2. **Request spy** — the test replaces `globalThis.fetch` with an async stub that increments a
   counter and throws. `httpCalls === 0` proves nothing went out even at the transport layer.
   Restore in `afterEach`.

The ordering in the implementation must place config/spec validation before any provider touch —
the spies then document the architecture rather than fighting it.

## When to Apply

- Any "offline path" AC: dry-run, `--help`, config validation, replay-from-trace (T12).
- Any assertion of the form "X must fail before side effect Y".

## Example

`agent/tests/config.test.ts` (T02) — `makeFakeProviderSpy()` + `armFetchSpy()` assert
`creations === 0` on the missing-key exit **and** on `--dry-run`, and `httpCalls === 0` on both.
Note the fake is **test-local**: the real `FakeProvider` is T03's file; a later task that needs the
same fake promotes it instead of duplicating the seam.

## Related Learnings

- `explicit-provider-missing-key-fails-no-fallback` — the config contract this pattern verifies.
- `spawn-real-cli-entry-in-tests` — complements it: in-process spies test logic, spawns test the
  real process contract.
