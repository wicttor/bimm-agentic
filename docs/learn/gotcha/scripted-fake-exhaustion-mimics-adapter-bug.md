---
slug: scripted-fake-exhaustion-mimics-adapter-bug
type: gotcha
domain: testing
applicability:
  current_project: 6
  general: 6
tags: [testing, fakes, tdd, offline]
created_at: 2026-09-04T20:20:00-04:00
updated_at: 2026-09-04T20:20:00-04:00
source:
  type: candidate
  reference: 2026-09-04-003-review#4
  extracted_at: 2026-09-04T20:20:00-04:00
confidence: high
summary: A scripted fake that throws when its replies run out surfaces a test-authoring mistake as an error from src/; keep the loud failure (it is what proves loop termination) and script one reply per expected model call.
related: [dry-run-zero-network-proven-by-injection-spies, fetch-stub-reinstall-serves-wrong-payload, sentinel-stub-red-gate-assertion-level]
---

# Loud Fake Exhaustion Reads Like a Production Bug

## Problem

A test built around an offline fake provider fails with something like
`FakeProvider exhausted its 1 scripted response(s) on call 2` — thrown from the **production** fake
module, with a stack pointing into `fake.ts`. The natural conclusion is that the fake is broken or
that the code under test is calling the model more often than intended. Both conclusions are usually
wrong: the test simply scripted fewer replies than the number of calls it makes.

## Trap

The trade-off being paid here is deliberate, and that is what makes the trap. A fake whose replies run
out has three possible behaviors:

| Behavior on exhaustion | Consequence |
| --- | --- |
| Return the **last** reply forever | Silently masks a loop that never terminates — a runaway iteration bug passes the test |
| Return an empty result | Produces vague downstream assertions ("expected undefined") that hide the real cause |
| **Throw a typed error naming the call index** (correct) | A test-scripting mistake surfaces as an error from production code — which is this trap |

The third is right *because* an agent loop's termination condition is exactly what the offline tests
exist to prove: a fake that keeps answering can never demonstrate that a loop stopped. But the error
is emitted from `src/`, so it points the reader at the wrong file. Worse, a test that calls the fake
more times than it declared is often an **unintended** extra call — the fake is reporting a real
discrepancy, in a message that reads like a bug report about the fake.

## Solution

Read the index in the message: `on call N+1` with `N` scripted replies means either (a) the test
under-scripted, or (b) the code under test made an extra model call. Decide which **before**
changing anything — case (b) is a genuine finding about loop behavior, and it is precisely the class
of bug the fake is designed to catch.

- (a) Add the missing scripted replies so count == expected calls.
- (b) Assert the call count explicitly rather than padding the script, so the extra call becomes the
  failing assertion instead of an exception.

## Prevention

- **Derive the script length from the expected call count**, never hand-match it: one reply per model
  call the scenario makes, including tool-result round-trips and any repair re-ask. A loop test with
  a 3-iteration budget declares 3 replies.
- Keep the exhaustion error's message carrying **both numbers** (`N scripted`, `call N+1`) — that pair
  is what distinguishes under-scripting from an extra call in one glance.
- In a loop/repair test, assert `fake.requests.length` (or equivalent) as a first-class expectation.
  The fake's recorded-request list exists for this: the count is a spec, not a side effect.
- Do not soften the fake to repeat its last reply to make a test pass — that deletes the very
  guarantee (termination) the fake provides.

## Related Learnings

- `dry-run-zero-network-proven-by-injection-spies` — why offline fakes exist here, and why a fake must
  record its requests rather than merely answering them.
- `fetch-stub-reinstall-serves-wrong-payload` — the companion trap: a harness mistake surfacing as a
  production-looking failure.
- `sentinel-stub-red-gate-assertion-level` — both keep "behavior absent" distinguishable from
  "harness broken".

## Source

`agent/tests/llm-adapters.test.ts` (task `2026-09-04-001-T03`, commit `be635ba`) — the
"records the requests it was given" scenario scripted 1 reply for 2 calls; `agent/src/llm/fake.ts`
raised the typed exhaustion error, which was the intended behavior all along.
