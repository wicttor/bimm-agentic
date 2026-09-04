---
title: Artifact ID Generation
description: Reference for Scope, Research, Design, and Generate phases. Defines the daily-counter algorithm for unique artifact IDs, the recycle-on-edit rule, and the plan-id counting skip-list.
type: reference
version: 1.0
timestamp: "2026-08-07"
---

# Artifact ID Generation

Shared ID algorithm for the `scope`, `research`, `design`, and `generate` phases. Each phase assigns exactly one ID per newly produced artifact; the ID is reused (never re-incremented) when the user picks **Edit & Retry** at the phase confirmation.

## ID Format by Phase

| Phase    | ID format                            | Saved to                         |
| -------- | ----------------------------------- | -------------------------------- |
| Scope    | `YYYY-MM-DD-NNN-scope`              | `docs/plans/.scope/<id>.md`      |
| Research | `YYYY-MM-DD-NNN-research`            | `docs/plans/.research/<id>.md`  |
| Design   | `YYYY-MM-DD-NNN-design`             | `docs/plans/.design/<id>.md`     |
| Generate | `YYYY-MM-DD-NNN` (= `plan-id`)       | `docs/plans/<id>-<kebab-name>.md`|

`<kebab-name>` is the plan title in lowercase-hyphen form (no stopwords).

## Algorithm (new artifact)

```
1. Get the current date in UTC (e.g., 2026-07-03)
2. List existing files for today in the phase's save directory
   - scope   -> docs/plans/.scope/   matching YYYY-MM-DD-*.md
   - research-> docs/plans/.research/matching YYYY-MM-DD-*.md
   - design  -> docs/plans/.design/  matching YYYY-MM-DD-*.md
   - generate-> docs/plans/           matching YYYY-MM-DD-*.md
                EXCLUDE the .scope/, .research/, .design/ subdirectories
3. NNN = (count + 1), zero-padded to 3 digits (001, 002, ..., 010, ...)
4. id = "<date>-<NNN>-<phase>"  (or "<date>-<NNN>" for plan-id)
```

If two scope artifacts were created today, the next one is `2026-07-03-003-scope`. Counters are independent per phase; each phase counts only its own files.

## Recycle on Edit & Retry

When the user picks **Edit & Retry** at the phase confirmation, **reuse the original ID** and overwrite the existing artifact file. Do **not** increment the counter. This keeps IDs stable across iterations and prevents orphaned artifacts.

## Error Handling

| Trigger                                         | Action                                       |
| ----------------------------------------------- | -------------------------------------------- |
| Phase save directory does not exist              | Create it; treat count as 0; start from 001  |
| Directory exists but no files match today's date | Start counter at 001                          |
| Write permission denied                         | Log error; ask the user; retry once          |

## Notes

- IDs are reused for cross-phase chaining: `research-id` carries the `scope-id`, `design-id` carries both, and `plan-id` carries `scope-id`, `research-id`, and `design-id` (see [error-handling.md](error-handling.md) "Cross-Phase Consistency Checks").
- Counter collisions are impossible within a date because each phase writes to its own directory and recomputes the count from the directory listing.