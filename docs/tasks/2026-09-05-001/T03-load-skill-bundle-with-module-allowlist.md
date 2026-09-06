---
id: 2026-09-05-001-T03
title: "Inline skill phase modules under a reported byte budget"
plan-id: 2026-09-05-001
unit: U2
tier: deep
status: completed
priority: P0
dependencies: [2026-09-05-001-T02]
files:
  create: []
  modify:
    - agent/src/skills.ts
    - agent/tests/skills.test.ts
  test:
    - agent/tests/skills.test.ts
estimated-effort: "1 hour 30 minutes"
timestamp: 2026-09-05T16:40:00Z
---

# Inline skill phase modules under a reported byte budget

## Goal

A skill's `SKILL.md` links its phases to module files; one LLM call cannot open them, so the modules
that matter for this call have to be inlined — bounded, and never silently truncated.

## Acceptance Criterion

`loadSkillBundle(meta, { modules, maxBytes })` appends the requested `<skillDir>/modules/<name>.md` bodies in the order asked with their frontmatter stripped, and reports every non-included module as `missing`, `over-budget` or `read-error` — and the repository's real `plan` and `work` skills bundle successfully

## Steps

1. **Red — Write the failing test:** extend `agent/tests/skills.test.ts`: requested modules appear as `#### Phase module: <name>` in request order with module frontmatter absent; a `maxBytes` below a module's size yields `omitted: [{name, reason: "over-budget"}]`; a name with no file yields `missing`; and `discoverSkills(".agents/skills")` bundles `plan`→[`generate`,`tasks`] and `work`→[`execute`]. Confirm the failures.
2. **Green — Implement:** derive the skill directory from `meta.filePath`, read each requested module, strip its frontmatter, and add it while the running byte total fits `maxBytes` (default `DEFAULT_SKILL_BUNDLE_MAX_BYTES`).
3. **Refactor:** de-duplicate requested module names while preserving order, and export `findSkill` so callers address a skill by id or name case-insensitively.

## Test Scenarios

- Order preserved: `["tasks","generate"]` -> `included === ["tasks","generate"]`
- Budget: 500-byte module, `maxBytes: 200` -> `omitted` names it with reason `over-budget`
- Missing: `absent` -> reason `missing`
- Real tree: `.agents/skills` -> `plan` and `work` both discovered and bundleable

## Acceptance Criteria

- [x] `loadSkillBundle(meta, { modules, maxBytes })` appends the requested `<skillDir>/modules/<name>.md` bodies in the order asked with their frontmatter stripped, and reports every non-included module as `missing`, `over-budget` or `read-error`

## Dependencies

- 2026-09-05-001-T02: bundling is pointless while the loader rejects skills without `when-to-use`

## Notes

- Byte budget, not token budget: 4 chars/token is the repo's own heuristic (`context.ts#estimateTokens`), and a byte cap keeps the maths exact.
- Learning applied: `docs/learn/gotcha/mutation-check-silent-noop-fakes-test-strength.md` — the omission tests assert the *reason*, not just the list length.
