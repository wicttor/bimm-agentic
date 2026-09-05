---
id: 2026-09-04-001-T07
title: "Prompt library and contract enforcement"
plan-id: 2026-09-04-001
unit: U6
tier: deep
status: completed
priority: P1
dependencies: [2026-09-04-001-T03]
files:
  create:
    - agent/src/prompts/planner.ts
    - agent/src/prompts/generator.ts
    - agent/src/prompts/repair.ts
    - agent/src/prompts/exemplars.ts
  modify: []
  test:
    - agent/tests/prompts.test.ts
estimated-effort: "5 hours"
timestamp: 2026-09-04T22:00:00Z
---

# Prompt library and contract enforcement

## Goal
Make every model call structured and constrained — role, hard rules, few-shot exemplars, output contract. Rules are derived from the reference files, not duplicated as prose, so they stay in sync with the boilerplate.

## Acceptance Criterion
Each prompt builder renders the boilerplate's non-negotiable rules — import `GET_CARS`/`ADD_CAR` from `@/graphql/queries`, `Car` from `@/types`, use the `@/` alias, `__typename: "Car"` in fixtures, the 640/1024 breakpoint table, and the four strict-compiler flags — by reading them from the reference files rather than duplicating them as prose.

## Steps
1. **Red — Write the failing test:** add `agent/tests/prompts.test.ts` asserting: (a) generator prompt for a card component -> contains the `@/graphql/queries` rule and the `Example.tsx` exemplar; (b) planner prompt -> contains the task-JSON schema instruction and the "do not redefine queries/handlers" rule; (c) drift guard: a `Car` field removed from the fixture disappears from the rendered prompt (proves derivation, not hardcoding). Run and confirm failure (prompts don't exist yet).
2. **Green — Implement:** create `agent/src/prompts/planner.ts` (spec -> task-plan prompt with JSON schema), `agent/src/prompts/generator.ts` (per-task generation prompt with rules + exemplars), `agent/src/prompts/repair.ts` (error-context repair prompt), `agent/src/prompts/exemplars.ts` (reads boilerplate files to derive rules and exemplar content).
3. **Refactor:** ensure all rules are derived from files, not hardcoded; verify the prompt builders are composable and testable in isolation.

## Test Scenarios
- Generator prompt for a card component -> contains the `@/graphql/queries` rule and the `Example.tsx` exemplar
- Planner prompt -> contains the task-JSON schema instruction and the "do not redefine queries/handlers" rule
- Drift guard: a `Car` field removed from the fixture disappears from the rendered prompt (proves derivation, not hardcoding)

## Acceptance Criteria
- [x] Each prompt builder renders boilerplate rules by reading reference files rather than duplicating them as prose

## Dependencies
- 2026-09-04-001-T03: LLM adapter defines the message/tool types that prompt builders produce

## Notes
- The drift-guard test is critical: it proves rules are derived from files, not hardcoded strings.
- The 640/1024 breakpoint table and four strict-compiler flags must appear verbatim in generator prompts.
- This task is on the Phase 2 critical path — T08, T09, T10 all depend on it.

## Execution Notes (run 2026-09-05-004)

- **The brief attached to this run was not this file.** The request carried a much longer document
  under this path — with `## Files In Scope`, `## Open Q`, `## Risk-Level & Tier Justification`,
  `## What This Task Omits` and a `## Source Trace Matrix` — none of which exist in the file on disk
  (50 lines at entry), and whose *Open Q* asks how to derive breakpoints from `src/magic-drawer.ts`
  and how to surface an `EXCALIDRAW_PROMPT_STYLE` default from `src/ui.ts`. **Neither file exists in
  this repository**, and neither is named by the plan, the spec, or T04's app subset: that copy belongs
  to a different project's template. It
  was ignored; the on-disk task file, the plan's U6 block and `specs/car-inventory.md` drove the work.
  The two decisions it called "deferred" resolve against real files here, so nothing is left open:
  - **The breakpoint table is the fixture's own image dimensions.** `src/mocks/data.ts` ships the
    three responsive slots at `640x360`, `1023x576`, `1440x810`. Tiers are read by collecting every
    dimensioned image URL in the fixture, sorting by width, and giving each tier its own width as its
    ceiling and the tier below plus one pixel as its floor — that is where `640` and `1024` come from.
    No slot name (`mobile`/`tablet`/`desktop`) and no pixel value appears in the prompt library, so a
    variant spec that renames the slots or moves the widths re-derives the rule untouched (T14).
  - **The strict flags are read from `tsconfig.json` by shape.** An option counts when its name is
    `strict` or `no` + a capital and its value is `true`; `noEmit` is excluded because it silences
    output rather than tightening checks. On this boilerplate that yields **five** flags: the four the
    AC names, verbatim, plus `noFallthroughCasesInSwitch`, which the app really does enforce. Naming
    the fifth is the honest consequence of deriving rather than transcribing — a prompt that recited
    "four flags" while `tsc` enforced five would be exactly the failure this AC exists to prevent.
  - The genuinely open scope stays open: the `matchMedia`-stub token budget and max-prompt-length
    belong to T09/T15. `renderExemplars` caps a quoted file at 6k characters, which is an anti-crowding
    ceiling per file, not the token budget T09 owns.
- **`__typename` had to be read from the test exemplar, not the seed data.** The AC says "in fixtures",
  but `src/mocks/data.ts` carries no discriminator at all — `__typename: "Car" as const` exists only in
  `src/__tests__/Example.test.tsx`. Deriving from the file that demonstrates the convention means the
  rule disappears (with a warning) if the exemplar ever stops using one.
- **Anti-false-green: a rule that cannot be derived is announced, never silently dropped.** A missing
  reference file is fatal and names its path, because every downstream prompt would otherwise assert an
  unverified contract. A file that is present but yields nothing for one rule downgrades to a `warnings`
  entry, which `renderRules` prints into the prompt under "Rules that could not be derived": the model is
  told the contract is incomplete instead of being handed a quietly narrower one. The T06 gate's own
  reasoning is the model for this: an unmeasured contract must not read as a clean one.
- **`tsc` and vitest both accept code the agent's own runtime rejects.** `ReferenceFileError` was first
  written with a constructor parameter property — compiles clean, passes every test, because `tsc` only
  typechecks and vitest transpiles with esbuild — while the agent runs as `node agent/src/index.ts`
  under strip-only type removal, where a parameter property is a *syntax* error at load time. The suite
  now loads all four modules in a spawned `node` ("is loadable by the runtime that actually runs the
  agent"), the only guard for that class: the existing real-CLI spawn test reaches `index.ts` and
  `config.ts` alone, never the prompt modules.
- **Scope: `files.create` 4 + `files.test` 1, nothing else.** No `index.ts` wiring, no `plan-schema.ts`
  (T08), no tool definitions attached to the request (T10), no budget logic (T09). Two things are
  exported deliberately so downstream tasks reuse rather than restate them: `TASK_PLAN_JSON_SCHEMA`
  (T08 validates against the contract the prompt advertises) and `DerivedRules`/`renderRules` (T09/T10
  derive once, share one block across all three roles). `buildRepairPrompt` defaults `maxAttempts` to
  T02's `DEFAULTS.maxRetries` rather than repeating the number.
- **Test strength:** 57 AC tests, 12 injected defects — all caught, and the table re-run after the
  review-pass refactor (6 derivation, 6 builder; mutation table in the Execution Log, re-run counts in
  the Work Report). Drift is proven twice: against a synthetic temp tree and against a temp
  copy of the real boilerplate, each mutation read back from disk before its result is interpreted. The
  one assertion-level Red caveat: `exemplars.ts` was implemented before the sentinel-stub Red run (the
  builders' types depend on it), so 18 of the 49 red-gate tests were already green and 31 failed on
  assertions — the derivation half is covered by the mutation table instead.
