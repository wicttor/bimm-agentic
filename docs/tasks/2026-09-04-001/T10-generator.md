---
id: 2026-09-04-001-T10
title: "Generator: per-task tool-calling loop"
plan-id: 2026-09-04-001
unit: U9
tier: deep
status: not-started
priority: P1
dependencies: [2026-09-04-001-T05, 2026-09-04-001-T08, 2026-09-04-001-T09]
files:
  create:
    - agent/src/generate.ts
    - agent/src/agent-loop.ts
  modify: []
  test:
    - agent/tests/generate.test.ts
estimated-effort: "6 hours"
timestamp: 2026-09-04T22:00:00Z
---

# Generator: per-task tool-calling loop

## Goal
Produce each file through a bounded agent loop that requests tools and consumes their results. This is the inner loop — the per-task function-calling cycle where the model requests tools and the registry executes them.

## Acceptance Criterion
Running a task against `FakeProvider` drives real `write_file` tool calls that create the expected files in the output directory, and the loop terminates on the model's final non-tool response or at `--max-iterations`, surfaced as a typed failure and never as an unbounded hang.

## Steps
1. **Red — Write the failing test:** add `agent/tests/generate.test.ts` asserting: (a) happy path: provider emits `write_file` then done -> file on disk with returned content; (b) tool-error recovery: first `write_file` rejected for traversal, second accepted -> loop continues and file is written; (c) iteration cap: provider never terminates -> stops at the cap with a typed `max_iterations` failure; (d) dependency ordering: consumer task's prompt contains its dependency's generated contents. Run and confirm failure (generator/loop don't exist yet).
2. **Green — Implement:** create `agent/src/agent-loop.ts` (bounded tool-calling loop: send messages + tools to provider, execute tool calls via registry, feed results back, terminate on stop or cap), `agent/src/generate.ts` (per-task orchestration: build context via context builder, run agent loop, record trace).
3. **Refactor:** ensure the loop is cleanly separable from the provider (testable with `FakeProvider`); verify the `max_iterations` failure is typed, not a generic error; confirm dependency contents flow into later tasks' prompts.

## Test Scenarios
- Happy path: provider emits `write_file` then done -> file on disk with returned content
- Tool-error recovery: first `write_file` rejected for traversal, second accepted -> loop continues and file is written
- Iteration cap: provider never terminates -> stops at the cap with a typed `max_iterations` failure
- Dependency ordering: consumer task's prompt contains its dependency's generated contents

## Acceptance Criteria
- [ ] Running a task against FakeProvider drives real write_file tool calls creating expected files, and the loop terminates on final response or max-iterations as a typed failure

## Dependencies
- 2026-09-04-001-T05: Tool registry provides the tools the loop dispatches to
- 2026-09-04-001-T08: Planner provides the task list the generator iterates over
- 2026-09-04-001-T09: Context builder provides the per-task context the loop sends to the provider

## Notes
- This is the inner loop of the two-loop architecture (outer = deterministic orchestration, inner = per-task tool cycle).
- `FakeProvider` drives all offline testing — no API key needed for this task.
- Learning gap: LLM agent-loop orchestration — capture as a `pattern` learning after this task lands.
- Default `--max-iterations` is 8 (overridable).
