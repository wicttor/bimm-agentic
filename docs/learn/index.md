---
type: "index"
title: "Learn Index"
description: "Central knowledge base for the project — decisions, patterns, gotchas, and workflows extracted by the /learn skill."
timestamp: "2026-09-04"
---

# Knowledge Index

The project's durable knowledge base. Source of truth for decisions, patterns,
gotchas, and workflows. Plan/Work/Review search this index via the YAML block.

**Last updated:** 2026-09-04T20:20:00-04:00

## Entries

```yaml
entries:
  - filename: docs/learn/gotcha/ts-block-comment-glob-star-slash-terminates-early.md
    domain: typescript
    tags: [typescript, testing, comments, vitest]
    applicability: DIRECT
    summary: A /** */ block comment containing a glob like agent/**/*.test.ts embeds */, terminating the comment early and yielding a baffling esbuild parse error
  - filename: docs/learn/decision/agent-tsconfig-standalone-no-extends-app-root.md
    domain: typescript
    tags: [typescript, build-isolation, node, vitest]
    applicability: DIRECT
    summary: agent/tsconfig.json stays standalone — extending the app root would leak DOM libs, the React jsx transform, and the @/ alias into the node compilation unit
  - filename: docs/learn/pattern/test-config-isolation-behaviorally-not-regex.md
    domain: testing
    tags: [testing, vitest, typescript, config]
    applicability: DIRECT
    summary: Prove config isolation by running the real tooling (vitest list, DOM-global probe, type-error probe) and asserting outcomes, not by regex-matching config text
  - filename: docs/learn/decision/node-ts-subproject-requires-types-node-package.md
    domain: typescript
    tags: [typescript, node, dependencies, build-isolation]
    applicability: DIRECT
    summary: A node-targeted tsconfig with types ["node"] cannot tsc-check node:* imports without the @types/node devDependency — a types-only install that violates no runtime-dep constraint
  - filename: docs/learn/gotcha/loose-casts-in-agent-tests-break-typecheck-wiring.md
    domain: typescript
    tags: [typescript, testing, type-safety, vitest]
    applicability: RECOMMENDED
    summary: agent tests are typechecked, so a loose as-cast in a new test fails agent:typecheck and trips T01's wiring baseline — narrow discriminated unions instead of casting
  - filename: docs/learn/pattern/dry-run-zero-network-proven-by-injection-spies.md
    domain: testing
    tags: [testing, dependency-injection, network, agent-runtime]
    applicability: DIRECT
    summary: Prove zero-HTTP properties structurally with a createProvider instantiation spy plus a global fetch request spy, both asserted at zero
  - filename: docs/learn/decision/explicit-provider-missing-key-fails-no-fallback.md
    domain: config
    tags: [config, llm-integration, error-handling, cli]
    applicability: DIRECT
    summary: An explicit --provider/LLM_PROVIDER whose API key is absent fails naming the exact variable — never silently falls back to a provider whose key happens to exist
  - filename: docs/learn/workflow/spawn-real-cli-entry-in-tests.md
    domain: testing
    tags: [testing, cli, node, vitest]
    applicability: DIRECT
    summary: Test the real CLI contract by spawning node agent/src/index.ts with a scrubbed env (native type-stripping, no tsx), behind an isDirectExecution() guard
  - filename: docs/learn/pattern/provider-agnostic-function-calling-five-wire-divergences.md
    domain: llm-integration
    tags: [llm-integration, anthropic, openai, function-calling, adapters]
    applicability: DIRECT
    summary: Anthropic and OpenAI function calling diverge on five axes (system placement, tool-schema key, tool-args type, usage field names, stop vocabulary) and converge on two (retry policy, error classification) — normalize the five per adapter, share the two, and wire drift becomes one red unit test.
  - filename: docs/learn/pattern/sentinel-stub-red-gate-assertion-level.md
    domain: testing
    tags: [testing, tdd, vitest, type-safety]
    applicability: DIRECT
    summary: Satisfy a Red gate that demands an assertion failure (not an import/setup error) by creating modules as type-correct stubs that return an empty, well-shaped result, so the new test runs and fails on the acceptance-criterion assertions themselves.
  - filename: docs/learn/gotcha/fetch-stub-reinstall-serves-wrong-payload.md
    domain: testing
    tags: [testing, vitest, mocking, fetch]
    applicability: RECOMMENDED
    summary: Calling a global-fetch stub installer twice inside one test replaces the first stub instead of queueing, so an earlier client is silently served the later payload — install one stub that dispatches on request URL.
  - filename: docs/learn/gotcha/scripted-fake-exhaustion-mimics-adapter-bug.md
    domain: testing
    tags: [testing, fakes, tdd, offline]
    applicability: RECOMMENDED
    summary: A scripted fake that throws when its replies run out surfaces a test-authoring mistake as an error from src/; keep the loud failure (it is what proves loop termination) and script one reply per expected model call.
  - filename: docs/learn/gotcha/mutation-check-silent-noop-fakes-test-strength.md
    domain: testing
    tags: [testing, verification, review, mutation-testing]
    applicability: RECOMMENDED
    summary: A mutation check whose source edit silently fails to apply reports 'all tests passed', which reads as a test gap when nothing was mutated — assert the edit landed (diff/replace-count) before interpreting the result.
  - filename: docs/learn/workflow/recheck-branch-before-each-commit.md
    domain: version-control
    tags: [version-control, git, workflow, agent-runtime]
    applicability: RECOMMENDED
    summary: An external session-end automation in this repo checks out main, merges, and pushes mid-run, so the branch verified at Triage may not be current at commit time — re-read git branch --show-current immediately before every commit.
```

## By Category

### Decision (3)

| File | Title | Domain | Applicability |
|------|-------|--------|---------------|
| [agent-tsconfig-standalone-no-extends-app-root.md](decision/agent-tsconfig-standalone-no-extends-app-root.md) | Agent tsconfig Stands Alone, Never Extends the App Root | typescript | DIRECT |
| [node-ts-subproject-requires-types-node-package.md](decision/node-ts-subproject-requires-types-node-package.md) | Node TS Sub-projects Need `@types/node` (Types-Only Install) | typescript | DIRECT |
| [explicit-provider-missing-key-fails-no-fallback.md](decision/explicit-provider-missing-key-fails-no-fallback.md) | Explicit Provider Selection Never Falls Back on a Missing Key | config | DIRECT |

### Pattern (4)

| File | Title | Domain | Applicability |
|------|-------|--------|---------------|
| [test-config-isolation-behaviorally-not-regex.md](pattern/test-config-isolation-behaviorally-not-regex.md) | Test Config Isolation Behaviourally, Not by Regex-on-Config | testing | DIRECT |
| [dry-run-zero-network-proven-by-injection-spies.md](pattern/dry-run-zero-network-proven-by-injection-spies.md) | Prove Zero-Network Paths with Two Injection Spies | testing | DIRECT |
| [provider-agnostic-function-calling-five-wire-divergences.md](pattern/provider-agnostic-function-calling-five-wire-divergences.md) | Provider-Agnostic Function Calling: Five Wire Divergences, One Interface | llm-integration | DIRECT |
| [sentinel-stub-red-gate-assertion-level.md](pattern/sentinel-stub-red-gate-assertion-level.md) | Sentinel Stubs Keep the Red Gate at Assertion Level | testing | DIRECT |

### Gotcha (5)

| File | Title | Domain | Applicability |
|------|-------|--------|---------------|
| [ts-block-comment-glob-star-slash-terminates-early.md](gotcha/ts-block-comment-glob-star-slash-terminates-early.md) | TS Block Comments Silently Closed By Embedded Globs | typescript | DIRECT |
| [loose-casts-in-agent-tests-break-typecheck-wiring.md](gotcha/loose-casts-in-agent-tests-break-typecheck-wiring.md) | Loose Casts in Agent Tests Fail a Sibling Suite, Not Just Their Own | typescript | RECOMMENDED |
| [fetch-stub-reinstall-serves-wrong-payload.md](gotcha/fetch-stub-reinstall-serves-wrong-payload.md) | Re-installing a Global fetch Stub Silently Serves the Later Payload | testing | RECOMMENDED |
| [scripted-fake-exhaustion-mimics-adapter-bug.md](gotcha/scripted-fake-exhaustion-mimics-adapter-bug.md) | Loud Fake Exhaustion Reads Like a Production Bug | testing | RECOMMENDED |
| [mutation-check-silent-noop-fakes-test-strength.md](gotcha/mutation-check-silent-noop-fakes-test-strength.md) | A Mutation Check That Silently No-Ops Reports Fake Evidence | testing | RECOMMENDED |

### Workflow (2)

| File | Title | Domain | Applicability |
|------|-------|--------|---------------|
| [spawn-real-cli-entry-in-tests.md](workflow/spawn-real-cli-entry-in-tests.md) | Spawn the Real CLI Entry in Tests (No tsx, No New npm Scripts) | testing | DIRECT |
| [recheck-branch-before-each-commit.md](workflow/recheck-branch-before-each-commit.md) | Re-Verify the Checked-Out Branch Before Every Commit | version-control | RECOMMENDED |

## By Domain

- **typescript:** ts-block-comment-glob-star-slash-terminates-early, agent-tsconfig-standalone-no-extends-app-root, node-ts-subproject-requires-types-node-package, loose-casts-in-agent-tests-break-typecheck-wiring
- **testing:** test-config-isolation-behaviorally-not-regex, dry-run-zero-network-proven-by-injection-spies, spawn-real-cli-entry-in-tests, sentinel-stub-red-gate-assertion-level, fetch-stub-reinstall-serves-wrong-payload, scripted-fake-exhaustion-mimics-adapter-bug, mutation-check-silent-noop-fakes-test-strength
- **config:** explicit-provider-missing-key-fails-no-fallback
- **llm-integration:** provider-agnostic-function-calling-five-wire-divergences
- **version-control:** recheck-branch-before-each-commit
