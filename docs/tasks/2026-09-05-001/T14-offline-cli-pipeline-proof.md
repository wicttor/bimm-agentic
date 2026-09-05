---
id: 2026-09-05-001-T14
title: "Prove the two-skill pipeline end to end, offline"
plan-id: 2026-09-05-001
unit: U7
tier: deep
status: not-started
priority: P1
dependencies: [2026-09-05-001-T09, 2026-09-05-001-T11, 2026-09-05-001-T13]
files:
  create:
    - agent/tests/pipeline-skills.test.ts
  modify:
    - agent/src/index.ts
  test:
    - agent/tests/pipeline-skills.test.ts
estimated-effort: "2 hours"
timestamp: 2026-09-05T16:40:00Z
---

# Prove the two-skill pipeline end to end, offline

## Goal

The CLI is the interface; until one call provably produces plan → task files → executed code →
updated statuses, the feature is a pile of modules.

## Acceptance Criterion

One `run()` invocation with a scripted provider scaffolds, plans through the `plan` skill, writes the plan and task artifacts, executes every task through the `work` skill, and records outcomes — proven by an offline test that asserts the artifacts and their final statuses on disk

## Steps

1. **Red — Write the failing test:** create `agent/tests/pipeline-skills.test.ts` calling `run([...])` with `deps.createProvider` returning a `FakeProvider` scripted for one `write_plan` call plus per-task `write_file`/stop turns: assert exit 0, the plan file's `interactionMode: autopilot`, task artifacts at `status: completed` with boxes ticked, the index Work Report block, that request 1's system turn names the `plan` skill and a later request's names the `work` skill, and that no `.work/` directory was created. Confirm failures.
2. **Green — Implement:** adjust `orchestrate()` where the proof disagrees with it — ordering, the artifacts dir default, the plan-id allocation and the outcome mapping.
3. **Refactor:** fold the `writePlanArtifacts` failure path into a single logged error naming the reason, so a run with unwritable artifacts is obvious in the trace.

## Test Scenarios

- Offline run: exit 0, artifacts and statuses on disk, zero network
- Provenance: planner request system mentions `plan`, executor request mentions `work`
- Dry run: `--dry-run` still instantiates no provider and logs `mode=autopilot`
- Failure path: a task whose loop hit max-iterations ends `blocked`, exit 3

## Acceptance Criteria

- [ ] One `run()` invocation with a scripted provider scaffolds, plans through the `plan` skill, writes the plan and task artifacts, executes every task through the `work` skill, and records outcomes

## Dependencies

- 2026-09-05-001-T09: it asserts the artifact layout T09 registers
- 2026-09-05-001-T11: the executor prompt it proves is the library-built one
- 2026-09-05-001-T13: the report block is part of the expected end state

## Notes

- Implemented in the working tree (plan → artifacts → execute → bookkeeping in `index.ts`) but unproven end to end; this is the task that closes it.
- Learning applied: `docs/learn/gotcha/scripted-fake-exhaustion-mimics-adapter-bug.md` — script exactly plan + (iterations × tasks) responses.
- Learning applied: `docs/learn/pattern/dry-run-zero-network-proven-by-injection-spies.md` — provider spy proves no HTTP.
