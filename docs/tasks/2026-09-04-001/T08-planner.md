---
id: 2026-09-04-001-T08
title: "Planner: spec to dependency-ordered task plan"
plan-id: 2026-09-04-001
unit: U7
tier: deep
status: not-started
priority: P1
dependencies: [2026-09-04-001-T05, 2026-09-04-001-T07]
files:
  create:
    - agent/src/plan.ts
    - agent/src/plan-schema.ts
  modify: []
  test:
    - agent/tests/plan.test.ts
estimated-effort: "5 hours"
timestamp: 2026-09-04T22:00:00Z
---

# Planner: spec to dependency-ordered task plan

## Goal
Decompose the spec into ordered, file-level generation tasks instead of one giant prompt. The planner uses a forced `write_plan` tool call to ensure structured output, not free text.

## Acceptance Criterion
Given a spec and a stubbed provider response, the planner returns a validated task list (`file`, `purpose`, `dependsOn`, `exports`) in topological order, rejects a schema-invalid response with exactly one corrective re-ask, and fails a plan whose dependencies form a cycle.

## Steps
1. **Red — Write the failing test:** add `agent/tests/plan.test.ts` asserting: (a) valid plan: 5-task JSON -> sorted so the hook precedes its consumers; (b) invalid JSON: prose instead of JSON -> one re-ask carrying the validation error, then success; (c) cycle: `A dependsOn B`, `B dependsOn A` -> planning fails naming the cycle members; (d) forced tool call: planner issues a `write_plan` tool call rather than free text. Run and confirm failure (planner doesn't exist yet).
2. **Green — Implement:** create `agent/src/plan.ts` (planner logic: builds prompt via prompt library, calls provider with forced `write_plan` tool, validates response, topologically sorts), `agent/src/plan-schema.ts` (JSON schema validation for the task-plan format).
3. **Refactor:** ensure the topological sort is deterministic (stable ordering for tasks at the same depth); verify the corrective re-ask carries the specific validation error.

## Test Scenarios
- Valid plan: 5-task JSON -> sorted so the hook precedes its consumers
- Invalid JSON: prose instead of JSON -> one re-ask carrying the validation error, then success
- Cycle: `A dependsOn B`, `B dependsOn A` -> planning fails naming the cycle members
- Forced tool call: planner issues a `write_plan` tool call rather than free text

## Acceptance Criteria
- [ ] Planner returns a validated, topologically-sorted task list from a stubbed provider, rejects invalid responses with one corrective re-ask, and fails on dependency cycles

## Dependencies
- 2026-09-04-001-T05: Tool registry provides the `write_plan` tool definition the planner forces
- 2026-09-04-001-T07: Prompt library provides the planner prompt with JSON schema and rules

## Notes
- The planner uses a forced tool call (`write_plan`) — not free text — to guarantee structured output.
- Cycle detection must name the cycle members in the error message for debuggability.
- This is the "outer loop" deterministic step — no LLM in the sorting/validation logic itself.
