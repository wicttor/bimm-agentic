---
id: 2026-09-05-001-T15
title: "Document the skill-driven pipeline and what a run skips"
plan-id: 2026-09-05-001
unit: U7
tier: deep
status: completed
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

- [x] `agent/README.md` documents the plan→work wiring, the `--artifacts-dir` flag, the `.agents/skills` default for `--skills-dir`, and what a run deliberately does not write; `agent/skills/README.md` states that `when-to-use` is optional

## Dependencies

- 2026-09-05-001-T14: document the behaviour the offline proof pinned down

## Notes

- `agent/README.md`'s directory listing still names `tools/file-ops.ts` and `tools/inspect.ts`, which do not exist; fix them in passing or open a follow-up.

## Closed

- 2026-09-05T17:57Z — `agent/README.md`: new **Skill-Driven Pipeline: plan → work** section (which skill each call runs, which phase
  modules it inlines, what the prompts pin, and that the proof lives in `agent/tests/pipeline-skills.test.ts`) and a
  **What a run writes — and what it deliberately skips** section naming `.scope/`, `.research/`, `.design/`, `.work/.triage|.prepare|.
  execute|.review` and `docs/learn/` as skipped, with the reason. The Data Flow list now runs through the two skills and the artifact
  steps; the flag table gained `--artifacts-dir` (default `docs`) and the correct `--skills-dir` default (`.agents/skills`, was
  wrongly documented as `agent/skills`); `openrouter` added to providers, models and env vars; invocation switched from the absent
  `ts-node` to `npx tsx`; watch mode documented as a direct `npx vitest` call because no `agent:test:watch` script exists; the stale
  `tools/file-ops.ts` / `tools/inspect.ts` listing replaced with `tools/registry.ts`, `fs.ts` and `shell.ts`; the Cost Analysis numbers
  marked as pre-dating skill injection.
- 2026-09-05T17:57Z — `agent/skills/README.md`: `when-to-use` is now documented as **optional** (with `name` + `description` the only
  required pair, `whenToUse` defaulting to `""`, and name-invoked skills such as `plan` and `work` selecting by id instead of matching),
  the directory reference corrected to `.agents/skills`, and `<skillDir>/modules/<phase>.md` plus the reported-omission behaviour added.
- Documentation-only task, so the assertions are read by eye against the two files; the claims were checked against
  `agent/src/config.ts` (`DEFAULTS`), `agent/src/skill-prompts.ts` (`SKILL_BLOCK_MAX_BYTES`, module lists) and `agent/src/skills.ts`.
