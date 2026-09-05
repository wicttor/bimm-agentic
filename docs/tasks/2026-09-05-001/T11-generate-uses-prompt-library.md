---
id: 2026-09-05-001-T11
title: "Drive the loop from the prompt library and report what was written"
plan-id: 2026-09-05-001
unit: U6
tier: deep
status: completed
priority: P1
dependencies: [2026-09-05-001-T10]
files:
  create: []
  modify:
    - agent/src/generator.ts
    - agent/tests/generator.test.ts
  test:
    - agent/tests/generator.test.ts
estimated-effort: "1 hour 30 minutes"
timestamp: 2026-09-05T16:40:00Z
---

# Drive the loop from the prompt library and report what was written

## Goal

T07's prompt library was dead code: the loop built its own generic system turn, so the rules,
exemplars and the work skill never reached the model.

## Acceptance Criterion

`generate()` runs `buildGeneratorPrompt` (no ad-hoc system string), still applies the context token budget to dependency outputs, and reports which files a task wrote together with the task artifact it executed

## Steps

1. **Red — Write the failing test:** add to `agent/tests/generator.test.ts`: capture the provider request for a task and assert its system turn contains `Workflow skill:`, `` `work` `` and `Compiler options:`; assert `taskResults[0].writtenFiles` lists the test path before the implementation path; assert `taskResults[0].taskArtifact` is the artifact id passed in via `options.taskArtifacts`; and assert a dependency output excluded by the budget does not appear in the ask. Confirm the failures.
2. **Green — Implement:** build the request with `buildGeneratorPrompt`, filter dependency outputs by the context builder's reported omissions, map `content` -> `contents`, and collect `writtenFiles` from the loop's `write_file` tool calls.
3. **Refactor:** delete the superseded inline `taskPrompt` string and note the two `DependencyOutput` shapes at the mapping site.

## Test Scenarios

- Provenance: task request system turn contains the work skill and the derived rules
- Written files: `[src/X.test.tsx, src/X.tsx]` in tool-call order
- Budget: omitted dependency stays out of the user turn
- Handoff: `taskResults[i].taskArtifact` equals the `<plan-id>-T<NN>` path

## Acceptance Criteria

- [x] `generate()` runs `buildGeneratorPrompt` (no ad-hoc system string), still applies the context token budget to dependency outputs, and reports which files a task wrote together with the task artifact it executed

## Dependencies

- 2026-09-05-001-T10: the prompt builder this task calls is the one that became test-first

## Notes

- The implementation landed in the working tree before this task was written down, but **without its own
  assertion** — the gap this task existed to close (see `## Closed`).
- Learning applied: `docs/learn/pattern/test-config-isolation-behaviorally-not-regex.md` — assert on the rendered request, not on the source text.

## Closed

- 2026-09-05T17:56Z — `agent/tests/generator.test.ts` now carries a `Generator — prompt library, token budget and artifact
  handoff (2026-09-05-001-T11)` block: five scenarios (provenance, `skillsDir: ""` disables the skill block, written-file order,
  artifact handoff, budget-omitted dependency stays out of the ask).
- Mutation-checked, not assumption-checked: replacing the library system turn with an ad-hoc string, dropping `writtenFiles`,
  dropping `taskArtifact` and removing the budget filter each fail the new tests. No production change was needed.
- Gate: `npm run agent:typecheck` exit 0; `npm run agent:test` 288/288.
