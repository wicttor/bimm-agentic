---
title: Migration Bootstrap
description: Authoritative reference for the Maintain phase (Step 1, one-time, self-gating). Defines the procedure for migrating the legacy docs/learnings/ store into the canonical docs/learn/ store: slug derivation from legacy filenames, frontmatter normalization per entry-schema, cross-reference rewriting (entry body + related links), the migrated-from lineage note, the .migrated marker, the self-gate (no-op if already migrated), and the rule that the legacy store is never deleted.
type: reference
version: 1.0
timestamp: "2026-08-08"
---

# Migration Bootstrap

Authoritative reference for the **Maintain** phase (Step 1, one-time, self-gating). Defines the procedure for migrating the legacy `docs/learnings/` store into the canonical `docs/learn/` store: **slug derivation** from legacy filenames, **frontmatter normalization** per [entry-schema.md](entry-schema.md), **cross-reference rewriting** (entry bodies + `related` links), the **`migrated-from` lineage note**, the **`.migrated` marker**, the **self-gate** (a no-op when already migrated), and the hard rule that **the legacy store is never deleted by the migration**. Maintain invokes this reference; it does not re-derive the procedure.

## Core Principle

> **One-time, self-gating, idempotent, lineage-preserving.** The migration runs once (the `.migrated` marker and slug-set parity prevent re-runs); it is idempotent (re-invoking is a no-op); it preserves lineage (each migrated entry records its `migrated-from: docs/learnings/<type>/<file>.md`, so the old path knowledge is not lost — the `path-convention-split` gotcha is the model: a migrated entry carries both the old and new path knowledge, never just the new). The legacy store stays on disk, read-only and superseded, until the user explicitly prunes it (a destructive, confirm-each step in Maintain, never part of the migration itself).

## Trigger & Self-Gate

Maintain runs the migration only when **all** are true:

1. `docs/learnings/` exists and is non-empty (legacy store present).
2. `docs/learn/` does not yet have the `.migrated` marker **and** the on-disk slug-set in `docs/learn/` does **not** match the legacy slug-set (par·ity detection — migration is already complete iff the canonical store has, for every legacy file, a matching slug).

Otherwise: record `migration: no-op (already migrated)` and skip to Maintain Step 2 (base-wide dedup). A subsequent `/learn maintain` invocation is a clean no-op.

## Procedure

```
1. For each file under docs/learnings/<type>/*.md (type ∈ decision/gotcha/pattern/workflow):
   1.1 Read the legacy entry (frontmatter + body).
   1.2 Derive the canonical slug:
       - Slug = kebab-case(normalize(legacy filename minus extension))
       - The introduction of a date in the filename is preserved as a date suffix:
         2026-07-04-critical-risk-tier-security-payments.md  ->  critical-risk-tier-security-payments-2026-07-04
         daily-counter-artifact-naming-2026-07-02.md         ->  daily-counter-artifact-naming-2026-07-02
       - Verify global uniqueness across docs/learn/; on collision, append a qualifier
         (e.g., -a / -b) and record the rename in the log.
   1.3 Normalize the frontmatter per [entry-schema.md](entry-schema.md):
       - Newer-layout (slug/type/domain/priority/applicability.{current_project,general}/tags/confidence):
         ALREADY canonical — preserve, add migrated-from.
       - Older-layout (title/category/severity/domain/tags/source: commit <sha>):
         Convert:
         * type        = category
         * slug        = <derived above>
         * priority    = important if severity==important else normal
         * applicability.current_project = inferred from severity (important->9, recommended->6, informational->3)
         * applicability.general        = inferred from severity (important->7, recommended->5, informational->4)
         * confidence   = medium
         * source       = { type: commit, reference: <sha>, extracted_at: <legacy created_at or date> }
         * The legacy `title` becomes the body `# <Title>` heading.
         * Mark inferred numerics with a comment/note: `# inferred from legacy severity:important` so
           the inference is explicit, not silent.
   1.4 Rewrite cross-references (the entry's body + its related links):
       - Any `../learnings/...` or `docs/learnings/...` link -> canonical `docs/learn/...` path
       - Any legacy filename link -> canonical slug-relative link
       - Preserve the link target's anchor text (do not silently change the prose)
   1.5 Add lineage: set migrated-from: docs/learnings/<type>/<original-filename>.md
       (so a future "where did this come from?" query resolves to the legacy path).
   1.6 Write the canonical entry to docs/learn/<type>/<slug>.md (create <type>/ subdir as needed).
2. Write the .migrated marker at docs/learn/.migrated containing:
   migrated-at: <ISO-8601>
   migrated-entries: <N>
   legacy-path: docs/learnings/
3. After all entries are written, build docs/learn/index.md from the canonical entries
   (per [index-format.md](index-format.md) — Index phase's format; Maintain's rebuild step
   runs the same format). The legacy docs/learnings/INDEX.md is NOT carried over — the new
   index is derived from the canonical entry files (single source of truth).
4. Do NOT delete docs/learnings/ (the legacy store stays; superseded, read-only).
   Record migration: <N> entries migrated in the maintain log.
```

## Lineage Preservation (authoritative)

Every migrated entry carries:

- `migrated-from: docs/learnings/<type>/<original-filename>.md` — the old path, so a reader tracking an old `docs/learnings/...` reference in a commit, a doc, or another entry's `related` link can resolve it to the canonical file.
- The **rewritten cross-references** — any `docs/learnings/...` link in the body becomes `docs/learn/...`, but the link's old form is not erased from the project's history: it is in git, and the `migrated-from` field is the in-file breadcrumb.

This is the deliberate avoid-the-gotcha move: the [path-convention-split](../../../docs/learn/gotcha/2026-08-07-path-convention-split-silently-noops.md) trap is that a convention change silently no-ops. The migration prevents the no-op by (a) recording the old path on every entry, (b) rewriting links so readers land on the new path, and (c) keeping the legacy store on disk so nothing is destroyed mid-migration. The old path knowledge and the new path knowledge **both** live in the canonical entry.

## Slug Derivation Rules (authoritative)

| Legacy filename pattern | Canonical slug | Notes |
| ----------------------- | -------------- | ----- |
| `<date>-<descriptive>.md` (date-prefixed) | `<descriptive>-<date>` | Date moved to suffix; the descriptive part stays. |
| `<descriptive>-<date>.md` (date-suffixed) | `<descriptive>-<date>` | Already in the canonical form; preserve. |
| `<descriptive>.md` (no date) | `<descriptive>` | Date found from the entry's `created_at`/`timestamp`; if present, optionally append as suffix for chronology. |
| `<descriptive>.md` with non-kebab chars | kebab-case(normalize) | Spaces/underscores → hyphens; collapse repeats; trim. |
| Collision (two legacy files normalize to the same slug) | `<slug>-a`, `<slug>-b` | Track the rename in the log; flag the duplicate for dedup in Maintain Step 2 (the collision likely indicates analogs). |

## Self-Gate Mechanics

The `.migrated` marker is the fast-path check. The slug-set-parity check is the robust path (covers the case where the marker was deleted but the entries migrated). Maintain runs both:

```
if docs/learn/.migrated exists OR slug-set(docs/learn/) == slug-set(docs/learnings/):
    migration: no-op (already migrated)
else:
    run the migration procedure
```

Slug-set parity is computed by listing the canonical files' slugs and the legacy files' derived slugs and comparing as sets; full equality = already migrated.

## Legacy Store Handling

- **Never deleted by the migration.** `docs/learnings/` stays on disk; its files are untouched by the migration's writes (migration only writes to `docs/learn/`). The legacy store becomes read-only in practice (no skill writes to it after migration).
- **Removal is a separate, explicit prune.** If the user wants to delete `docs/learnings/`, it is a prune operation in Maintain Step 4 (destructive, confirm each) — never part of the migration procedure itself. The recommended default is **keep** (knowledge is rarely deleted; the superseded store is a fallback if a `migrated-from` link needs the original).
- **The legacy `INDEX.md` is not migrated.** The new `docs/learn/index.md` is built from the canonical entries per [index-format.md](index-format.md). The legacy markdown-table `INDEX.md` is a different format; carrying it over would re-introduce the format-mismatch the canonical hybrid format resolves.

## Smart Pause Triggers

The migration rewrite is destructive (it rewrites 28 entry paths + every cross-reference). It pauses in Smart mode and **always surfaces in Autopilot** (per [interaction-mode-propagation.md](interaction-mode-propagation.md) — destructive never silent):

- The migration will run for the first time (rewrite 28 entries + cross-refs) — confirm before starting.
- A slug collision was detected during derivation (decide the qualifier; likely an analog for Maintain Step 2).
- An inferred numeric score from a legacy `severity` value is being recorded (the user may want to override the inference).

## Validation (Maintain Step 1 re-checks)

- Every legacy file has a corresponding canonical file at `docs/learn/<type>/<slug>.md` with:
  - canonical frontmatter (per [entry-schema.md](entry-schema.md))
  - `migrated-from` set
  - cross-references rewritten to `docs/learn/...`
- The `.migrated` marker exists with `migrated-at` and `migrated-entries: <N>` matching the count.
- `docs/learn/index.md` was built from the canonical entries (not the legacy `INDEX.md`).
- `docs/learnings/` is untouched by the migration writes.

## Failure-Condition Reference

| Trigger                                                  | Outcome per this reference                              |
| -------------------------------------------------------- | ------------------------------------------------------- |
| `docs/learnings/` exists but `docs/learn/` cannot be created (perms) | Category 4 recovery per [error-handling.md](error-handling.md); ask the user to fix perms |
| A legacy entry's body has an unresolvable cross-ref (target not in the legacy store, not a slug) | Keep the link's prose; log it; the user fixes the target later |
| Slug-set parity is partial (half-migrated state)          | Run the migration for the missing files only; do not rewrite the already-migrated ones (the idempotency invariant) |
| A collision requires a `-a`/`-b` qualifier                 | Apply the qualifier, log the rename, flag the analog for Maintain Step 2 (dedup) |

## Notes

- This reference is the single source of truth for the migration procedure. Maintain invokes it; the modules and the orchestrator never re-derive the slug rules or the frontmatter normalization inline.
- The migration is **decisions-not-logs** in action: it converts a stale `INDEX.md`-based legacy store into a canonical, schema-conformant knowledge base with lineage — not a session dump. The migration's output is durable knowledge, reorganized and normalized, never a transient record.
- The `.migrated` marker is a soundness check, not a load-bearing file: deleting it triggers slug-set-parity verification on the next Maintain run, and the migration is a no-op if parity holds. The marker is the fast path, not the gate.
- The legacy store's `severity` field maps to the canonical `applicability` numeric scores **only** because the canonical enum is derived from those scores ([index-format.md](index-format.md)). The migration does the inference once; the enum derivation happens at index time exactly as it does for new entries.