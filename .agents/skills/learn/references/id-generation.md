---
title: Artifact ID Generation
description: Reference for Capture, Refine, Index, and Maintain phases. Defines the daily-counter algorithm for unique phase artifacts, the learn-id umbrella allocation, the maintain-id standalone allocation (no learn-id), the entry slug derivation, and the recycle-on-edit rule.
type: reference
version: 1.0
timestamp: "2026-08-08"
---

# Artifact ID Generation

Shared ID algorithm for the `capture`, `refine`, `index`, and `maintain` phases, plus the `learn-id` umbrella (Capture is the allocating phase), the `maintain-id` standalone allocation, and the **entry `slug`** derivation (the upsert key for the entry file and the index record). Each phase assigns exactly one ID per newly produced artifact; the ID is reused (never re-incremented) when the user picks **Edit & Retry** at the phase confirmation.

## ID Format by Phase

| Phase    | ID format                            | Saved to                            |
| -------- | ----------------------------------- | ----------------------------------- |
| Capture  | `YYYY-MM-DD-NNN-capture`            | `docs/learn/.capture/<id>.md`   |
| Refine   | `YYYY-MM-DD-NNN-refine`             | `docs/learn/.refine/<id>.md`    |
| Index    | `YYYY-MM-DD-NNN-index`              | `docs/learn/.index/<id>.md`     |
| Maintain | `YYYY-MM-DD-NNN-maintain`           | `docs/learn/.maintain/<id>.md`  |

`learn-id` (see below) is the umbrella shared across Capture → Refine → Index. **Maintain has no `learn-id`** — it authors no new entry; it allocates only a standalone `maintain-id`.

## learn-id (umbrella — authoring runs)

Allocated **only in Capture** Step 4:

```
1. Get the current date in UTC
2. List existing files under docs/learn/.capture/ matching YYYY-MM-DD-NNN-capture.md for that date
3. NNN = (highest existing NNN for that date), zero-padded to 3 digits
   - if none exist for that date, start at 001
4. learn-id = "<date>-<NNN>"  (the same NNN as the capture-id being allocated)
5. Write the capture artifact with both learn-id and capture-id
```

Because `learn-id` reuses the capture counter's NNN, the umbrella id and the `capture-id` share the same date+counter suffix (e.g., `learn-id: 2026-08-08-001` → `capture-id: 2026-08-08-001-capture`). Refine and Index **inherit** that same NNN — they do **not** independently allocate a competing NNN. If the NNN is taken by an unrelated artifact on the same date in a later phase directory (rare), the later phase appends and notes the divergence in its artifact (the umbrella `learn-id` is still carried everywhere).

## maintain-id (standalone — maintain runs)

Allocated **only in Maintain** Step 6:

```
1. Get the current date in UTC
2. List existing files under docs/learn/.maintain/ matching YYYY-MM-DD-NNN-maintain.md for that date
3. NNN = (count + 1), zero-padded to 3 digits
4. maintain-id = "<date>-<NNN>-maintain"
```

A maintain artifact carries only `maintain-id`, never `learn-id` (a `learn-id` on a maintain artifact is treated as an orphan and logged per [error-handling.md](error-handling.md) Cross-Phase Consistency Checks).

## entry slug (upsert key — authored knowledge)

The `slug` is the stable, globally-unique key for a knowledge entry — it keys the entry file path (`docs/learn/<type>/<slug>.md`) and the index record. Capture **proposes** it; Refine **validates** uniqueness; Index **upserts** on it.

**Algorithm (Capture Step 4 proposes):**

```
1. Extract a concise, descriptive phrase from the entry title / problem statement
2. Convert to kebab-case (lowercase, non-alphanumeric → hyphen, collapse repeats, trim)
3. For time-bound decisions, a date suffix is allowed when the legacy/source used one:
   critical-risk-tier-security-payments-2026-07-04
4. The slug must be globally unique across docs/learn/<type>/ (all types share one slug
   namespace — a decision's slug cannot collide with a pattern's slug)
5. Capture proposes; Refine checks against the existing entries
```

**On a collision (Refine Step 3):** Refine runs the duplicate/analog check per [dedup-rules.md](dedup-rules.md). An exact match gives the user two choices: **update-existing** (keep the `slug`, overwrite the file + index record) or **new-slug** (append a distinguishing suffix, e.g., `<slug>-v2` or a domain qualifier). Capture does **not** pre-resolve collisions.

> **Slug is the upsert key, not a timestamp id.** A re-author with the same `slug` overwrites in place (idempotent); a new `slug` creates a new entry. The slug namespace is shared across all four types — there is one global `docs/learn/` slug space, not four.

## Algorithm (new phase artifact)

```
1. Get the current date in UTC (e.g., 2026-08-08)
2. List existing files for today in the phase's save directory:
   - capture  -> docs/learn/.capture/  matching YYYY-MM-DD-*-capture.md
   - refine   -> docs/learn/.refine/   matching YYYY-MM-DD-*-refine.md
   - index    -> docs/learn/.index/    matching YYYY-MM-DD-*-index.md
   - maintain -> docs/learn/.maintain/ matching YYYY-MM-DD-*-maintain.md
3. NNN = (count + 1), zero-padded to 3 digits (001, 002, ..., 010, ...)
4. id = "<date>-<NNN>-<phase>"
```

Counters are independent per phase; each phase counts only its own files.

## Recycle on Edit & Retry

When the user picks **Edit & Retry** at a phase confirmation, **reuse the original ID** and overwrite the existing artifact file. Do **not** increment the counter. This keeps IDs stable across iterations and prevents orphaned artifacts. The Index phase's upsert on `slug` is likewise idempotent (overwrite the entry file + index record, never duplicate). Maintain's `maintain-id` reuses the same id across re-run steps within one maintain session.

## Migration Note (entry slugs on legacy entries)

The legacy `docs/learnings/` store uses filenames, not slugs, as the key. The migration ([migration-bootstrap.md](migration-bootstrap.md)) **derives the canonical `slug`** from each legacy filename:

- `2026-07-04-critical-risk-tier-security-payments.md` → `slug: critical-risk-tier-security-payments-2026-07-04` (date kept as suffix when the file used one; the type-prefixed files already carry the date in)
- `daily-counter-artifact-naming-2026-07-02.md` → `slug: daily-counter-artifact-naming-2026-07-02`
- The original filename is preserved in the entry's `migrated-from` lineage field, so the old path knowledge is not lost.

## Error Handling

| Trigger                                         | Action                                       |
| ----------------------------------------------- | -------------------------------------------- |
| Phase save directory does not exist              | Create it (Pre-Flight already creates); treat count as 0; start from 001  |
| Directory exists but no files match today's date | Start counter at 001                         |
| `docs/learn/` missing                           | Create it; Index creates `<type>/` subdir; Maintain seeds the index (Pre-Flight helps) |
| Write permission denied                         | Log error; ask the user; retry once          |
| Slug collision at Capture (should not happen — Refine's job) | Capture proposes; Refine resolves — never silently two |

## Notes

- IDs reuse the daily-counter algorithm for cross-skill consistency with `/plan`, `/work`, and `/review`; the Learn skill's counters are independent from those skills (separate save directories under `docs/learn/`).
- `learn-id` carries through Capture → Refine → Index; Maintain uses the standalone `maintain-id` only. Cross-phase chaining is `capture-id → refine-id → index-id`, all sharing one `learn-id` (see [error-handling.md](error-handling.md) "Cross-Phase Consistency Checks").
- The `slug` is a **separate** key from the phase ids — it identifies the durable knowledge entry across re-authors, not the pipeline run. A single `slug` may be authored by many `learn-id` runs over time (each upsert overwrites); the `slug` is stable, the `learn-id` is per-run.
- Counter collisions are impossible within a date because each phase writes to its own directory and recomputes the count from the directory listing.