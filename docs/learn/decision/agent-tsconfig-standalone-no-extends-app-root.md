---
slug: agent-tsconfig-standalone-no-extends-app-root
type: decision
domain: typescript
priority: important
applicability:
  current_project: 9
  general: 7
tags: [typescript, build-isolation, node, vitest]
confidence: high
summary: The agent sub-project keeps a standalone agent/tsconfig.json rather than extending the root app tsconfig, because extending would leak DOM libs, the React jsx transform, and the @/ alias into a node-only compilation unit.
created_at: 2026-09-04T23:11:00Z
updated_at: 2026-09-04T23:11:00Z
source:
  type: candidate
  reference: 2026-09-04-001-review#2
  extracted_at: 2026-09-04T23:11:00Z
related: [node-ts-subproject-requires-types-node-package, test-config-isolation-behaviorally-not-regex]
---

# Agent tsconfig Stands Alone, Never Extends the App Root

## Problem

`agent/` must be a separately type-checked sub-project (`npm run agent:typecheck`) whose code never
compiles under the app's `tsc` config and vice versa — the app targets React/DOM (jsdom, `@/`
alias, `jsx: react-jsx`), the agent targets plain Node.

## Solution

`agent/tsconfig.json` is **standalone**: no `extends`. It mirrors the root's strict flags verbatim
(`strict`, `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`) but sets
`lib: ["ES2022"]`, `types: ["node"]`, no DOM, no `jsx`, no path aliases, `include: ["**/*"]`,
`noEmit: true`.

## Decision Rationale

- **Extending the root** would leak DOM `lib`, the React `jsx` transform, and the `@/*` path alias
  into the agent unit — the agent could then reference `window`/`document`/React idioms that don't
  exist in its node runtime, silently defeating the isolation the AC demands.
- **A shared base config** would force the app to inherit agent choices in the other direction;
  the two units must fail independently (T01's probe test proves a type error in `agent/src/` fails
  only `agent:typecheck`).
- Duplication cost is low: ~14 compiler options, and the strictness deliberately kept in lockstep
  because generated-app code quality mirrors it.

## Application

- `agent/tsconfig.json` (created T01) — the standalone config.
- Every later agent task (T02+) compiles against it; keep any new strict flag added to the root
  mirrored here.
- If a third compilation unit appears (e.g., CI scripts), decide the same question again rather
  than reflexively adding a base.

## Related Learnings

- `node-ts-subproject-requires-types-node-package` — the consequence of `types: ["node"]` here.
- `test-config-isolation-behaviorally-not-regex` — how the isolation is proven.
