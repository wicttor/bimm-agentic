---
title: Artifact ID Generation
description: Reference for Scope, Prepare, Analyze, and Report phases. Defines the daily-counter algorithm for unique artifact IDs, the review-id umbrella allocation (distinct from a Work review-id), the recycle-on-edit rule, and the shared counter layout under docs/review/.
type: reference
version: 1.0
timestamp: "2026-08-08"
---

# Artifact ID Generation

Shared ID algorithm for the `scope`, `prepare`, `analyze`, and `report` phases, plus the `review-id` umbrella allocation in Scope. Each phase assigns exactly one ID per newly produced artifact; the ID is reused (never re-incremented) when the user picks **Edit & Retry** at the phase confirmation.

## ID Format by Phase

| Phase    | ID format                            | Saved to                            |
| -------- | ----------------------------------- | ----------------------------------- |
| Scope    | `YYYY-MM-DD-NNN-scope`              | `docs/review/.scope/<id>.md`    |
| Prepare  | `YYYY-MM-DD-NNN-prepare`            | `docs/review/.prepare/<id>.md`  |
| Analyze  | `YYYY-MM-DD-NNN-analyze`            | `docs/review/.analyze/<id>.md`  |
| Report   | `YYYY-MM-DD-NNN-report`             | `docs/review/.report/<id>.md`   |

`review-id` (see below) is the umbrella shared across all four artifacts of a single review run.

## review-id

The `review-id` is the umbrella key that ties all four phase artifacts together and keys the registry row / work-index block. It is allocated **once** in Scope Step 2 (the allocating phase) and carried through Prepare/Analyze/Report unchanged.

**Format:** `YYYY-MM-DD-NNN` (date + zero-padded 3-digit daily counter), counting existing `docs/review/.scope/YYYY-MM-DD-NNN-scope.md` files for that date (the scope phase is the allocating phase, so its counter is the source of truth for the umbrella id).

> **Distinct from a Work `review-id`.** When Review is invoked over a `/work` run (`input-shape: work-linked`), the Work skill's own `review-id` (`docs/plans/.work/.review/...`) **already exists**. The Review skill allocates its **own** `review-id` (`docs/review/...`) — the two skills produce independent artifacts and never share an id. The `work-id` is carried alongside in the Review artifacts for traceability and the work-index cross-link, but `review-id` ≠ Work `review-id`.

## Algorithm (new phase artifact)

```
1. Get the current date in UTC (e.g., 2026-08-08)
2. List existing files for today in the phase's save directory:
   - scope    -> docs/review/.scope/     matching YYYY-MM-DD-*-scope.md
   - prepare  -> docs/review/.prepare/   matching YYYY-MM-DD-*-prepare.md
   - analyze  -> docs/review/.analyze/   matching YYYY-MM-DD-*-analyze.md
   - report   -> docs/review/.report/    matching YYYY-MM-DD-*-report.md
3. NNN = (count + 1), zero-padded to 3 digits (001, 002, ..., 010, ...)
4. id = "<date>-<NNN>-<phase>"
```

If two scope artifacts were created today, the next one is `2026-08-08-003-scope`. Counters are independent per phase; each phase counts only its own files.

## Algorithm (review-id umbrella allocation)

Allocated **only** in Scope Step 2:

```
1. Get the current date in UTC
2. List existing files under docs/review/.scope/ matching YYYY-MM-DD-NNN-scope.md for that date
3. NNN = (highest existing NNN for that date), zero-padded to 3 digits
   - if none exist for that date, start at 001
4. review-id = "<date>-<NNN>"  (the same NNN as the scope-id being allocated)
5. Write the scope artifact with both review-id and scope-id
```

Because `review-id` reuses the scope counter's NNN, the umbrella id and the `scope-id` share the same date+counter suffix (e.g., `review-id: 2026-08-08-001` → `scope-id: 2026-08-08-001-scope`). Subsequent phases (`prepare-id`, `analyze-id`, `report-id`) **reuse that same NNN** if available on the same date — they do **not** independently allocate a new NNN that could orphan from the umbrella id. If the NNN is taken by an unrelated artifact on the same date in a later phase directory (rare), the later phase appends and notes the divergence in its artifact (the umbrella `review-id` is still carried everywhere).

## Recycle on Edit & Retry

When the user picks **Edit & Retry** at a phase confirmation, **reuse the original ID** and overwrite the existing artifact file. Do **not** increment the counter. This keeps IDs stable across iterations and prevents orphaned artifacts. The Report phase's registry row in `docs/review/index.md` and the `## Review Report — <report-id>` block in the work index are likewise idempotent on `report-id` (overwritten, never duplicated).

## Error Handling

| Trigger                                         | Action                                       |
| ----------------------------------------------- | -------------------------------------------- |
| Phase save directory does not exist              | Create it; treat count as 0; start from 001  |
| Directory exists but no files match today's date | Start counter at 001                         |
| `docs/review/` missing                   | Create it (Pre-Flight already creates; idempotent) |
| Write permission denied                         | Log error; ask the user; retry once          |

## Notes

- IDs reuse the daily-counter algorithm for cross-skill consistency with `/plan` and `/work`; the Review skill's counters are independent from those skills (separate save directories under `docs/review/` vs `.work/`).
- `review-id` carries through every artifact (`scope-id` artifacts record it; Prepare/Analyze/Report inherit it), so cross-phase chaining is `scope-id → prepare-id → analyze-id → report-id`, all sharing one `review-id` (see [error-handling.md](error-handling.md) "Cross-Phase Consistency Checks").
- For work-linked input, `work-id` is **additionally** carried (inherited from the Review Input Artifact), distinct from `review-id`, for the registry cross-link only.
- Counter collisions are impossible within a date because each phase writes to its own directory and recomputes the count from the directory listing.