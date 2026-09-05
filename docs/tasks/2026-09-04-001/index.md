# Tasks Index

## 2026-09-04-001 — Build a CLI Agentic Code Generator (spec -> React+TS app)

### Phase 1: Foundation (deterministic; no API key needed)

- [x] T01 — Sub-project wiring: agent tsconfig, vitest project, scripts, env contract (`U1a`, AC: npm run typecheck compiles only app, npm run agent:typecheck compiles only agent, agent tests run in node) — `docs/tasks/2026-09-04-001/T01-sub-project-wiring.md`
- [x] T02 — CLI entry and config resolution (`U1b`, AC: CLI parses all flags and exits naming exact missing variable) — `docs/tasks/2026-09-04-001/T02-cli-entry-and-config.md`
- [x] T03 — Provider-agnostic LLM adapter (`U2`, AC: Anthropic/OpenAI adapters translate wire format against stubbed fetch, same interface as FakeProvider) — `docs/tasks/2026-09-04-001/T03-llm-adapter.md`
- [x] T04 — Scaffolder: boilerplate copy (`U3`, AC: copies app subset, excludes node_modules/agent/docs, refuses overwrite without --force) — `docs/tasks/2026-09-04-001/T04-scaffolder-boilerplate-copy.md`
- [x] T05 — Sandboxed tool registry (`U4`, AC: read_file/write_file/list_files confined to output dir, run_command allow-listed, rejections as structured errors) — `docs/tasks/2026-09-04-001/T05-sandboxed-tool-registry.md`
- [ ] T06 — Validation gate with structured error parsing (`U5`, AC: validator returns structured per-file errors covering strict flags, zero errors for untouched scaffold) — `docs/tasks/2026-09-04-001/T06-validation-gate.md`

### Phase 2: Agentic loop (LLM integration; driven offline by FakeProvider)

- [ ] T07 — Prompt library and contract enforcement (`U6`, AC: prompt builders render boilerplate rules by reading reference files, not duplicating prose) — `docs/tasks/2026-09-04-001/T07-prompt-library.md`
- [ ] T08 — Planner: spec to dependency-ordered task plan (`U7`, AC: planner returns validated topologically-sorted task list, rejects invalid with one re-ask, fails on cycles) — `docs/tasks/2026-09-04-001/T08-planner.md`
- [ ] T09 — Context builder with token budget (`U8`, AC: assembles contract + dependency outputs, elides to fit budget, never drops spec/rules, reports omissions) — `docs/tasks/2026-09-04-001/T09-context-builder.md`
- [ ] T10 — Generator: per-task tool-calling loop (`U9`, AC: FakeProvider drives real write_file calls, loop terminates on response or max-iterations as typed failure) — `docs/tasks/2026-09-04-001/T10-generator.md`
- [ ] T11 — Repair loop with bounded retries and stall detection (`U10`, AC: repair sends errors + offending files, applies edits, stops at max-retries or stall, exits non-zero) — `docs/tasks/2026-09-04-001/T11-repair-loop.md`
- [ ] T15 — Skill discovery and prompt injection (`U14`, AC: skills parsed from agent/skills/*/SKILL.md, indexed in prompts, bodies injected on when-to-use match, no-op without the dir) — `docs/tasks/2026-09-04-001/T15-skill-discovery-and-prompt-injection.md`

### Phase 3: Rollout and submission evidence

- [ ] T12 — Run trace, cost accounting, and offline replay (`U11`, AC: trace directory with plan.json, per-task records, validation output, and token/cost summary from usage fields) — `docs/tasks/2026-09-04-001/T12-run-trace.md`
- [ ] T13 — End-to-end demo run and committed sample output (`U12`, AC: one CLI invocation produces app where typecheck and test pass covering all six behaviors) — `docs/tasks/2026-09-04-001/T13-e2e-demo-run.md`
- [ ] T14 — Generalization check and architecture write-up (`U13`, AC: variant spec drives renamed files with no agent change, docs record architecture/tradeoffs/cost) — `docs/tasks/2026-09-04-001/T14-generalization.md`

## Work Report — 2026-09-04-001-review

- **Status:** complete
- **Work branch:** work/cli-agentic-code-generator
- **Tasks:** 1/1 completed, 0 for-review, 0 blocked, 0 skipped (scope: `2026-09-04-001-T01` only)
- **Gate decision:** Gate passed — clean regression check, no scope creep
- **Regression check:** clean
- **Scope creep:** none
- **Learnings to capture:** 4 (run `/learn` to persist)
- **Work Report:** docs/plans/.work/.review/2026-09-04-001-review.md

## Work Report — 2026-09-04-002-review

- **Status:** complete
- **Work branch:** work/cli-agentic-code-generator
- **Tasks:** 1/1 completed, 0 for-review, 0 blocked, 0 skipped (scope: `2026-09-04-001-T02` only)
- **Gate decision:** Gate passed — clean regression check, no scope creep
- **Regression check:** clean (app 2/2 · agent 18/18 · both typechecks exit 0)
- **Scope creep:** none (`package.json` untouched; no T03 files created)
- **Learnings to capture:** 4 (run `/learn` to persist)
- **Work Report:** docs/plans/.work/.review/2026-09-04-002-review.md

## Work Report — 2026-09-04-003-review

- **Status:** complete
- **Work branch:** work/cli-agentic-code-generator
- **Tasks:** 1/1 completed, 0 for-review, 0 blocked, 0 skipped (scope: `2026-09-04-001-T03` only)
- **Gate decision:** Gate passed — clean regression check, no scope creep
- **Regression check:** clean (app 2/2 · agent 36/36 · both typechecks exit 0)
- **Scope creep:** none (`index.ts`, `config.ts`, `package.json` untouched; only the 4 `files.create` paths + 1 test)
- **Test strength:** 3 injected wire-format defects all caught (schema key, system placement, retryability)
- **Learnings to capture:** 6 (run `/learn` to persist; closes the adapter half of the `llm-integration` gap)
- **Branch note:** T03 commits were merged/pushed to `main` mid-run by the repo's session-end automation; `main` = work branch = `585be34`, no rewrite (see Work Report)
- **Work Report:** docs/plans/.work/.review/2026-09-04-003-review.md

## Work Report — 2026-09-05-001-review

- **Status:** complete
- **Work branch:** work/cli-agentic-code-generator
- **Tasks:** 1/1 completed, 0 for-review, 0 blocked, 0 skipped (scope: `2026-09-04-001-T04` only)
- **Gate decision:** Gate passed — clean regression check, no scope creep
- **Regression check:** clean (app 2/2 · agent 55/55 · both typechecks exit 0; reference `src/` byte-identical to HEAD)
- **Test strength:** 10 injected defects all caught (clobber guard, segment exclusion, deep-copy, missing-source guard ×2, source-overlap guard, ancestor guard, copy-subset widening, reference-tree stray-write, fileCount). See Work Report mutation table.
- **Scope creep:** none (5 surfaced scope notes: `--force` CLI flag gap, source-overlap `invalid-output` guard, `missing-source` reason, `vite-env.d.ts` not copied → T06 risk, success-shape `copied`/`fileCount` fields — all carried forward with tests, never silently)
- **Learnings to capture:** 6 (run `/learn` to persist; closes the T04-scope half of the `fs-readonly-invariants` gap)
- **Incidents:** (1) my own M7 mutation ran `rm -rf /tmp` before the fixture root was nested — `/tmp` emptied ~00:50 UTC, repo untouched (git diff empty); (2) M8 left `src/.scaffolded` debris during mutation runs (now caught by whole-tree hash snapshot, cleaned manually before commit); (3) two of my git commit attempts raced in parallel, one absorbed by `index.lock`, no work lost — external automation shipped the staged test edits as `3b5ff83`
- **Work Report:** docs/plans/.work/.review/2026-09-05-001-review.md

## Work Report — 2026-09-05-002-review

- **Status:** complete
- **Work branch:** work/cli-agentic-code-generator
- **Tasks:** 1/1 completed, 0 for-review, 0 blocked, 0 skipped (scope: `2026-09-04-001-T05` only)
- **Gate decision:** Gate passed — clean regression check, no scope creep
- **Regression check:** clean (app 2/2 · agent 76/76 · both typechecks exit 0)
- **Test strength:** Red assertion-level (20/21); 3/3 guard mutations killed (confine, allow-list membership, byte cap); smuggle + no-leak + configurability asserted
- **Scope creep:** none (exactly `files.create` 3 + `files.test` 1 + task/index registration; deliberate `reject()` helper non-consolidation documented)
- **Learnings to capture:** 6 (run `/learn` to persist; opens the `path-sandbox-invariants` gap doc)
- **Carry-forward:** T06 consumes `execution_failed` details; T10 wires `executeTool`+`toToolMessage` into the loop
- **Incidents:** (1) entry tree carried a parallel T04-review session's uncommitted edits — surfaced to the user, committed as `db488c3`+`3b5ff83` before Triage, no silent carry; (2) none during execution
- **Work Report:** docs/plans/.work/.review/2026-09-05-002-review.md
