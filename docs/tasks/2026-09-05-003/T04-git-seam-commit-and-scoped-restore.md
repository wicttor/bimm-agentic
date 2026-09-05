---
id: 2026-09-05-003-T04
title: "Add the git seam: clean-tree guard, explicit-path commit, scoped restore"
plan-id: 2026-09-05-003
unit: U4
tier: deep
status: not-started
priority: P0
dependencies: []
files:
  create:
    - agent/src/git.ts
    - agent/tests/git.test.ts
  modify: []
  test:
    - agent/tests/git.test.ts
estimated-effort: "3 hours"
timestamp: 2026-09-05T18:45:00Z
---

# Add the git seam: clean-tree guard, explicit-path commit, scoped restore

## Goal

The commit is the boundary that makes one task's completion durable, and the restore is the boundary
that makes one task's failure survivable. Both have to be narrow enough to be safe, and injectable
enough to be tested without a repository.

## Acceptance Criterion

An injectable `GitRunner` backs `requireCleanTree`, `commitPaths` (explicit path list only, never `add -A`, never writes `.gitignore`, `git check-ignore` pre-flight failing with `paths_ignored` unless `--force-add`, `git branch --show-current` re-read immediately before committing, returns `{sha, branch}`) and `restoreWrittenPaths` (tracked restore plus removal of the untracked files this session wrote)

## Steps

1. **Red — Write the failing test:** create `agent/tests/git.test.ts` with a recording `GitRunner` (argv in, canned stdout out): `commitPaths(cwd, ["a.ts","b.md"], msg)` issues `check-ignore`, `add -- a.ts b.md`, `commit -m <msg>` and never an `-A`/`.` argument, returning the sha from `rev-parse --short HEAD`; an ignored path returns `{ok:false, code:"paths_ignored"}` naming the path and `.gitignore`, and with `forceAdd: true` issues `add -f --`; `requireCleanTree` refuses when `status --porcelain` is non-empty and passes when empty, and in neither case calls `stash` or `checkout`; `restoreWrittenPaths` splits `ls-files --error-unmatch` results into `restore --source=HEAD --worktree -- <tracked>` and unlinking only the untracked names given, never a directory-wide clean; and the branch is read immediately before the commit call, so a scripted runner that changes the branch between the two calls is observed in the result. Confirm failures.
2. **Green — Implement:** create `agent/src/git.ts` with `GitRunner = (args: string[], opts: {cwd: string}) => Promise<{exitCode, stdout, stderr}>` (the `ScriptRunner` pattern from `tools/registry.ts`), `defaultGitRunner` over `execFile("git", args, …)` in argument-array form, and a typed error code union (`not_a_git_repo`, `dirty_tree`, `paths_ignored`, `identity_unknown`, `commit_failed`, `restore_failed`). No function here throws.
3. **Refactor:** one call site, one message shape — the commit subject carries the task id and the body carries the acceptance criterion, so `git log --oneline` reads as the task list.

## Test Scenarios

- Commit: three argv records, no `-A`, `{sha, branch}` returned
- Ignored: `paths_ignored` naming `.gitignore`; `forceAdd` → `add -f --`
- Dirty tree: refused, zero mutating calls issued
- Restore: tracked → restored, this session's untracked → removed, foreign untracked → untouched
- Identity: a `commit` failing on author identity returns `identity_unknown` with git's own stderr
- Branch: `branch --show-current` is the call immediately preceding `commit`

## Acceptance Criteria

- [ ] An injectable `GitRunner` backs `requireCleanTree`, `commitPaths` (explicit path list only, never `add -A`, never writes `.gitignore`, `git check-ignore` pre-flight failing with `paths_ignored` unless `--force-add`, `git branch --show-current` re-read immediately before committing, returns `{sha, branch}`) and `restoreWrittenPaths` (tracked restore plus removal of the untracked files this session wrote)

## Dependencies

- None

## Notes

- The `check-ignore` pre-flight is not decoration: this repository's `.gitignore` contains `generated-app/`, so the default `--out` is uncommittable today. The failure has to name the file and the fix (`--force-add`, or a tracked `--out`), and the harness must never edit the user's `.gitignore` to make its own feature work.
- `docs/learn/workflow/recheck-branch-before-each-commit.md` exists because an automation in this repo moves the checked-out branch mid-run. Re-read at commit time, never once at start.
- This task touches git only as an injectable unit. U7 decides *when* to commit; nothing here calls the LLM or reads a task file.
