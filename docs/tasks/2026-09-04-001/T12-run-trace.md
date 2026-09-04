---
id: 2026-09-04-001-T12
title: "Run trace, cost accounting, and offline replay"
plan-id: 2026-09-04-001
unit: U11
tier: deep
status: not-started
priority: P2
dependencies: [2026-09-04-001-T10, 2026-09-04-001-T11]
files:
  create:
    - agent/src/run-log.ts
    - agent/tests/fixtures/*.json
  modify:
    - agent/src/run.ts
  test:
    - agent/tests/run-log.test.ts
estimated-effort: "5 hours"
timestamp: 2026-09-04T22:00:00Z
---

# Run trace, cost accounting, and offline replay

## Goal
Make the loop auditable for the reviewer and satisfy the cost write-up requirement. Each run writes a trace directory with plan, tool calls, validation output, and a cost summary summed from real provider `usage` fields.

## Acceptance Criterion
Each run writes a trace directory containing `plan.json`, per-task prompt/response and tool-call records, per-attempt validation output, and a summary whose total input/output tokens and estimated USD cost are summed from provider `usage` fields across every call.

## Steps
1. **Red — Write the failing test:** add `agent/tests/run-log.test.ts` asserting: (a) completeness: run against `FakeProvider` -> all four artifact kinds present and valid JSON; (b) cost math: two calls of 1000/500 tokens -> summary cost equals the model rate-table total; (c) failure path: run aborted mid-repair -> trace still written, status marked `failed`; (d) replay: a recorded fixture trace re-runs the pipeline with zero network. Run and confirm failure (run-log doesn't exist yet).
2. **Green — Implement:** create `agent/src/run-log.ts` (trace writer: creates `agent-runs/<timestamp>/` directory, writes `plan.json`, per-task records, per-attempt validation logs, `run.json` summary with token/cost totals), update `agent/src/run.ts` to integrate trace recording at each stage. Create fixture files under `agent/tests/fixtures/` for replay testing.
3. **Refactor:** ensure the trace directory is self-contained (can be inspected without the source code); verify cost math uses real provider `usage` fields, not text-length estimates; confirm the replay fixture works with zero network.

## Test Scenarios
- Completeness: run against `FakeProvider` -> all four artifact kinds present and valid JSON
- Cost math: two calls of 1000/500 tokens -> summary cost equals the model rate-table total
- Failure path: run aborted mid-repair -> trace still written, status marked `failed`
- Replay: a recorded fixture trace re-runs the pipeline with zero network

## Acceptance Criteria
- [ ] Each run writes a trace directory with plan.json, per-task records, per-attempt validation output, and a summary with token/cost totals summed from provider usage fields

## Dependencies
- 2026-09-04-001-T10: Generator must produce the per-task records the trace captures
- 2026-09-04-001-T11: Repair loop must produce the per-attempt validation logs the trace captures

## Notes
- Inspired by pi SDK's event-stream subscription (prior art, not a dependency).
- Cost is summed from provider `usage` fields — not estimated from text length.
- The trace directory is the reviewer's primary evidence of the loop's behavior.
- `run.json` carries: total input/output tokens, estimated USD cost, iteration counts, terminal status (`green` | `stalled` | `cap-exhausted` | `failed`).
