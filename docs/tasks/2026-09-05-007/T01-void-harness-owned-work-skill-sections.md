---
id: 2026-09-05-007-T01
title: "Void the harness-owned sections of the injected work skill"
plan-id: 2026-09-05-007
unit: U1
tier: fast
status: completed
priority: P0
dependencies: []
files:
  create: []
  modify:
    - agent/src/skill-prompts.ts
  test:
    - agent/tests/skill-prompts.test.ts
estimated-effort: "1 hour"
timestamp: 2026-09-05T20:15:00Z
---

# Void the harness-owned sections of the injected work skill

## Goal

The injected `work` skill block orders the executor to check and self-heal `docs/tasks/`, register
indexes, and open a git branch — none of which its sandboxed tools can reach. Make the block say, in
its own binding overrides, which sections the harness performs around the call, and stop claiming a
`docs/` path as one of the call's durable outputs.

## Acceptance Criterion

`buildSkillBlock` for the `work` skill emits a binding override that voids the skill's
harness-owned sections by name (`Pre-Flight Check`, `Self-Healing`/`mkdir -p`, `Index Registration`,
`Work Report`, `Work Branch`/`git`) on the grounds that the model's `read_file`/`write_file`/
`list_files`/`run_command` are confined to the generated app's output directory, and the block's
"The durable outputs of this run are:" line for `work` names no path under `docs/` — while `buildSkillBlock`
for the `plan` skill emits neither that override nor a change to its own durable-output line.

## Steps

1. **Red — Write the failing test:** create `agent/tests/skill-prompts.test.ts`, a unit test of
   `buildSkillBlock` against a temp skills dir written by the test itself (so no fixture repo state is
   assumed): a `work/SKILL.md` whose body contains the Pre-Flight Check and Index Registration
   headings, and a `plan/SKILL.md`. Assert (a) the `work` block contains
   `"Pre-Flight Check"`, `"Index Registration"`, `"Work Branch"` and a `git`/branch mention inside its
   **### Binding overrides** section — i.e. at an index before `"### Skill body (verbatim)"`; (b) the
   `work` block states the confinement reason (assert `"output directory"` plus
   `"not_found"` or `"path_escape"`); (c) on the `"The durable outputs of this run are:"` line of the
   `work` block there is no occurrence of `"docs/"`; (d) the `plan` block does not contain the
   harness-owned override sentence. Run it and confirm the assertions fail on content, not on import
   — `buildSkillBlock` must already resolve, and the `work` block must already render.
2. **Green — Implement:** in `agent/src/skill-prompts.ts`, extend `autopilotOverrides` with a
   harness-owned-sections rule rendered **only** when the skill is `work` (key it off `meta.id`, the way
   the existing `isPlan` branch does), and drop
   `"the task's status line in docs/tasks/<plan-id>/index.md"` from the `work` `durableOutputs` list so
   that line carries `"the files named by the current task"` alone. Update the module comment: this is
   now a third thing the skills were not written for — a sandbox with one root.
3. **Refactor:** keep the rule a single string in the overrides array rather than a second rendering
   path, and leave `SKILL_BLOCK_MAX_BYTES` behaviour untouched. Do not touch
   `.agents/skills/work/SKILL.md` and do not touch `droppedArtifacts` for either skill — existing
   prompt tests pin those paths.

## Test Scenarios

- Work block, overrides section: names `Pre-Flight Check`, `Index Registration`, `Work Branch` and the confinement reason, all before the verbatim skill body
- Work block, durable-outputs line: contains no `docs/` path
- Plan block: unchanged — no harness-owned override, its `docs/…` durable outputs still present

## Acceptance Criteria
- [x] The rendered `work` skill block voids the harness-owned `docs/` and `git` sections by name with the sandbox-confinement reason, and its durable-output line names nothing under `docs/` — proven by `agent/tests/skill-prompts.test.ts`, with the `plan` block unaffected

## Dependencies

- None

## Notes

- The log line that motivated this task is produced by `listFilesTool` in `agent/src/tools/fs.ts:153`;
  that tool is behaving correctly and is not in scope.
- `agent/src/scaffold.ts:33` (`DEFAULT_EXCLUDE = ["node_modules", "agent", "docs"]`) is why
  `docs/tasks` can never exist inside the output directory. Do not "fix" it by including `docs`.
- The same class of failure exists for `git`: `run_command` allow-lists npm scripts only, so the
  skill's Work Branch step fails the same way. Voids cover it here rather than leaving a second log to
  chase later.
