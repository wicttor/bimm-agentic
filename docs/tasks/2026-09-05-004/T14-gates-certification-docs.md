---
id: 2026-09-05-004-T14
title: "G1–G6 certification and documentation closure"
plan-id: 2026-09-05-004
unit: U7
tier: deep
status: not-started
priority: P2
dependencies:
  - 2026-09-05-004-T09
  - 2026-09-05-004-T11
  - 2026-09-05-004-T12
  - 2026-09-05-004-T13
files:
  create: []
  modify:
    - agent/README.md
    - ARCHITECTURE.md
    - agent/CHANGELOG.md
  test:
    - agent/src/readme.test.ts
estimated-effort: "2 hours"
timestamp: "2026-09-04T09:05:00-04:00"
---

# G1–G6 certification and documentation closure

## Goal

Prove the whole submission with named commands (no self-reports), update the write-up for the new pipeline shape (inventory prompts, build gate, boot-check), and record cost/wall-clock for the full-spec run.

## Acceptance Criterion

A gates section in `agent/README.md` lists G1–G6 with exact commands and observed results for this run — G4/G5 via `node agent/scripts/boot-check.mjs agent/samples/output`, G6 via `node agent/scripts/boot-check.mjs .` — plus per-run token/cost figures; `ARCHITECTURE.md` and `agent/CHANGELOG.md` reflect the U2/U3/U5 changes; `agent/src/readme.test.ts` certifies the new required sections; inbound references to rewritten docs are absorbed (grep before/after).

## Steps

1. **Red — Write the failing test:** extend `agent/src/readme.test.ts` asserting `agent/README.md` contains a "Verification Gates" heading listing G1…G6 and a cost line. Confirm red.
2. **Green — Implement:** run each gate fresh and paste actual output summaries (commands + exit codes + test counts + wall-clock + tokens from the T08 run log); update ARCHITECTURE.md's pipeline diagram (inventory + build gate + boot-check) and CHANGELOG entry; docs to green.
3. **Refactor:** grep the repo for references to old section names/commands (learning `readme-rewrite-must-absorb-prior-references` — README.md was rewritten at plan start; confirm root README's G-table still matches reality); fix drift.

## Test Scenarios

- Doc cert: agent/README.md -> "Verification Gates" section with all six gate IDs and results; cost figures present
- Live evidence (recorded in report, not automated): G1 142+/142+; G2 exit 0; G3 typecheck+test+build 0; G4/G5/G6 boot-check exit 0

## Acceptance Criteria

- [ ] README gates section documents G1–G6 with observed results and cost; docs current; readme test green

## Dependencies

- 2026-09-05-004-T09: boot-check is the G5/G6 instrument
- 2026-09-05-004-T11, T12, T13: root FR tests must exist for G6 to be meaningful

## Notes

- Per learning `work-self-reports-can-claim-unperformed-refactors`: the work report must name every command and paste exit codes; a green vitest alone does not certify (run typecheck and build too).
- Capture the four open learning gaps (Apollo/MSW patterns, matchMedia recipe, prompt-context budget, build-gate taxonomy) by running `/learn` after this task.
