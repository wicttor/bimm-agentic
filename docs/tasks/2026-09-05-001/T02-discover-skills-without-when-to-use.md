---
id: 2026-09-05-001-T02
title: "Discover skills that carry no when-to-use trigger"
plan-id: 2026-09-05-001
unit: U2
tier: deep
status: completed
priority: P0
dependencies: [2026-09-05-001-T01]
files:
  create: []
  modify:
    - agent/src/skills.ts
    - agent/tests/skills.test.ts
  test:
    - agent/tests/skills.test.ts
estimated-effort: "45 minutes"
timestamp: 2026-09-05T16:40:00Z
---

# Discover skills that carry no when-to-use trigger

## Goal

The repository's own `.agents/skills/*` are invoked by name, not matched to a task, so the T15 gate
that made `when-to-use` required hid every skill the agent now needs.

## Acceptance Criterion

`discoverSkills` requires only `name` + `description`, returns `whenToUse: ""` when `when-to-use` is absent, and still skips (with a warning) a skill missing either required field

## Steps

1. **Red — Write the failing test:** add cases to `agent/tests/skills.test.ts`: a `SKILL.md` with only `name` + `description` must be discovered with `whenToUse === ""`; one with neither must be skipped with a warning naming the directory. Run the suite and watch the first case fail.
2. **Green — Implement:** drop `when-to-use` from the required-field check and default it to `""` when building `SkillMeta`.
3. **Refactor:** update the module header comment and `SkillMeta.whenToUse` docs to state the two selection styles (matched by condition, addressed by id).

## Test Scenarios

- Arreio frontmatter: `name` + `description` only -> discovered, `whenToUse === ""`
- Missing `description` -> not discovered, one `console.warn` naming the directory

## Acceptance Criteria

- [x] `discoverSkills` requires only `name` + `description`, returns `whenToUse: ""` when `when-to-use` is absent, and still skips (with a warning) a skill missing either required field

## Dependencies

- 2026-09-05-001-T01: the typecheck gate has to be clean before a prompt-behaviour change is measurable

## Notes

- Malformed-frontmatter skipping (no closing `---`) is unchanged and still covered.
- `agent/skills/README.md` documented the old required triple; T15 fixes the docs.
