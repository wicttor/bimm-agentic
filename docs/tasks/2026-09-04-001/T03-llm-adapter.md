---
id: 2026-09-04-001-T03
title: "Provider-agnostic LLM adapter"
plan-id: 2026-09-04-001
unit: U2
tier: deep
status: not-started
priority: P0
dependencies: [2026-09-04-001-T02]
files:
  create:
    - agent/src/llm/provider.ts
    - agent/src/llm/anthropic.ts
    - agent/src/llm/openai.ts
    - agent/src/llm/fake.ts
  modify: []
  test:
    - agent/tests/llm-adapters.test.ts
estimated-effort: "6 hours"
timestamp: 2026-09-04T22:00:00Z
---

# Provider-agnostic LLM adapter

## Goal
Normalize "messages + tool definitions in, text-or-tool-calls out" behind one interface, with Anthropic and OpenAI HTTP adapters plus an offline fake. This is the abstraction that lets 13 of 14 units run without an API key.

## Acceptance Criterion
`AnthropicProvider` and `OpenAIProvider` each translate internal request/response types to and from their wire format against a stubbed `fetch` (no network), and both satisfy the same interface as `FakeProvider`, including normalized `usage` token counts and a terminal `stopReason`.

## Steps
1. **Red — Write the failing test:** add `agent/tests/llm-adapters.test.ts` asserting: (a) Anthropic request maps internal tool defs -> `tools[].input_schema`, `system` hoisted to top level; (b) OpenAI request maps same input -> `tools[].function.parameters`, `role: "system"` message; (c) tool call response from each wire shape -> one internal `toolCall` with parsed JSON arguments; (d) malformed arguments `"arguments": "{bad json"` -> typed adapter error; (e) non-2xx 429 -> classified retryable, bounded backoff, then typed failure. Run and confirm failure (providers don't exist yet).
2. **Green — Implement:** create `agent/src/llm/provider.ts` (shared interface with `request(messages, tools) -> {text?, toolCalls[], usage, stopReason}`), `agent/src/llm/anthropic.ts` (Anthropic wire format adapter using global `fetch`), `agent/src/llm/openai.ts` (OpenAI wire format adapter), `agent/src/llm/fake.ts` (offline fake for testing and `--dry-run`).
3. **Refactor:** ensure the shared interface is narrow and clean; verify both adapters are symmetric in their internal type usage; confirm `FakeProvider` satisfies the exact same interface.

## Test Scenarios
- Anthropic request: internal tool defs -> `tools[].input_schema`, `system` hoisted to top level
- OpenAI request: same input -> `tools[].function.parameters`, `role: "system"` message
- Tool call response: each wire shape -> one internal `toolCall` with parsed JSON arguments
- Malformed arguments: `"arguments": "{bad json"` -> typed adapter error, not an undefined read
- Non-2xx: 429 -> classified retryable, bounded backoff, then a typed failure

## Acceptance Criteria
- [ ] AnthropicProvider and OpenAIProvider translate to/from wire format against stubbed fetch, both satisfying the same interface as FakeProvider with normalized usage and stopReason

## Dependencies
- 2026-09-04-001-T02: CLI config must resolve provider selection and API keys before adapters can be instantiated

## Notes
- Uses global `fetch` (Node >= 20.6) — no `node-fetch` or `axios` dependency.
- API versions sent explicitly in each request.
- The `FakeProvider` drives all offline testing for the rest of the pipeline.
- Learning gap: provider-agnostic function calling — capture as a `pattern` learning after this task lands.
