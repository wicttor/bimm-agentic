---
id: 2026-09-05-001-T15
title: "Document the skill-driven pipeline and what a run skips"
plan-id: 2026-09-05-001
unit: U7
tier: deep
status: not-started
priority: P2
dependencies: [2026-09-05-001-T14]
files:
  create: []
  modify:
    - agent/README.md
    - agent/skills/README.md
  test: []
estimated-effort: "45 minutes"
timestamp: 2026-09-05T16:40:00Z
---

# Document the skill-driven pipeline and what a run skips

## Goal

A reviewer grading Prompt Engineering needs to see that the agent follows a documented workflow, and
the next contributor needs to know which files are generated versus hand-written.

## Acceptance Criterion

`agent/README.md` documents the plan→work wiring, the `--artifacts-dir` flag, the `.agents/skills` default for `--skills-dir`, and what a run deliberately does not write; `agent/skills/README.md` states that `when-to-use` is optional

## Steps

1. **Red — Write the failing test:** not test-first: documentation-only rollout task. State the assertions to check by eye — flag table contains `--artifacts-dir`, the pipeline section names both skills and autopilot, and the skills README no longer lists `when-to-use` as required.
2. **Green — Implement:** update the CLI flag table, the data-flow section (plan skill → task artifacts → work skill), the directory listing with `plan-artifacts.ts`, `work-artifacts.ts` and `skill-prompts.ts`, and add a 'What a run writes / skips' list.
3. **Refactor:** keep the README's cost and trace numbers honest — re-measure or mark them as pre-change.

## Test Scenarios

- Documented: README lists `--artifacts-dir` and the `.agents/skills` default
- Honesty: README names the skipped `.scope/.research/.design/.work` dumps and why

## Acceptance Criteria

- [ ] `agent/README.md` documents the plan→work wiring, the `--artifacts-dir` flag, the `.agents/skills` default for `--skills-dir`, and what a run deliberately does not write; `agent/skills/README.md` states that `when-to-use` is optional

## Dependencies

- 2026-09-05-001-T14: document the behaviour the offline proof pinned down

## Notes

- `agent/README.md`'s directory listing still names `tools/file-ops.ts` and `tools/inspect.ts`, which do not exist; fix them in passing or open a follow-up.
