---
title: Artifact ID Generation
description: Reference for Triage, Prepare, Execute, and Review phases. Defines the daily-counter algorithm for unique artifact IDs, the work-id allocation, the recycle-on-edit rule, and the shared counter layout under docs/plans/.work/.
type: reference
version: 1.0
timestamp: "2026-08-07"
---

# Artifact ID Generation

Shared ID algorithm for the `triage`, `prepare`, `execute`, and `review` phases, plus `work-id` allocation for ad-hoc input. Each phase assigns exactly one ID per newly produced artifact; the ID is reused (never re-incremented) when the user picks **Edit & Retry** at the phase confirmation.

## ID Format by Phase

| Phase    | ID format                            | Saved to                         |
| -------- | ----------------------------------- | -------------------------------- |
| Triage   | `YYYY-MM-DD-NNN-triage`             | `docs/plans/.work/.triage/<id>.md`   |
| Prepare  | `YYYY-MM-DD-NNN-prepare`            | `docs/plans/.work/.prepare/<id>.md`  |
| Execute  | `YYYY-MM-DD-NNN-execute`             | `docs/plans/.work/.execute/<id>.md`  |
| Review   | `YYYY-MM-DD-NNN-review`              | `docs/plans/.work/.review/<id>.md`   |

`work-id` (see below) is shared across all four artifacts of a single run.

## work-id

The `work-id` is the key that ties all four phase artifacts together and locates the task directory. It reuses the `/plan` `plan-id` format so the `docs/tasks/<id>/` convention holds uniformly:

| Input shape | work-id value                                              |
| ----------- | --------------------------------------------------------- |
| plan-based  | `plan-id` (inherited from `docs/tasks/<plan-id>/index.md`) |
| task-file   | `plan-id` inferred from the task file's folder            |
| ad-hoc      | a fresh `YYYY-MM-DD-NNN` (allocated below)                |

**Format:** `YYYY-MM-DD-NNN` (date + zero-padded 3-digit daily counter), identical to the `/plan` `plan-id`.

> **Work branch name:** the git branch for a run is `work/<short-description>` — a kebab-case slug derived from the plan name or work description (Triage Step 2d), **not** the `work-id` itself. The Work Manifest records the `work-branch` ↔ `work-id` pairing; see `skills/work/modules/triage.md` Step 2d.

## Algorithm (new phase artifact)

```
1. Get the current date in UTC (e.g., 2026-08-07)
2. List existing files for today in the phase's save directory:
   - triage   -> docs/plans/.work/.triage/   matching YYYY-MM-DD-*-triage.md
   - prepare  -> docs/plans/.work/.prepare/  matching YYYY-MM-DD-*-prepare.md
   - execute  -> docs/plans/.work/.execute/  matching YYYY-MM-DD-*-execute.md
   - review   -> docs/plans/.work/.review/   matching YYYY-MM-DD-*-review.md
3. NNN = (count + 1), zero-padded to 3 digits (001, 002, ..., 010, ...)
4. id = "<date>-<NNN>-<phase>"
```

If two triage artifacts were created today, the next one is `2026-08-07-003-triage`. Counters are independent per phase; each phase counts only its own files.

## Algorithm (ad-hoc work-id allocation)

Allocated only in Triage for ad-hoc input:

```
1. Get the current date in UTC
2. List existing folders under docs/tasks/ matching YYYY-MM-DD-NNN for that date
3. NNN = (highest existing NNN for that date) + 1, zero-padded to 3 digits
   - if none exist for that date, start at 001
4. work-id = "<date>-<NNN>"
5. Create docs/tasks/<work-id>/ and its index.md (Triage Step 2c)
```

> This deliberately mirrors the `/plan` Generate-phase `plan-id` counting (per `skills/plan/references/id-generation.md`), so a `/plan`-produced `docs/tasks/<plan-id>/` and an ad-hoc `/work`-produced `docs/tasks/<work-id>/` share one numbering space per date and never collide.

## Recycle on Edit & Retry

When the user picks **Edit & Retry** at a phase confirmation, **reuse the original ID** and overwrite the existing artifact file. Do **not** increment the counter. This keeps IDs stable across iterations and prevents orphaned artifacts. The Review phase's `## Work Report — <review-id>` block in the task index is likewise idempotent on `review-id` (overwritten, never duplicated).

## Error Handling

| Trigger                                         | Action                                       |
| ----------------------------------------------- | -------------------------------------------- |
| Phase save directory does not exist              | Create it; treat count as 0; start from 001  |
| Directory exists but no files match today's date | Start counter at 001                         |
| `docs/tasks/` missing                           | Create it (ad-hoc work-id allocation)        |
| Write permission denied                         | Log error; ask the user; retry once          |

## Notes

- IDs reuse the `/plan` daily-counter algorithm for cross-skill consistency; the Work skill's counters are independent from Plan's (separate save directories).
- `work-id` carries through every artifact (`triage-id` artifacts record it; Prepare/Execute/Review inherit it), so cross-phase chaining is `triage-id → prepare-id → execute-id → review-id`, all sharing one `work-id` (see [error-handling.md](error-handling.md) "Cross-Phase Consistency Checks").
- Counter collisions are impossible within a date because each phase writes to its own directory and recomputes the count from the directory listing.