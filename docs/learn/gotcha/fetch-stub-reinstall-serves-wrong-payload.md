---
slug: fetch-stub-reinstall-serves-wrong-payload
type: gotcha
domain: testing
applicability:
  current_project: 7
  general: 7
tags: [testing, vitest, mocking, fetch]
created_at: 2026-09-04T20:20:00-04:00
updated_at: 2026-09-04T20:20:00-04:00
source:
  type: candidate
  reference: 2026-09-04-003-review#3
  extracted_at: 2026-09-04T20:20:00-04:00
confidence: high
summary: Calling a global-fetch stub installer twice inside one test replaces the first stub instead of queueing, so an earlier client is silently served the later payload — install one stub that dispatches on request URL.
related: [dry-run-zero-network-proven-by-injection-spies, sentinel-stub-red-gate-assertion-level, scripted-fake-exhaustion-mimics-adapter-bug]
---

# Re-installing a Global fetch Stub Silently Serves the Later Payload

## Problem

A test that exercises two HTTP clients in sequence fails with a symptom that points squarely at the
first client's **response parser** — e.g. `expected undefined to be 'hello'`, because the parser
found no text field. The adapter code is correct. The failure rate is 1-in-N and it looks exactly
like a wire-format mapping bug, so the instinct is to go edit the adapter.

## Trap

The bug is in the test's stubbing helper. A helper of the form

```ts
function stubFetch(...responders) { globalThis.fetch = async (…) => {…} }
```

**replaces** `globalThis.fetch` every time it is called. Calling it twice inside one test to
"queue" two different payloads does not build a queue: after the second call there is exactly one
stub live, and it answers *both* clients. So the Anthropic client receives the OpenAI body and the
assertion that fails is downstream of a harness mistake.

Two properties make this especially easy to miss:

- The stub is global, so the wrong payload is delivered **silently** — nothing throws, and the
  request-recording array still shows one request per client, which looks like correct behavior.
- It only misfires when one test touches **more than one endpoint**. Tests with a single client pass,
  so the helper reads as proven.

## Solution

Install **one** stub per test and let it dispatch on the request itself. The URL is the natural key,
since it is what distinguishes the endpoints in the first place:

```ts
stubFetch((req) => (req.url.includes("anthropic") ? anthropicResponse : openaiResponse));
```

Two supporting conventions keep the recorder honest:

1. Return the recording array from the helper (`{ requests }`) and assert on it — the same object is
   still the live recorder after the responder becomes a function.
2. Restore the original in `afterEach`, and capture `globalThis.fetch` **once** at module load so a
   nested re-install cannot overwrite the value you intend to restore.

## Prevention

- **One stub installation per test.** If a test needs several payloads from the *same* endpoint
  (retry sequences), pass them as an ordered queue to the single installer — that is what the queue is
  for. If it needs payloads from *different* endpoints, dispatch on URL/method inside one installer.
- Treat "a test that calls my stub helper twice" as a lint-level smell: grep new test files for
  repeated installer calls inside one `it()`.
- When a cross-client assertion fails, **check which payload the stub returned before editing the
  client** — log the responder that fired. The asymmetry (client A parsed client B's shape) is the
  tell.
- Name the helper so its replace-semantics is unmissable (`replaceFetchStub` rather than
  `stubFetch`) if a queueing API is not provided.

## Related Learnings

- `dry-run-zero-network-proven-by-injection-spies` — the same global-fetch replacement technique, used
  to prove *zero* requests; this entry covers the failure mode when you instead use it to serve
  several payloads.
- `sentinel-stub-red-gate-assertion-level` — both concern getting the harness to state precisely
  which behavior is missing.
- `scripted-fake-exhaustion-mimics-adapter-bug` — the sibling trap on the fake-provider side: a
  harness mistake that reads as production-code corruption.

## Source

`agent/tests/llm-adapters.test.ts` (task `2026-09-04-001-T03`, commit `be635ba`) — two of eighteen
tests failed for this reason on the first Green run; the adapters were correct and the fix was
confined to the test file.
