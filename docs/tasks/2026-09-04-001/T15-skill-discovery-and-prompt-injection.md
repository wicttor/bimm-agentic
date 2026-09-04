---
id: 2026-09-04-001-T15
title: "Skill discovery and prompt injection (agent/skills/)"
plan-id: 2026-09-04-001
unit: U14
tier: deep
status: not-started
priority: P1
dependencies: [2026-09-04-001-T07, 2026-09-04-001-T09]
files:
  create:
    - agent/src/skills.ts
    - agent/skills/README.md
  modify:
    - agent/src/prompts/planner.ts
    - agent/src/prompts/generator.ts
    - agent/src/prompts/repair.ts
    - agent/src/config.ts
  test:
    - agent/tests/skills.test.ts
estimated-effort: "3 hours"
timestamp: 2026-09-04T23:07:11Z
---

# Skill discovery and prompt injection (agent/skills/)

## Goal
Let the agent use procedural skills from `agent/skills/<name>/SKILL.md` — discovered, indexed, and injected into prompts on demand — instead of hardcoding procedural knowledge in prompt builders. This mirrors the progressive-disclosure pattern this repository uses for its own `.agents/skills/` (plan, work, learn, review). Added in plan revision 1.1.

## Acceptance Criterion
The loader parses frontmatter (`name`, `description`, `when-to-use`) from each `SKILL.md`, renders a skill index (name + description only) into the planner/generator/repair system prompts, and injects the full body as procedural instructions only when a task's context matches `when-to-use`; a missing or empty `agent/skills/` directory is a no-op, and malformed frontmatter is skipped with a warning rather than aborting the run.

## Steps
1. **Red — Write the failing test:** add `agent/tests/skills.test.ts` asserting: (a) index: two fixture skills -> system prompt contains both names and descriptions, no body text; (b) injection: task matching a skill's `when-to-use` -> full `SKILL.md` body present in that task's generator prompt; (c) no-op: no `agent/skills/` dir -> prompts render identically to the U6 baseline (drift-guard still green); (d) malformed: one skill with bad frontmatter -> run continues, warning logged, other skills still indexed. Run and confirm failure (loader doesn't exist yet).
2. **Green — Implement:** create `agent/src/skills.ts` exporting `discoverSkills(skillsDir)` (parse frontmatter, return `SkillMeta[]`, skip malformed with warning) and `renderSkillIndex(metas)` / `loadSkillBody(meta)` helpers. Modify `agent/src/prompts/planner.ts`, `generator.ts`, `repair.ts` to append the skill index to the system prompt and, per task, inject matched skill bodies as a "Procedural skills" section. Add `--skills-dir` to `agent/src/config.ts` (default `agent/skills/`, resolved relative to repo root). Create `agent/skills/README.md` documenting the expected `SKILL.md` format (frontmatter `name`, `description`, `when-to-use`; body = procedural instructions).
3. **Refactor:** confirm matched-skill bodies flow through the U8 context builder's budget (they are droppable, low-priority content that can never displace the spec or hard rules); keep the no-skills path byte-identical to the U6 baseline so existing prompt tests stay green.

## Test Scenarios
- Index: two fixture skills -> system prompt contains both names and descriptions, no body text
- Injection: task matching a skill's `when-to-use` -> full `SKILL.md` body present in that task's generator prompt
- No-op: no `agent/skills/` dir -> prompts render identically to the U6 baseline (drift-guard still green)
- Malformed: one skill with bad frontmatter -> run continues, warning logged, other skills still indexed

## Acceptance Criteria
- [ ] Skills from `agent/skills/` are discovered, indexed in planner/generator/repair prompts, and injected on `when-to-use` match; missing/empty dir is a no-op and malformed frontmatter is skipped with a warning

## Dependencies
- 2026-09-04-001-T07: prompt builders must exist before the skill index/section can be woven into them
- 2026-09-04-001-T09: injected skill bodies must flow through the context builder's token budget as droppable content

## Notes
- Skill files are read at prompt-build time by the agent itself, NOT through the sandboxed tool registry (T05) — reading `agent/skills/` outside `generated-app/` is a deliberate read-only exception; do not route skill loading through the sandboxed `read_file` tool.
- Trust boundary: skills are repo-local, developer-authored files, not model output — but they must never override the hard rules or the spec (U8 budget ordering enforces this).
- The no-op guarantee matters: T01–T14 must still pass unchanged when `agent/skills/` does not exist.
