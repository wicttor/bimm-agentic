---
id: 2026-09-05-007-T02
title: "Say the sandbox boundary once in the assembled executor prompt"
plan-id: 2026-09-05-007
unit: U2
tier: fast
status: not-started
priority: P1
dependencies: [2026-09-05-007-T01]
files:
  create: []
  modify:
    - agent/src/prompts/generator.ts
  test:
    - agent/tests/prompts.test.ts
estimated-effort: "30 minutes"
timestamp: 2026-09-05T20:15:00Z
---

# Say the sandbox boundary once in the assembled executor prompt

## Goal

`generator.ts` already carried a weaker copy of the boundary rule, which is why the contradiction was
hard to see. With the canonical rule authored in `skill-prompts.ts`, retire the duplicate and pin the
assembled prompt.

## Acceptance Criterion

The system prompt returned by `buildGeneratorPrompt` with the default (real) `.agents/skills` directory
states the sandbox boundary **exactly once** — the `executorSkillRules()` line "Do not create any
planning artifact under `docs/` yourself…" is gone from `agent/src/prompts/generator.ts` — and the
prompt still carries the `work` skill block, the Red → Green ordering rule, and every assertion the
existing generator describe-block in `agent/tests/prompts.test.ts` already makes.

## Steps

1. **Red — Write the failing test:** add a case to the generator-prompt describe block in
   `agent/tests/prompts.test.ts` that builds the prompt from the real `.agents/skills` dir and asserts:
   the boundary sentence occurs exactly once in `prompt.system` (count occurrences of a stable
   sentinel such as `"harness performs"`, rather than matching whole sentences); the text
   `"planning artifact under"` does not appear (the `generator.ts` duplicate is retired); and the
   prompt does not offer `"the task's status line in docs/tasks/"` to the model. Run it and confirm it
   fails because the duplicate is still present — an assertion failure, not an import failure.
2. **Green — Implement:** delete the duplicate rule from `executorSkillRules()` in
   `agent/src/prompts/generator.ts`, keeping the Red-ordering rule and the "harness runs the suite after
   your call" rules; adjust the surrounding comment so it describes what the list now carries.
3. **Refactor:** confirm `executorSkillRules()` still returns the remaining rules in a stable order and
   that no other test in the file pinned the deleted string.

## Test Scenarios

- Single statement: the boundary sentinel appears exactly once in the assembled system prompt
- No duplicate: the retired `generator.ts` sentence is absent from the prompt
- Unaffected: existing generator prompt assertions (autopilot mode, dropped `.work/` artifacts, `Phase module: execute`, one-task scoping) still pass

## Acceptance Criteria
- [ ] `buildGeneratorPrompt` states the sandbox boundary exactly once with the duplicate removed from `executorSkillRules()` — proven in `agent/tests/prompts.test.ts`

## Dependencies

- `2026-09-05-007-T01`: the canonical rule must exist in `skill-prompts.ts` before the local copy is
  removed, or the assembled prompt would end up stating no boundary at all.

## Notes

- Assert the count, not the wording. A `toContain` on the T01 sentence would pass with two copies,
  which is precisely the drift this task exists to prevent.
