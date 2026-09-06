---
id: 2026-09-05-003-T02
title: "Record and read back the run manifest in the task index frontmatter"
plan-id: 2026-09-05-003
unit: U2
tier: deep
status: not-started
priority: P0
dependencies: []
files:
  create:
    - agent/src/run-manifest.ts
    - agent/tests/run-manifest.test.ts
  modify:
    - agent/src/plan-artifacts.ts
    - agent/tests/plan-artifacts.test.ts
  test:
    - agent/tests/run-manifest.test.ts
estimated-effort: "1 hour 30 minutes"
timestamp: 2026-09-05T18:45:00Z
---

# Record and read back the run manifest in the task index frontmatter

## Goal

A `work` session starts hours later, in another process, possibly after a crash. It must reopen the run
from the artifacts alone — no re-typed flags, no guessing which `--out` the plan wrote into.

## Acceptance Criterion

`writePlanArtifacts` records `spec:`, `out:`, `provider:`, `model:` in `<artifactsDir>/tasks/<plan-id>/index.md` frontmatter and `readRunManifest()` returns them typed, naming every missing key in a failure that tells the operator which flag to pass

## Steps

1. **Red — Write the failing test:** create `agent/tests/run-manifest.test.ts` with a temp artifacts dir: round-trip (write four values, read them back identical); a hand-written legacy index — the shape already on disk for plans 2026-09-04-001 and 2026-09-05-001, which carries `plan-id`, `type`, `title`, `interactionMode`, `timestamp` and none of the four — returns a failure whose message names each missing key and the flag that supplies it; a file with no frontmatter fails the same way; and `readRunManifest` on a missing path reports the path. Confirm the failures at assertion level.
2. **Green — Implement:** create `agent/src/run-manifest.ts` with a `RunManifest` type, a `parseFrontmatter(text)` helper scoped to the leading `---` block (the same discipline `work-artifacts.ts::setFrontmatterStatus` already uses), and `readRunManifest(taskIndexPath): {ok:true; manifest} | {ok:false; missing: string[]; message: string}`. Extend the index renderer in `plan-artifacts.ts` to emit the four keys, threading `out`, `provider` and `model` through `WritePlanArtifactsInput` from the caller.
3. **Refactor:** keep the manifest a *default*, not a lock — `writePlanArtifacts` takes the values it is given and the work stage lets CLI flags override each one. A single source, explicit precedence.

## Test Scenarios

- Round trip: four keys written, four read back unchanged
- Legacy index: `missing: ["spec","out","provider","model"]`, message names `--out` and `--spec`, no throw
- No frontmatter / missing file: typed failure naming the path
- Idempotence: re-registering an existing plan does not duplicate the keys

## Acceptance Criteria

- [ ] `writePlanArtifacts` records `spec:`, `out:`, `provider:`, `model:` in `<artifactsDir>/tasks/<plan-id>/index.md` frontmatter and `readRunManifest()` returns them typed, naming every missing key in a failure that tells the operator which flag to pass

## Dependencies

- None

## Notes

- Fail-loud, never fall back: this mirrors `docs/learn/decision/explicit-provider-missing-key-fails-no-fallback.md`. Inferring `out` as `generated-app` for a plan that was written elsewhere would silently execute against the wrong tree.
- Values may contain `:` (absolute paths on Windows, model ids); split on the **first** `: ` only.
- The plan document already carries `spec:`; the index is the file `/work` and the driver read first, which is why the resume record lives there. Keep both and let neither be ambiguous.
