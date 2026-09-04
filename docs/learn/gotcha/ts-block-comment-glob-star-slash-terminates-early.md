---
slug: ts-block-comment-glob-star-slash-terminates-early
type: gotcha
domain: typescript
priority: normal
applicability:
  current_project: 8
  general: 7
tags: [typescript, testing, comments, vitest]
confidence: high
summary: A JSDoc/`/** */` block comment containing a glob like `agent/**/*.test.ts` embeds `*/`, which terminates the comment early and yields a baffling esbuild "Unexpected *" parse error.
created_at: 2026-09-04T23:10:00Z
updated_at: 2026-09-04T23:10:00Z
source:
  type: candidate
  reference: 2026-09-04-001-review#1
  extracted_at: 2026-09-04T23:10:00Z
related: [test-config-isolation-behaviorally-not-regex]
---

# TS Block Comments Silently Closed By Embedded Globs

## Problem

A TypeScript file fails to parse with an esbuild "Unexpected *" (or similar) error pointing at a
line inside what looks like a harmless doc comment. The error appears in vitest collection or
`tsc`, not at a logic site, so it reads as a tooling defect rather than a syntax one.

## Trap

`/** ... */` block comments terminate at the first `*/` — and glob patterns like
`agent/**/*.test.ts` contain `*/`. Writing such a glob inside a JSDoc comment closes the comment
prematurely; the remaining glob text and the intended real comment terminator then parse as code.
The compiler error points somewhere confusing, and nothing signals "you broke a comment."

## Solution

Read the parse-error location back into the comment text and hunt for an early `*/`. Move the
containing line to `//` line comments, or rephrase the glob (`agent/ ** /x.test.ts` is wrong — just
avoid embedding it), or escape it as `` `agent/**` + `/ *.test.ts` `` — the simplest fix is a
`//`-comment.

## Prevention

- Use `//` line comments for any text containing globs; reserve `/** ... */` for prose JSDoc.
- When an esbuild/parse error points inside a comment, suspect a `*/` in the commented text before
  suspecting the toolchain.
- Confirmed here in `agent/vitest.config.ts` / `agent/tests/wiring.test.ts` comment authoring
  (T01 Red/Green).

## Related Learnings

- `test-config-isolation-behaviorally-not-regex` — same T01 run; the wiring tests that caught this
  class of defect.

## Source

Task 2026-09-04-001-T01 (sub-project wiring), Red→Green; commit `e3b1561`.
