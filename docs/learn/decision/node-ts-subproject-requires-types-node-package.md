---
slug: node-ts-subproject-requires-types-node-package
type: decision
domain: typescript
priority: normal
applicability:
  current_project: 9
  general: 8
tags: [typescript, node, dependencies, build-isolation]
confidence: high
summary: A node-targeted TypeScript sub-project with types:["node"] and lib:["ES2022"] cannot resolve node:* builtin imports in tsc without the @types/node devDependency — install it even though runtime code imports nothing extra.
created_at: 2026-09-04T23:13:00Z
updated_at: 2026-09-04T23:13:00Z
source:
  type: candidate
  reference: 2026-09-04-001-review#4
  extracted_at: 2026-09-04T23:13:00Z
related: [agent-tsconfig-standalone-no-extends-app-root]
---

# Node TS Sub-projects Need `@types/node` (Types-Only Install)

## Problem

Creating a standalone node-targeted tsconfig (`lib: ["ES2022"]`, `types: ["node"]`, no DOM) for a
sub-project, then running `tsc --noEmit`: every `node:fs` / `node:path` / `process` reference fails
to resolve, even though the **runtime** needs nothing installed.

## Solution

Add `@types/node` as a **devDependency** when the sub-project's tsconfig declares `types: ["node"]`.
It is a types-only package — zero runtime weight, no `dependencies` entry — so it does not violate
"no new runtime deps" constraints (e.g., the no-`dotenv` rule that shaped T01/T02 env loading).

## Decision Rationale

- Without it, the isolation AC ("`agent:typecheck` compiles only `agent/`") cannot pass at all:
  `tsc` cannot type-check `node:*` imports it has no ambient declarations for.
- Alternatives rejected: `skipLibCheck` doesn't help (the failure is unresolved module + missing
  `process` global, not lib-file checking); ambient hand-written stubs are unmaintainable.
- The distinction that settles the "but we said no deps" concern: **types package, dev-only** —
  mirrors how the app dev unit already gets `@types/react`.

## Application

- `package.json` devDependencies (`@types/node`, installed in T01).
- Applies to any future node sub-project in this repo; install at tsconfig-creation time, not when
  the first red `tsc` run appears.

## Related Learnings

- `agent-tsconfig-standalone-no-extends-app-root` — the config choice that makes this necessary.
