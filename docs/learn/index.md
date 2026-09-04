---
type: "index"
title: "Learn Index"
description: "Central knowledge base for the project — decisions, patterns, gotchas, and workflows extracted by the /learn skill."
timestamp: "2026-09-04"
---

# Knowledge Index

The project's durable knowledge base. Source of truth for decisions, patterns,
gotchas, and workflows. Plan/Work/Review search this index via the YAML block.

**Last updated:** 2026-09-04T23:18:00Z

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
```

## By Category

### Decision (3)

| File | Title | Domain | Applicability |
|------|-------|--------|---------------|
| [agent-tsconfig-standalone-no-extends-app-root.md](decision/agent-tsconfig-standalone-no-extends-app-root.md) | Agent tsconfig Stands Alone, Never Extends the App Root | typescript | DIRECT |
| [node-ts-subproject-requires-types-node-package.md](decision/node-ts-subproject-requires-types-node-package.md) | Node TS Sub-projects Need `@types/node` (Types-Only Install) | typescript | DIRECT |
| [explicit-provider-missing-key-fails-no-fallback.md](decision/explicit-provider-missing-key-fails-no-fallback.md) | Explicit Provider Selection Never Falls Back on a Missing Key | config | DIRECT |

### Pattern (2)

| File | Title | Domain | Applicability |
|------|-------|--------|---------------|
| [test-config-isolation-behaviorally-not-regex.md](pattern/test-config-isolation-behaviorally-not-regex.md) | Test Config Isolation Behaviourally, Not by Regex-on-Config | testing | DIRECT |
| [dry-run-zero-network-proven-by-injection-spies.md](pattern/dry-run-zero-network-proven-by-injection-spies.md) | Prove Zero-Network Paths with Two Injection Spies | testing | DIRECT |

### Gotcha (2)

| File | Title | Domain | Applicability |
|------|-------|--------|---------------|
| [ts-block-comment-glob-star-slash-terminates-early.md](gotcha/ts-block-comment-glob-star-slash-terminates-early.md) | TS Block Comments Silently Closed By Embedded Globs | typescript | DIRECT |
| [loose-casts-in-agent-tests-break-typecheck-wiring.md](gotcha/loose-casts-in-agent-tests-break-typecheck-wiring.md) | Loose Casts in Agent Tests Fail a Sibling Suite, Not Just Their Own | typescript | RECOMMENDED |

### Workflow (1)

| File | Title | Domain | Applicability |
|------|-------|--------|---------------|
| [spawn-real-cli-entry-in-tests.md](workflow/spawn-real-cli-entry-in-tests.md) | Spawn the Real CLI Entry in Tests (No tsx, No New npm Scripts) | testing | DIRECT |

## By Domain

- **typescript:** ts-block-comment-glob-star-slash-terminates-early, agent-tsconfig-standalone-no-extends-app-root, node-ts-subproject-requires-types-node-package, loose-casts-in-agent-tests-break-typecheck-wiring
- **testing:** test-config-isolation-behaviorally-not-regex, dry-run-zero-network-proven-by-injection-spies, spawn-real-cli-entry-in-tests
- **config:** explicit-provider-missing-key-fails-no-fallback
