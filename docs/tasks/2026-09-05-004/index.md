---
type: "index"
title: "Tasks Index — 2026-09-05-004"
description: "Task breakdown for plan 2026-09-05-004 (Finish the Agentic Car Inventory Manager — Spec-Driven Regeneration). One task per acceptance criterion, test-driven, dependency-ordered."
timestamp: "2026-09-04T09:05:00-04:00"
---

# Tasks — Plan 2026-09-05-004

## 2026-09-05-004 — Finish the Agentic Car Inventory Manager — Spec-Driven Regeneration

- [x] T01 — Full-coverage sample spec parses with image fields and no phantom entities (`U1a`, AC: parseSpec returns Car with mobile/tablet/desktop fields, zero phantom entities) — `docs/tasks/2026-09-05-004/T01-full-coverage-spec-image-fields.md`
- [x] T02 — Sample spec demands all seven functional requirements (`U1b`, AC: parsed requiredFeatures ≥ 7 statements covering FR-1–FR-7 demands) — `docs/tasks/2026-09-05-004/T02-spec-fr-coverage.md`
- [x] T03 — Code-gen prompt embeds boilerplate module inventory (`U2a`, AC: buildCodePrompt includes inventory paths + doc names + never-recreate directive, graceful fallback) — `docs/tasks/2026-09-05-004/T03-codegen-prompt-inventory.md`
- [x] T04 — Planner prompt carries the inventory so tasks target existing structure (`U2b`, AC: planner prompt contains inventory + reuse directive; shared builder) — `docs/tasks/2026-09-05-004/T04-planner-prompt-inventory.md`
- [x] T05 — Validator adds npm run build gate with stderr in retry context (`U3`, AC: build gate runs and its failure output reaches retry context) — `docs/tasks/2026-09-05-004/T05-validator-build-gate.md`
- [x] T06 — Root vitest scoped to src/ so nested sample tests never run (`U4a`, AC: root test run collects only src/ tests, exit 0) — `docs/tasks/2026-09-05-004/T06-root-vitest-scoping.md`
- [x] T07 — Root .env.example documents the LLM\_\* keys the agent reads (`U4b`, AC: template lists exactly LLM_BASE_URL/LLM_API_KEY/LLM_MODEL, no dead keys) — `docs/tasks/2026-09-05-004/T07-env-example-alignment.md`
- [x] T08 — Agent regenerates samples/output end-to-end; all gates green (`U5a`, AC: install+typecheck+test(≥4 files)+build exit 0 with full bootable shell) — `docs/tasks/2026-09-05-004/T08-regenerate-sample-app.md`
- [x] T09 — boot-check.mjs proves the generated app serves a rendered page (`U5b`, AC: script exits 0 on regenerated samples, fails on placeholder app) — `docs/tasks/2026-09-05-004/T09-boot-check-script.md` — revised; `status: completed`
- [x] T10 — Root app lists 5 seed cars via useCars → Apollo/MSW as MUI cards (`U6a`, AC: root typecheck+test green with 5 MUI cards via hook) — `docs/tasks/2026-09-05-004/T10-root-list-flow.md`
- [x] T11 — CarCard switches image src across 640/1024 breakpoints (`U6b`, AC: three-width mapping test green + mutation-certified) — `docs/tasks/2026-09-05-004/T11-root-responsive-images.md`
- [x] T12 — Root search-by-model and sort-by-year/make compose (`U6c`, AC: search, both sorts, and composition tests green) — `docs/tasks/2026-09-05-004/T12-root-search-sort.md` — `status: completed`
- [x] T13 — AddCar mutation appends a card without reload (`U6d`, AC: submit → 6th card appears via mutation through useCars) — `docs/tasks/2026-09-05-004/T13-root-addcar.md` — `status: completed`
- [ ] T14 — G1–G6 certification and documentation closure (`U7`, AC: README gates section with observed results + cost; readme test green) — `docs/tasks/2026-09-05-004/T14-gates-certification-docs.md`

## Dependency Order (topological)

```
T01 → T02 ─┐
T03 → T04 ─┼→ T08 → T09 ──────────────┐
T05 ───────┤        T10 → T11 ─┐      │
T06 ───────┤               T12 ─┼→ T14│
T07 ───────┘               T13 ─┘     │
        (T14 also needs T09) ─────────┘
```

## Critical Path

`T01/T03 → T02/T04 → T08 (live LLM run — HIGH risk) → T09/T10 → T11–T13 → T14`

T05–T07 are independent P0 prerequisites of T08 and can run in parallel with T01–T04.

## Notes for /work

- T08 replaces a committed tree and spends LLM tokens — snapshot/branch first; temp-dir rehearsal before promoting into `agent/samples/output/`.
- Gates G1–G6 (see README "Verification Gates") are the completion criteria; per repo learnings, every gate must be run and evidenced with named commands — vitest-green alone never certifies.

## Work Report — 2026-09-05-004-review

- **Status:** for-review
- **Work branch:** work/finish-car-inventory-manager
- **Tasks:** 0/1 completed, 1 for-review, 0 blocked, 0 skipped (this run executed T09 only — task-file input)
- **Gate decision:** regression check clean, but 1 scope-creep finding (`agent/tsconfig.test.json` changed outside the task's declared files) → binary gate sends T09 to `for-review`; run `/review 2026-09-05-004` to approve
- **Regression check:** clean (agent 16 files / 177 tests vs 171 baseline; agent + sample + root typecheck exit 0; sample 10/10; no orphan vite servers)
- **Scope creep:** 1 finding (+3 authorized deviations recorded in the report)
- **Learnings to capture:** 6 (run `/learn` to persist)
- **Work Report:** docs/plans/.work/.review/2026-09-05-004-review.md
- **Plan-accuracy findings for the user:** T08 is `completed` but its sample shipped the boilerplate placeholder (no test renders `App`); `samples/output/package.json` omits `@mui/material`, `@apollo/client`, `graphql`, `msw`, which currently resolve through the **root** repo's `node_modules`.

## Work Report — 2026-09-05-004-T12-review

- **Status:** complete — T12 `completed` (no `/review` pending for this task)
- **Work branch:** work/finish-car-inventory-manager (resumed, `already-on`)
- **Tasks:** 1/1 completed, 0 for-review, 0 blocked, 0 skipped (task-file input: T12 only)
- **Gate decision:** **passed** — regression check clean and T12's diff confined to its three declared files
- **Regression check:** clean (root 4 files / 18 tests; root + agent typecheck exit 0; agent 177 tests unchanged from T09 baseline; `boot-check` on `.` exit 0 with 12 app modules; no orphan vite servers)
- **Certificate:** 8 mutants → 8 killed, incl. re-applying the original defect (search stayed red)
- **Scope creep:** none in this run's diff (+3 authorized deviations, all in the pre-T12 checkpoint commit `c00d334`: verbatim WIP commit, undeclared `src/utils/sortCars.ts`, `.gitignore` += `*.tsbuildinfo`)
- **Learnings to capture:** 6 (run `/learn` to persist)
- **Work Report:** docs/plans/.work/.review/2026-09-05-004-T12-review.md
- **Retired from the report above:** root no longer serves the placeholder — `boot-check .` exits 0, so the T09 finding about `src/App.tsx:11` is closed (the missing-`package.json`-deps half of that finding stays open for T14).
- **Plan-accuracy findings for the user:** (1) **CORRECTION to the previous report block, which I got wrong:** I claimed the T08 sample "has no sorting at all" and that root sort was root-authored. It is not so — `agent/samples/output/src/utils/sortCars.ts` exists and is byte-identical to root's, with its own `sortCars.test.ts`, so T12's lift was genuine. The real (narrower) gap: the sample never wires sort into its own hook/`App`, so FR-6 is generation-verified only at unit level, never through a rendered UI — relevant to T14. (2) Separately, `AddCarForm.tsx` (**T13** scope) already sits in the tree and is mounted in `App.tsx`; **T13 claimed it as-is** (see the T13 report block).

## Work Report — 2026-09-05-004-T13-review

- **Status:** complete — T13 `completed` (no `/review` pending)
- **Work branch:** work/finish-car-inventory-manager (resumed, `already-on`)
- **Tasks:** 1/1 completed, 0 for-review, 0 blocked, 0 skipped (task-file input: T13 only)
- **Gate decision:** **passed** — clean regression check; the one out-of-scope file (`src/graphql/queries.ts`) was user-authorized at Triage and is recorded as an authorized deviation, not folded into scope
- **Regression check:** clean (root 5 files / 21 tests vs 4/18 baseline; root `tsc` exit 0; agent `tsc` exit 0 and 16 files / 177 tests **unchanged**; `boot-check .` exit 0 with 12 app modules; no orphan vite servers)
- **Certificate:** 9 mutants → **9 killed, 0 survived**, sources md5-verified. M5 (insert `refetch()`) dying is what makes "without a page reload" a real assertion.
- **Resolved open question from the task Notes:** the Apollo `update` cache-append alone satisfies FR-4 — `GetCars` is requested exactly once while the 6th card renders. No `refetchQueries` needed.
- **Scope creep:** 1 authorized deviation. `AddCarForm.tsx` and `App.tsx` verifiably **unmodified** (`git status`) — the claim-as-is decision held.
- **Learnings to capture:** 8 (run `/learn` to persist)
- **Work Report:** docs/plans/.work/.review/2026-09-05-004-T13-review.md
- **Plan-accuracy findings for the user:** (1) the mileage fix now exists **only in root** — the generated sample still omits `mileage` from `ADD_CAR`, so root diverges from the generation output and a regeneration would re-introduce the drop; T14 should check the generated half, not just root. (2) A failed `AddCar` is **silent** — `App` surfaces errors for the query only; an error-path AC would be its own task, deliberately not folded into T13. (3) `handlers.ts` keeps its store in a module-level `let` that `resetHandlers()` cannot reset — mutation tests are order-dependent until a `resetStore()` seam exists.
