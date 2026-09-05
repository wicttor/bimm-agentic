---
plan-id: 2026-09-05-007
type: "task-index"
title: "Stop the injected work skill from ordering sandbox-impossible docs/ work"
interactionMode: autopilot
work-branch: work/skill-block-sandbox-boundary
timestamp: 2026-09-05T20:15:00Z
---

# Tasks — Stop the injected work skill from ordering sandbox-impossible docs/ work

Task artifacts produced by the work skill's Triage phase from an ad-hoc description
(`/work <task description>`), not by `/plan`. Execute with the work skill:
`/work 2026-09-05-007` for the whole list, `/work 2026-09-05-007-T01` for one task's
Red → Green → Refactor cycle.

## The run this came out of

The per-task executor call of the generation pipeline logged a structured tool failure:

```json
{ "code": "not_found", "message": "no directory at \"docs/tasks\" inside the output directory." }
```

The tool is right and the prompt is wrong. `agent/src/skill-prompts.ts` inlines
`.agents/skills/work/SKILL.md` **verbatim** into the executor's system prompt, and that body orders a
Pre-Flight Check over `docs/tasks/` with `mkdir -p` self-healing, names
`docs/tasks/<plan-id>/index.md` as a durable output of the run, and opens with `git` branch setup. The
executor's tools are confined to the generated app's output directory
(`agent/src/tools/fs.ts`), and `docs` is excluded from the scaffold outright
(`DEFAULT_EXCLUDE`, `agent/src/scaffold.ts`). So every one of those instructions is
unsatisfiable from inside the call: `list_files("docs/tasks")` fails `not_found`, a
`read_file`/`write_file` on `../docs/…` fails `path_escape`, and `run_command("git checkout -b …")`
fails the npm-script allow-list. The one contradiction that produced this log line — "don't touch
`docs/`" in `agent/src/prompts/generator.ts` against "own `docs/tasks/<plan-id>/index.md`" in the
verbatim skill body — is resolved in favour of the sandbox here, once, at the injection boundary.

`.agents/skills/work/SKILL.md` is **not** changed by this work. Its Pre-Flight Check and Index
Registration are correct for a human-orchestrated session with repository access; adapting them to a
sandboxed, non-interactive call is the injection layer's job.

## 2026-09-05-007 — Stop the injected work skill from ordering sandbox-impossible docs/ work

- [x] T01 — Void the harness-owned skill sections in the injected work block (`U1`, AC: the rendered `work` skill block states that Pre-Flight Check, Self-Healing mkdir, Index Registration, Work Report and Work Branch/git are the harness's because the tools are confined to the output directory, and its durable-output list names no path under `docs/`) — `docs/tasks/2026-09-05-007/T01-void-harness-owned-work-skill-sections.md`
- [x] T02 — Say the boundary once in the assembled executor prompt (`U2`, AC: the generator system prompt built from the real `.agents/skills` carries the boundary rule exactly once and contains no second copy of the `docs/` prohibition) — `docs/tasks/2026-09-05-007/T02-say-the-boundary-once-in-the-executor-prompt.md`

## Execution Notes

- **Run `npm run agent:typecheck && npm run agent:test` before and after each task.** Every assertion
  in this work is about rendered prompt text, so the suite that guards it is the agent suite, not the
  app suite.
- T01 owns the text of the boundary rule; T02 only removes the duplicate that `generator.ts` carried
  and pins the assembled result. Do the removal in T02, not early in T01 — existing assertions in
  `agent/tests/prompts.test.ts` (~lines 578–592) pin the `docs/plans/.work/…` dropped-artifact paths,
  which stay.
- Keep the sentinel matches short (`"Pre-Flight Check"`, `"Index Registration"`, `"Work Branch"`), per
  `docs/learn/gotcha/loose-casts-in-agent-tests-break-typecheck-wiring.md`: narrow the discriminated
  results instead of casting, and assert on stable words rather than whole sentences so a rephrased
  rule is not a false failure.
- Do not extend the boundary rule to the `plan` block: the planner call has no filesystem tools at all
  (only `WRITE_PLAN_TOOL`), so its `docs/…` durable outputs are already unreachable-but-harmless and
  are consumed by the harness.
