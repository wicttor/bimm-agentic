---
plan-id: 2026-09-05-003
type: "task-index"
title: "Split the agent pipeline into per-task sessions with git-commit boundaries"
interactionMode: autopilot
timestamp: 2026-09-05T18:45:00Z
---

# Tasks — Split the agent pipeline into per-task sessions with git-commit boundaries

Task artifacts produced by the plan skill's Tasks phase (Phase 5). Execute with the work skill:
`/work 2026-09-05-003` for the whole list, `/work 2026-09-05-003-T07` for one task's
Red → Green → Refactor cycle.

Full plan: `docs/plans/2026-09-05-003-per-task-agent-sessions-with-git-commits.md`

## 2026-09-05-003 — Split the agent pipeline into per-task sessions with git-commit boundaries

- [ ] T01 — Give the CLI a stage grammar and an exit-code vocabulary (`U1`, AC: resolveConfig takes plan|work|drive|trace + --plan-id/--task/--gate/--no-commit/--force-add/--max-sessions, bare --spec means plan, and 0/2/3/4/5 are exported) — `docs/tasks/2026-09-05-003/T01-cli-stage-grammar-and-exit-codes.md`
- [ ] T02 — Record and read back the run manifest in the task index frontmatter (`U2`, AC: spec/out/provider/model written by writePlanArtifacts and read by readRunManifest, every missing key named with its flag) — `docs/tasks/2026-09-05-003/T02-run-manifest-in-task-index-frontmatter.md`
- [ ] T03 — Read the task index as a queue: next, complete, or stalled (`U3`, AC: nextRunnableTask returns task/complete/stalled from checked lines and completed deps; blocked re-runs, completed never re-opens) — `docs/tasks/2026-09-05-003/T03-task-queue-reader-next-complete-stalled.md`
- [ ] T04 — Add the git seam: clean-tree guard, explicit-path commit, scoped restore (`U4`, AC: GitRunner-backed requireCleanTree/commitPaths/restoreWrittenPaths, check-ignore pre-flight with --force-add, branch re-read before every commit, never add -A) — `docs/tasks/2026-09-05-003/T04-git-seam-commit-and-scoped-restore.md`
- [ ] T05 — Extract executeTask: one task, dependency outputs read from disk (`U5`, AC: executeTask runs one task with deps read from --out, missing dep is a typed failure, generate is a thin loop over it) — `docs/tasks/2026-09-05-003/T05-executetask-single-task-from-disk.md`
- [ ] T06 — Make the work report cumulative across sessions (`U6`, AC: one Work Report block counted from the whole checked list, complete only when every line is checked, replaced in place) — `docs/tasks/2026-09-05-003/T06-cumulative-work-report.md`
- [ ] T07 — Add the work stage: one session, one task, gate, record, commit (`U7`, AC: work --plan-id runs one task, gates with validate+repair, green commits + exit 0, red restores + records blocked + exit 4, 5 when empty, 3 when stalled, dirty tree refused before any model call) — `docs/tasks/2026-09-05-003/T07-work-stage-one-task-per-session.md`
- [ ] T08 — Make the plan stage end at the artifacts and print how to continue (`U8`, AC: plan --spec scaffolds, plans, writes, commits, exits 0 with no executor call and prints the continuation command; bare --spec identical) — `docs/tasks/2026-09-05-003/T08-plan-stage-stops-after-artifacts.md`
- [ ] T09 — Add drive: launch a fresh session per task until the queue is empty (`U9`, AC: drive launches one session per task through an injectable SessionLauncher, propagates a blocked session's code, exits 0 on an empty queue) — `docs/tasks/2026-09-05-003/T09-driver-spawns-fresh-sessions.md`
- [ ] T10 — Prove the split offline and retire the one-process loop (`U10`, AC: plan + N sessions + blocked + resume + empty-queue proved offline, and generate() is gone) — `docs/tasks/2026-09-05-003/T10-offline-proof-for-the-split.md`
- [ ] T11 — Publish the run's surface: derived --help plus the session docs (`U11`, AC: --help prints stages, every FLAG_NAMES entry and the five codes from the constants the parser uses, and the README + architecture doc carry the same surface, trace naming, and the bare---spec migration line) — `docs/tasks/2026-09-05-003/T11-document-session-model.md`

## Execution Notes

- **Read `docs/plans/2026-09-05-003-per-task-agent-sessions-with-git-commits.md` before T07.** The
  exit-code contract (0 progress · 2 config/refused · 3 stalled · 4 blocked · 5 queue empty) and the
  refusal order (manifest → clean tree → queue → network) are decided there, not here.
- T01–T06 are pure and offline; none of them spawns a process or touches a real repository. They can be
  executed in any order that respects each task's own `dependencies`, and every one of them must land on
  a green `npm run agent:test`.
- **`generate()` is deleted in T10, not T05.** T05 leaves it as a thin loop over `executeTask` so that no
  commit in the middle of this plan is red — the same discipline each session of the resulting pipeline
  enforces on itself.
- **This repo's `.gitignore` contains `generated-app/`.** The first real plan stage will therefore meet
  `paths_ignored` from T04's pre-flight. Expected, and the operator's choice: a tracked `--out`,
  `--force-add`, or `--no-commit` with the commit taken by hand.
- T11 machine-checks only the *enumeration* — that `--help` prints every flag in `FLAG_NAMES` and all five
  exit codes, derived from the constants the parser actually uses. Its prose is verified in the Review
  phase, because a markdown grep proves a string exists, never that a command works.
