---
id: 2026-09-05-001-T04
title: "Run the plan skill from the planner prompt in autopilot"
plan-id: 2026-09-05-001
unit: U3
tier: deep
status: completed
priority: P1
dependencies: [2026-09-05-001-T03]
files:
  create:
    - agent/src/skill-prompts.ts
  modify:
    - agent/src/prompts/planner.ts
    - agent/tests/prompts.test.ts
  test:
    - agent/tests/prompts.test.ts
estimated-effort: "2 hours"
timestamp: 2026-09-05T16:40:00Z
---

# Run the plan skill from the planner prompt in autopilot

## Goal

The planner should follow the project's documented planning procedure instead of bespoke prose about
decomposition, while a run with no human still cannot pause, ask, or dump phase artifacts.

## Acceptance Criterion

The planner's system turn carries the `plan` skill verbatim plus overrides that pin `interactionMode: autopilot`, forbid asking the user anything, state that Phase 5 (Tasks) is never skipped, forbid writing `docs/plans/.scope/`, `.research/` and `.design/` — and the bare-JSON-array contract is restated after the skill body

## Steps

1. **Red — Write the failing test:** add to `agent/tests/prompts.test.ts`: the planner system turn contains `Workflow skill:`, `` `plan` ``, `Interaction mode: **autopilot**`, `never ask a question`, `Phase 5 (Tasks) is never skipped`, the three skipped dump directories, `Phase module: generate`, `Phase module: tasks`, and `indexOf("Final note on output format") > indexOf("Workflow skill:")`. Confirm they fail.
2. **Green — Implement:** create `skill-prompts.ts` with `buildSkillBlock` (discover → find → bundle → render overrides) and `planSkillBlock`, then append it to the planner system turn after the rendered rules and restate the output contract last.
3. **Refactor:** extract the override list into one helper with `durableOutputs` / `droppedArtifacts` per skill, and move the task-slicing constraints into a `planningConstraints()` block so the rule list stays readable.

## Test Scenarios

- Autopilot pinned: system contains `Interaction mode: **autopilot**` and `never ask a question`
- Dumps forbidden: system contains `docs/plans/.scope/`, `.research/`, `.design/` inside a 'Do NOT write' rule
- Precedence: the JSON-contract reminder appears after the skill body
- Provenance: skill-only phrasing (`Scope -> Research -> Design -> Generate -> Tasks`) reaches the prompt

## Acceptance Criteria

- [x] The planner's system turn carries the `plan` skill verbatim plus overrides that pin `interactionMode: autopilot`, forbid asking the user anything, state that Phase 5 (Tasks) is never skipped, forbid writing `docs/plans/.scope/`, `.research/` and `.design/`

## Dependencies

- 2026-09-05-001-T03: the block is a bundled skill body; without module inlining the planner gets a table of files it cannot open

## Notes

- Injection is append-only: the `CRITICAL: answer with ONLY a bare JSON array` rule and the forced `write_plan` call were hardened in commit `4e6c6a6` and must not be outranked.
- The skill's `## Skill Invocation` / `## Interaction Method` sections stay verbatim in the body; the numbered overrides sit above them and win.
