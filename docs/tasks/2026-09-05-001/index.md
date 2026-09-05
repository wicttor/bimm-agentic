---
plan-id: 2026-09-05-001
type: "task-index"
title: "The agent/ CLI runs the plan and work skills (autopilot, task files always)"
interactionMode: autopilot
timestamp: 2026-09-05T16:40:00Z
---

# Tasks — The agent/ CLI runs the plan and work skills

Task artifacts produced by the plan skill's Tasks phase (Phase 5, always run).
Execute with the work skill: `/work 2026-09-05-001` for the whole list, `/work 2026-09-05-001-T14` for one task.

## 2026-09-05-001 — The agent/ CLI runs the plan and work skills (autopilot, task files always)

- [x] T01 — Clear the pre-existing agent:typecheck failure (`U1`, AC: npm run agent:typecheck exits 0 (unused imports removed)) — `docs/tasks/2026-09-05-001/T01-green-baseline-agent-typecheck.md`
- [x] T02 — Discover skills that carry no when-to-use trigger (`U2`, AC: discoverSkills requires only name + description; whenToUse defaults to "") — `docs/tasks/2026-09-05-001/T02-discover-skills-without-when-to-use.md`
- [x] T03 — Inline skill phase modules under a reported byte budget (`U2`, AC: loadSkillBundle inlines requested modules and reports every omission) — `docs/tasks/2026-09-05-001/T03-load-skill-bundle-with-module-allowlist.md`
- [x] T04 — Run the plan skill from the planner prompt in autopilot (`U3`, AC: planner system carries the plan skill, autopilot overrides, and the JSON contract last) — `docs/tasks/2026-09-05-001/T04-inject-plan-skill-into-planner.md`
- [x] T05 — Scope the work skill to one task's Execute phase (`U3`, AC: per-task prompt carries the work skill, Execute-only, no .work dumps; skillsDir "" disables) — `docs/tasks/2026-09-05-001/T05-inject-work-skill-into-executor.md`
- [x] T06 — Widen the plan schema without splitting it from the validator (`U4`, AC: schema required set unchanged, optional keys declared, validator driven by the same object) — `docs/tasks/2026-09-05-001/T06-schema-driven-tasks-phase-validation.md`
- [x] T07 — Render the final plan document deterministically (`U5`, AC: plan document has the full field list, task-graph design, phased units, derived risks) — `docs/tasks/2026-09-05-001/T07-render-final-plan-artifact.md`
- [x] T08 — Write one task artifact per planned file (`U5`, AC: one task artifact per file with one AC, one test, Red->Green->Refactor, resolved dep ids) — `docs/tasks/2026-09-05-001/T08-write-task-artifacts-one-ac-per-task.md`
- [x] T09 — Register the plan and its task checklist idempotently (`U5`, AC: both indexes registered idempotently; allocatePlanId counts plans and task folders) — `docs/tasks/2026-09-05-001/T09-register-plan-and-task-indexes.md`
- [x] T10 — Give the executor its criterion and Red-before-Green order (`U6`, AC: per-task ask states the criterion and names the test file before the implementation) — `docs/tasks/2026-09-05-001/T10-executor-prompt-is-test-first.md`
- [ ] T11 — Drive the loop from the prompt library and report what was written (`U6`, AC: generate() uses buildGeneratorPrompt, honours the budget, reports writtenFiles + artifact) — `docs/tasks/2026-09-05-001/T11-generate-uses-prompt-library.md`
- [x] T12 — Record task outcomes forward-only in the artifacts (`U6`, AC: statuses/checkboxes/index ticks are forward-only; blocked records a reason) — `docs/tasks/2026-09-05-001/T12-forward-only-task-status-updates.md`
- [x] T13 — Close the run with one work report and no phase dumps (`U6`, AC: one Work Report block replaced in place; no .work/.scope/.research/.design dirs) — `docs/tasks/2026-09-05-001/T13-one-work-report-no-phase-dumps.md`
- [ ] T14 — Prove the two-skill pipeline end to end, offline (`U7`, AC: one run() call proves plan -> artifacts -> execute -> record, offline) — `docs/tasks/2026-09-05-001/T14-offline-cli-pipeline-proof.md`
- [ ] T15 — Document the skill-driven pipeline and what a run skips (`U7`, AC: READMEs document the wiring, --artifacts-dir, the new default, and what is skipped) — `docs/tasks/2026-09-05-001/T15-document-skill-driven-pipeline.md`

## Execution Notes

- 12 of 15 tasks landed before the plan was written down (implementation driven by the user's
  three decisions: wire the CLI code, drop the intermediate phase dumps, implement fully).
  Their status is `completed` because each has a green, named test in the suite.
- Open scope is T11 (missing assertion for the prompt-library wiring), T14 (offline end-to-end
  proof) and T15 (documentation). Run `/work 2026-09-05-001` to finish them.
- Gate state at plan time: `npm run agent:typecheck` exit 0; `npm run agent:test` 274/274.
