---
id: 2026-09-05-004-T09
title: "boot-check.mjs proves the generated app serves a rendered page"
plan-id: 2026-09-05-004
unit: U5b
tier: deep
status: completed
revision: 2026-09-04
priority: P1
dependencies:
  - 2026-09-05-004-T08
files:
  create:
    - agent/scripts/boot-check.mjs
    - agent/test/boot-check.test.ts
    - agent/test/fixtures/placeholder-app/
    - agent/test/fixtures/not-serving/
  modify:
    - agent/samples/output/README.md
    - agent/README.md
    - agent/tsconfig.test.json
  test:
    - agent/scripts/boot-check.mjs
    - agent/test/boot-check.test.ts
estimated-effort: "2 hours"
timestamp: "2026-09-04T09:05:00-04:00"
---

# boot-check.mjs proves the generated app serves a rendered page

## Goal

Add a reusable dev-boot probe: start the Vite dev server for a given project directory, fetch the served page, and assert it is an app shell (root mount present, placeholder text absent). This certifies AR-6 ("outputs a runnable project") mechanically — and is reused by T14 for the root project (G6).

## Acceptance Criterion

`node agent/scripts/boot-check.mjs agent/samples/output` starts the dev server on an ephemeral port, fetches `/`, asserts the HTML contains the root mount element and NOT the boilerplate placeholder string "Replace this with your generated components", kills the server, and exits 0; exits non-zero with a clear message when pointed at a directory that fails to serve.

## Steps

1. **Red — Write the failing check:** author the script's assertion core first and run it against the CURRENT (pre-T08) committed sample state copy or against a fixture dir containing the old placeholder `App.tsx` — confirm it exits non-zero for the right reason (placeholder present / server missing). (Script doubles as its own test; invoke it from a vitest case in `agent/test/` if the executor prefers a runner-integrated certificate.)
2. **Green — Implement:** spawn `npx vite --port 0` with cwd = argument dir, wait for the ready line, fetch the page, assert markers, terminate the child (no orphans), propagate exit code. Point it at the regenerated `agent/samples/output/` and confirm exit 0.
3. **Refactor:** add a `--expect <text>` flag (used by T14 for the root project) and document the script in `agent/samples/output/README.md` + `agent/README.md` quick start.

## Test Scenarios

- Placeholder fixture -> exit non-zero, message names the placeholder text
- Regenerated samples/output -> exit 0 after asserting mount + absence of placeholder

## Acceptance Criteria

- [x] boot-check.mjs exits 0 against agent/samples/output and fails loudly against a placeholder/broken app

## Revision Notes (2026-09-04)

- **No code changes to boot-check.mjs** — the script was already solid.
- **T08 revision unblocked T09:** The sample app now has a real composed shell (App.tsx uses useCars → Apollo/MSW), so boot-check correctly certifies it (11 app modules loaded).
- **tsconfig.test.json change validated:** The `test/fixtures` exclusion is necessary — fixture `.ts` files reference DOM types not in the agent's tsconfig lib set. Without the exclude, `tsc -p tsconfig.test.json` fails on fixture files. This is a legitimate prerequisite, not scope creep.
- **Gate evidence:** All 6 boot-check tests pass (placeholder rejection, not-serving rejection, sample app acceptance, --expect flag, no orphan servers). Agent typecheck 0, agent tests 172 passed + 5 skipped (SKIP_BOOT_CHECK=1).

## Dependencies

- 2026-09-05-004-T08: a real bootable app must exist to probe

## Execution Notes (T09, 2026-09-04, revised)

- **Files touched:** `agent/scripts/boot-check.mjs` (create), `agent/test/boot-check.test.ts`
  (runner-integrated certificate), `agent/test/fixtures/placeholder-app/` +
  `agent/test/fixtures/not-serving/` (fixtures), `agent/samples/output/README.md` +
  `agent/README.md` (docs), `agent/tsconfig.test.json` (exclude `test/fixtures`).
- **Why the module crawl:** `GET /` on a Vite dev server returns an un-rendered SPA shell, so an
  HTML-only check passes vacuously against a placeholder app. The probe crawls the served module
  graph from the page's module scripts and asserts on accumulated content.
- **tsconfig.test.json change:** The `test/fixtures` exclusion is necessary because fixture `.ts`
  files reference DOM types (`document.getElementById`) not in the agent's tsconfig lib set
  (`"lib": ["ES2022"]` without DOM). Without the exclude, `tsc -p tsconfig.test.json` fails on
  fixture files. This is a legitimate prerequisite for the fixtures to coexist with the typecheck
  gate.
- **Gate evidence (revised):** All 6 boot-check tests pass. Placeholder fixture → exit 1 naming
  `"Replace this with your generated components"` in `/src/app.ts`. Not-serving fixture → exit 2.
  Sample app → exit 0, 11 modules loaded. `--expect` two-sided verified. No orphan vite servers.
  Agent: 172 passed + 5 skipped (SKIP_BOOT_CHECK=1), typecheck 0.

## Notes

- Learning `prose-pipeline-steps-get-dropped`: "bootable" is only proven by this call site, not by prose in the README.
- Ensure process cleanup on signal (no orphan vite servers); use ephemeral ports to avoid 5173 conflicts.
