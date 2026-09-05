---
slug: provider-agnostic-function-calling-five-wire-divergences
type: pattern
domain: llm-integration
priority: important
applicability:
  current_project: 9
  general: 8
tags: [llm-integration, anthropic, openai, function-calling, adapters]
created_at: 2026-09-04T20:20:00-04:00
updated_at: 2026-09-04T20:20:00-04:00
source:
  type: candidate
  reference: 2026-09-04-003-review#1
  extracted_at: 2026-09-04T20:20:00-04:00
confidence: high
summary: Anthropic and OpenAI function calling diverge on five axes (system placement, tool-schema key, tool-args type, usage field names, stop vocabulary) and converge on two (retry policy, error classification) — normalize the five per adapter, share the two, and wire drift becomes one red unit test.
related: [explicit-provider-missing-key-fails-no-fallback, dry-run-zero-network-proven-by-injection-spies, sentinel-stub-red-gate-assertion-level]
---

# Provider-Agnostic Function Calling: Five Wire Divergences, One Interface

> **Scope of this entry — the plan's `llm-integration` learning gap is only half-closed.** The gap is
> *"Provider-agnostic function calling + token budgeting"*, to be captured after U2 **and** U8. This
> entry records the **adapter/function-calling** half (U2, `agent/src/llm/*`). **Token-budget-driven
> context trimming (U8, `agent/src/context.ts`) is still owed** — extend this entry when U8 lands;
> do not treat the gap as closed.

## Problem

A code-generating agent must drive at least two LLM APIs, and every one of them disagrees about how
a tool call is expressed. Writing the agentic loop against either provider's own types means the
loop forks on provider everywhere it touches a message, a tool result, a token count, or a
termination condition — and each fork is a place a mistake survives unit tests and dies only during
a demo with a real key.

## Pattern

Define **one internal vocabulary** and let each adapter own its wire format exclusively. The
interface is narrow: `messages + tool definitions in` → `text-or-tool-calls out`, i.e.
`complete(request) -> { text?, toolCalls[], usage, stopReason }`.

**The five axes where the providers genuinely diverge** (each needs a normalization rule, and each
is a separate assertion in the adapter test):

| Axis | Anthropic | OpenAI | Internal normalization |
| --- | --- | --- | --- |
| System prompt location | top-level `system` field | first message, `role: "system"` | one `system?: string` on the request; adapters place it |
| Tool schema key | `tools[].input_schema` | `tools[].function.parameters` | one `parameters` (JSON Schema) on `ToolDefinition` |
| Tool-argument payload | `input` — an **object** | `function.arguments` — a **JSON string** | `ToolCall.args` always an object; one shared parse path |
| Usage field names | `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens` | `prompt_tokens`, `completion_tokens`, `prompt_tokens_details.cached_tokens` | fixed 4-field `Usage`; missing counters default to 0 |
| Termination vocabulary | `end_turn` / `tool_use` / `max_tokens` | `stop` / `tool_calls` / `length` | `StopReason = stop \| tool_use \| max_tokens` |

Two further divergences worth naming, because they shape the **conversation** rather than one field:
tool calls ride on typed `content[]` blocks (`tool_use`, and results as a `user`/`tool_result`
block) versus a flat `choices[].message.tool_calls` array with a dedicated `role: "tool"` message;
and authentication is a header (`x-api-key` + explicit `anthropic-version`) versus
`authorization: Bearer`.

**The two axes where they do *not* diverge** — and therefore must not be re-implemented per
provider:

1. **Retry policy.** Both are plain HTTP: 429 and 5xx are retryable with bounded exponential
   backoff, 401/403 are fatal.
2. **Error classification.** Status-code → kind is provider-independent.

So put the transport, the backoff loop, and the error taxonomy in the shared module, **with a single
sleep site**, and keep only the five mappings in the adapter files. Retry semantics that live twice
drift apart silently.

**Normalize failure shape too, not just success shape.** Malformed tool arguments must surface as a
typed adapter error at *parse* time (`malformed_arguments`), never as an `undefined` field read two
hops downstream in the loop. One parse function serving both wire shapes guarantees the two
providers fail identically. And note `stopReason` describes how a **successful** call ended —
failures leave as the typed error, so the terminal-state enum needs no `error` member.

**Prove substitutability at compile time.** Declare each implementation `implements LlmProvider` and
bind all of them through one `LlmProvider`-typed collection in the test. The offline fake then cannot
drift from the real adapters without `typecheck` failing — which is the property that lets the rest
of the pipeline run with no API key.

## When to Apply

- Any integration with 2+ services that implement the same *concept* with different JSON shapes
  (LLM providers, payment gateways, search APIs).
- Whenever a loop needs provider-neutral **accounting** (tokens, cost) or **termination**
  (why did the model stop?) — these are the fields most likely to be silently absent per provider.
- When adding the third provider: the correct cost is one new adapter file and zero new loop
  branches. If a new provider forces an `if (provider)` in the loop, the internal vocabulary is
  missing a concept — extend it, don't fork the loop.
- When you need offline/deterministic tests of an agent loop: the same interface is what makes a
  scripted fake a drop-in.

## Example

`agent/src/llm/` (task `2026-09-04-001-T03`, commit `be635ba`):

- `provider.ts` — `Message` / `ToolDefinition` / `ToolCall` / `Completion` / `Usage` / `StopReason`,
  the `LlmProvider` interface, the `LlmError` taxonomy with **derived** `retryable`,
  `parseToolArguments` (one malformed-args path for both shapes), and `postJson` (shared transport +
  bounded backoff, single sleep site).
- `anthropic.ts` / `openai.ts` — *only* the five mappings; each ~200 LOC, no retry logic.
- `fake.ts` — `implements LlmProvider`, zero `fetch`, records every request.
- `agent/tests/llm-adapters.test.ts` — asserts the **observed request body** against a stubbed
  `fetch`, so each axis is independently pinned. Deleting either provider's `input_schema` vs
  `parameters` key turns exactly one test red — the drift the plan's risk table called
  "a failing unit test, not a demo-day outage."

## Related Learnings

- `explicit-provider-missing-key-fails-no-fallback` — the upstream config decision: which provider
  this adapter is built for, and the exact-variable failure before any network call.
- `dry-run-zero-network-proven-by-injection-spies` — how "no network" is *proven*; the fake provider
  is the structural half of that.
- `sentinel-stub-red-gate-assertion-level` — how the adapter test was driven Red before this
  translation existed.
