---
title: Change-Set Resolution
description: Authoritative reference for the Scope phase. Defines how a review target (a git change-set, a /work run via work-id/Work review-id, or an ad-hoc description) is resolved into a concrete change boundary: a `required` file list (with status), an optional `context` list (callers/importers), and an `attribution` source (commits / working-tree / task-files / current-contents).
type: reference
version: 1.0
timestamp: "2026-08-08"
---

# Change-Set Resolution

Authoritative reference for the **Scope** phase (Step 2). Defines how a classified review target — a git change-set, a `/work` run (via `work-id` / Work `review-id`), **or** an ad-hoc description — is resolved into a concrete **change boundary**: a `required` file list (files the change actually touches, with status), an optional `context` list (callers/importers for reviewer context), and an `attribution` source naming how the boundary was derived. Scope looks this reference up; it does not re-derive the rules.

## Change Boundary Shape

```yaml
change-boundary:
  required:
    - path: "src/lib/redis-client.ts"
      status: modified | added | deleted | renamed
      renamed-from: "<old path>"   # only for renamed
  context:
    - path: "src/api/session.ts"
      role: "caller of redis-client.connect()"
  attribution: commits | working-tree | task-files | current-contents
  empty: false   # true when a spec parses but touches no files
  diff-source: <base>..<head> | working-tree | working-tree-fallback | current-contents
```

- **`required`** — files the change actually touches; these are the subjects of the review. Repository-relative.
- **`context`** — files recommended for reviewer context (callers, importers, sibling modules); **never** subjects of review themselves. Prepare enriches this; Scope seeds it lightly.
- **`attribution`** — names how the boundary was derived, so Prepare picks the right diff invocation and Analyze judges severity against the right baseline.

## Resolution by Shape

### 2a. Change-set

```
1. Parse the spec into a concrete git invocation:
   - "<base>..<head>"     -> git diff <base>..<head> --name-status
   - "A..B" (commit range)-> git diff A..B --name-status
   - "HEAD"               -> git diff HEAD --name-status (unstaged) + git diff --cached --name-status (staged)
   - staged / --cached    -> git diff --cached --name-status
   - branch-vs-base       -> git diff <base-branch>...<head-branch> --name-status
   - paths/globs          -> git diff --name-status -- <paths>
2. Map git name-status codes to boundary statuses:
   - A -> added, M -> modified, D -> deleted, R<x> -> renamed (record renamed-from), C<x> -> copied
3. attribution = "commits"; diff-source = the resolved <base>..<head> / range / index form
4. If the diff is empty (spec parses but touches no files):
   - record change-boundary.empty: true and attribution/diff-source as above
   - continue; Report records a nothing-to-review outcome (do not abort)
5. Seed `context` lightly: for each modified file, optionally note immediate
   callers/importers of changed public symbols if discoverable cheaply; leave
   context empty otherwise (Prepare expands it).
```

### 2b. Work-linked

```
1. Resolve the work-id:
   - given a work-id (YYYY-MM-DD-NNN): use it directly
   - given a Work review-id: read docs/plans/.work/.review/<review-id>.md -> work-id
2. Read docs/tasks/<work-id>/index.md and parse the task checklist
3. For each task file, read its frontmatter files.create / files.modify
4. required = union of all files.create + files.modify across the run's tasks
5. Filter by task outcome from the Work Report:
   - completed tasks -> include their files (status "modified" or "added" as declared)
   - blocked / skipped tasks -> include their files but mark them "tentative"
     (their changes may be partial / not present); Analyze notes the tentative flag
   - tasks not part of this run -> excluded entirely
6. Attribution heuristic (best-effort):
   - if commits attributable to the run are discoverable (message references <work-id>):
     attribution = "commits"; diff-source = those commits
   - else fall back to the working-tree diff of the required files:
     attribution = "task-files"; diff-source = "working-tree-fallback"
7. Either way, record the work-id and outcome filter on the boundary
8. Seed `context` lightly as in 2a.
```

> The `tentative` flag on blocked/skipped task files is the warning that those changes may be incomplete; Analyze treats a `tentative` file's findings with the understanding the file may not reflect intended final state, but does not silently downgrade severity — the reviewer sees the flag and decides.

### 2c. Ad-hoc

```
1. Map the description to concrete paths:
   - if it names a path/glob -> glob-expand to matching files
   - if it names a module/symbol -> locate the file(s) defining it
   - if it names a directory -> all files under it (bounded; warn if very large)
2. required = the matched files (status "modified" as the default — ad-hoc
   targets are usually existing files whose current contents are the review target)
3. Derive an actual diff where possible:
   - find the commits that most recently touched those files
     (e.g. last commit per file, or a shallow range) -> git diff for those
   - if no committable diff exists (uncommitted or freshly-added files):
     attribution = "current-contents"; diff-source = "current-contents"
     (the file's current contents are the review target; no hunks)
4. Seed `context` lightly (callers/importers of matched symbols).
5. If the description maps to ZERO concrete files:
   - Category 3 (invalid review input) recovery: ask the user to name a file,
     module, or path. Do not fabricate a boundary from a vague description.
```

## Attribution Source Semantics

| attribution       | What it means                                              | Prepare uses it to                                  |
| ----------------- | --------------------------------------------------------- | --------------------------------------------------- |
| `commits`         | A real commit range touches the `required` files          | `git diff <range> -- <files>` for real hunks        |
| `working-tree`   | Change-set input pointed at the working tree               | `git diff -- <files>` + `git diff --cached -- <files>` |
| `task-files`     | Work-linked; no attributable commits, files derived from task files | `git diff -- <files>` (working-tree-fallback) |
| `current-contents` | Ad-hoc, no committable diff; file contents are the target | Read current file contents directly (no hunks)      |

## Validation (Scope Step 3 re-checks)

A resolved change boundary is **accepted** only when:

- `required` paths are repository-relative and each carries a `status` (added/modified/deleted/renamed; `tentative` is allowed for blocked/skipped work-linked tasks)
- `context` is separated from `required` and each `context` entry has a `role` (even if brief)
- `attribution` and `diff-source` are set consistently (e.g., `attribution: commits` pairs with a real `diff-source: <range>`; `current-contents` pairs with `diff-source: current-contents`)
- An empty boundary is explicitly `change-boundary.empty: true` (never silently empty) — accepted; Report records nothing-to-review

On any failure, regenerate the boundary from the relevant sub-step (2a/2b/2c) per [error-handling.md](error-handling.md) Category 2 recovery.

## Notes

- This reference is the single source of truth for the change-boundary shape, the per-shape resolution algorithms, and the `attribution` semantics.
- Scope applies it; Prepare reads the `attribution`/`diff-source` to gather the right diffs (Prepare never re-derives the boundary); Analyze and Report consume the boundary read-only.
- The boundary intentionally separates `required` (review subjects) from `context` (reviewer aid) so Analyze never files findings about `context` files as if they were the change under review.