---
id: 2026-09-05-003-T11
title: "Publish the run's surface: derived --help plus the session docs"
plan-id: 2026-09-05-003
unit: U11
tier: deep
status: not-started
priority: P2
dependencies: [2026-09-05-003-T09, 2026-09-05-003-T10]
files:
  create:
    - agent/tests/cli-help.test.ts
  modify:
    - agent/src/index.ts
    - agent/README.md
    - docs/plans/architectures/cli-agentic-architecture.md
  test:
    - agent/tests/cli-help.test.ts
estimated-effort: "1 hour 30 minutes"
timestamp: 2026-09-05T18:45:00Z
---

# Publish the run's surface: derived --help plus the session docs

## Goal

The pipeline's contract is now its commands, flags, and exit codes. This task makes the CLI state that
contract itself — derived from the parser's own constants, so it cannot drift — and rewrites the two
documents that explain what a session is.

## Acceptance Criterion

`index.ts --help` prints the three stages, every flag in `FLAG_NAMES` and the five exit codes from the same constants `resolveConfig` and the stage dispatch use, and `agent/README.md` plus the architecture doc describe the same surface — stages with commands, exit-code table, `--gate`/`--no-commit`/`--force-add`/`--max-sessions`/`--plan-id`/`--task`, per-session trace naming `<plan-id>-<T NN>`, and the breaking redefinition of a bare `--spec` run with its migration line

## Steps

1. **Red — Write the failing test:** create `agent/tests/cli-help.test.ts`: assert `run(["--help"])` returns `EXIT_OK` and its logged output contains every string in `FLAG_NAMES` and each of the four subcommands — computed from the exported constants and the grammar, never a hand-copied list, so a flag added to `FLAG_NAMES` without a usage line fails this test; assert the output names all five exit codes and their meanings; assert a bad flag (`--gate bogus`) errors with the same two values the usage block advertises; and assert `--help` issues zero provider calls through the injection spy. Confirm the failures.
2. **Green — Implement:** add a `--help` flag and a usage renderer built from `FLAG_NAMES`, `SUPPORTED_PROVIDERS`, the gate values, and the `EXIT_*` constants; route it before `resolveConfig`'s spec requirement so help works with no spec. Replace the "Two-Loop Design" and "Data Flow" sections of `agent/README.md` with the stage table, the session diagram, the flag rows and the exit-code table; state where the commit lands, what a session may restore, and that the model cannot commit; carry the breaking change and its migration line (`drive --plan-id <id>`, or the two stages in sequence). Mirror the diagram in `docs/plans/architectures/cli-agentic-architecture.md`.
3. **Refactor:** one sentence per invariant, in one place — the queue is the index, the commit is the boundary, the tree must be clean at session start, dependencies come from disk. Correct the README's cost section, which still pre-dates skill injection and knows nothing about a per-task gate, and add the `Tradeoffs` row this plan bought: per-task commits pay a `typecheck` + `test` gate for resumability and revert.

## Test Scenarios

- Usage completeness: `FLAG_NAMES` ⊆ help output, and the four subcommands appear
- Codes: five exit codes named with their meanings
- Grammar coherence: the `--gate` error message and the usage block list the same values
- Help issues no provider call and needs no `--spec`

## Acceptance Criteria

- [ ] `index.ts --help` prints the three stages, every flag in `FLAG_NAMES` and the five exit codes from the same constants `resolveConfig` and the stage dispatch use, and `agent/README.md` plus the architecture doc describe the same surface — stages with commands, exit-code table, the six new flags, per-session trace naming `<plan-id>-<T NN>`, and the breaking bare-`--spec` change with its migration line

## Dependencies

- 2026-09-05-003-T09: the driver, its flags and its stop rules are what the usage block and the commands section describe
- 2026-09-05-003-T10: the retired one-process loop must be gone before the docs stop describing it

## Notes

- The prose itself stays review-verified — a markdown grep asserts a string exists, not that a command
  works (`docs/learn/pattern/test-config-isolation-behaviorally-not-regex.md`). What is machine-checked
  here is the *enumeration*: every flag and code the CLI accepts, printed from the grammar that accepts
  it. The README's tables are then checked against this output, not against anyone's memory.
- The provenance claim ("a planner request names the `plan` skill") lives in T10's proof; keep the
  README pointing there rather than restating it.
- Follow `docs/learn/gotcha/ts-block-comment-glob-star-slash-terminates-early.md` if the new usage
  module documents glob paths in a block comment.
