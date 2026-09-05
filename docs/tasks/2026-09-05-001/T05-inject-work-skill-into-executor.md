---
id: 2026-09-05-001-T05
title: "Scope the work skill to one task's Execute phase"
plan-id: 2026-09-05-001
unit: U3
tier: deep
status: completed
priority: P1
dependencies: [2026-09-05-001-T04]
files:
  create: []
  modify:
    - agent/src/skill-prompts.ts
    - agent/src/prompts/generator.ts
    - agent/tests/prompts.test.ts
  test:
    - agent/tests/prompts.test.ts
estimated-effort: "1 hour 30 minutes"
timestamp: 2026-09-05T16:40:00Z
---

# Scope the work skill to one task's Execute phase

## Goal

Execution should follow the project's documented work procedure — but the harness, not the model,
already owns triage, prepare and review bookkeeping.

## Acceptance Criterion

The per-task prompt carries the `work` skill scoped to that one task's Execute phase, forbids `docs/plans/.work/.triage|.prepare|.execute|.review` dumps, and passing `skillsDir: ""` renders a prompt with no skill block at all

## Steps

1. **Red — Write the failing test:** add to `agent/tests/prompts.test.ts`: the generator system turn contains `Workflow skill:`, `` `work` ``, `Phase module: execute`, `docs/plans/.work/.triage/`, `docs/plans/.work/.review/`, and `scoped to exactly one task`; and with `skillsDir: ""` it contains no `Workflow skill:` while still containing `Compiler options:`. Confirm the failures.
2. **Green — Implement:** add `workSkillBlock` beside `planSkillBlock` with Execute-only extra rules, and append it to `buildGeneratorPrompt`'s system turn.
3. **Refactor:** move the call-specific rules out of the duplicated generic ones so `extraRules` adds to, rather than repeats, the autopilot overrides.

## Test Scenarios

- Scoped: prompt text contains `scoped to exactly one task`
- Dumps forbidden: system contains `docs/plans/.work/.triage/` and `.review/`
- Escape hatch: `skillsDir: ""` -> no `Workflow skill:` in the system turn

## Acceptance Criteria

- [x] The per-task prompt carries the `work` skill scoped to that one task's Execute phase, forbids `docs/plans/.work/.triage|.prepare|.execute|.review` dumps, and passing `skillsDir: ""` renders a prompt with no skill block at all

## Dependencies

- 2026-09-05-001-T04: `buildSkillBlock` and the override renderer are created there

## Notes

- The model cannot run the suite from the sandbox (the scaffolded output has no `node_modules`), so the injected rule states Red → Green → Refactor as *file-write order* and says the harness validates afterwards.
- `SKILL_BLOCK_MAX_BYTES` (40 KB) bounds this block, since it repeats on every iteration of every task.
