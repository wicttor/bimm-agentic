---
title: Index Update Artifact
description: Template for the Index Update Artifact produced by the Index phase. Carries the entry-path, the resolved slug, the derived index-applicability enum, the index-action (created/updated/merged), the index-coherence flag, and any merge de-index performed. The authoring run's final artifact; the entry is now durable at docs/learn/<type>/<slug>.md and indexed in docs/learn/index.md.
type: template
version: 1.0
timestamp: "2026-08-08"
---

# Index Update Artifact

The product of the **Index** phase is the authoring run's final artifact. Index **writes** the entry file at `docs/learn/<type>/<slug>.md` (upsert on `slug`), derives the index-record `applicability` enum from the per-entry numeric scores per [index-format.md](../../index-format.md), and **upserts** `docs/learn/index.md` (YAML `entries:` block record plus By Category / By Domain markdown rows). On a merge resolution, Index de-indexes the analog (removes its index record), writes `superseded-by` into the analog's file, and adds the analog's `slug` to the canonical's `related` — keeping the analog's file (lineage preserved, never deleted). Index is the only authoring-phase writer of the entry file and the index.

## Schema

```yaml
index-id: YYYY-MM-DD-NNN-index
refine-id: YYYY-MM-DD-NNN-refine
capture-id: YYYY-MM-DD-NNN-capture
learn-id: YYYY-MM-DD-NNN
input-shape: explicit | candidate
interactionMode: detailed | smart | autopilot
status: complete
timestamp: ISO-8601 timestamp

entry-path: "docs/learn/<type>/<slug>.md"      # where the entry file was written
slug: "<resolved-slug>"                       # the upsert key (matches the entry's frontmatter slug)
type: decision | pattern | gotcha | workflow  # the entry's type

index-applicability: DIRECT | RECOMMENDED | CONTEXTUAL | HISTORICAL | INFORMATIONAL
                                              # DERIVED per index-format.md from the frontmatter's numeric scores

index-action: created | updated | merged      # what Index did
                                              # created: new slug written
                                              # updated: existing slug overwritten (update-existing resolution)
                                              # merged: merge-into-canonical — analog de-indexed + canonical updated

merge:                                        # present ONLY when index-action == merged
  analog-slug: <the analog being de-indexed>
  analog-file: "docs/learn/<type>/<analog-slug>.md"
  analog-deindexed: true                       # its index record + rows removed; file KEPT
  analog-superseded-note-written: true         # superseded-by + status:obsolete written into the analog's frontmatter
  canonical-related-updated: true             # analog-slug added to canonical's related list

index-coherent: true                          # the YAML entries: length == on-disk entry-file count;
                                              # per-type (N) counts consistent; no duplicate rows; the orchestrator's gate #5

source-candidate: <carried through> | null

entry-written: true                           # the entry file was written (false only on a failed-write recovery; would be status: failed)
index-updated: true                           # docs/learn/index.md was upserted
```

Also save the Index Update Artifact to `docs/learn/.index/<index-id>.md`.

## Validation Rules

- **index-id:** Required. Format `YYYY-MM-DD-NNN-index` per [id-generation.md](../../id-generation.md).
- **refine-id, capture-id, learn-id, input-shape:** Required, inherited (cross-phase consistency).
- **interactionMode:** Required, identical across the authoring chain.
- **status:** Required. `complete`.
- **entry-path:** Required. Repo-relative, of the form `docs/learn/<type>/<slug>.md`; the directory `docs/learn/<type>/` created if missing.
- **slug:** Required. The resolved slug (matches the entry's frontmatter).
- **type:** Required. One of the four.
- **index-applicability:** Required. The **derived** enum, per [index-format.md](../../index-format.md) (not re-encoded inline here; the artifact records the result of applying the derivation rule to the frontmatter's numeric scores).
- **index-action:** Required. `created` (new slug), `updated` (existing slug overwritten via `update-existing`), or `merged` (`merge-into-canonical` executed).
- **merge:** Required when `index-action: merged`; absent otherwise. On a merge:
  - `analog-deindexed: true` — the analog's record was removed from the YAML block + By Category / By Domain tables.
  - `analog-superseded-note-written: true` — `superseded-by: <canonical-slug>` and `status: obsolete` written into the analog file's frontmatter.
  - `canonical-related-updated: true` — the analog's `slug` added to the canonical's `related` list.
  - The analog **file is never deleted** (lineage preservation per [dedup-rules.md](../../dedup-rules.md)).
- **index-coherent:** Required. `true` — the post-upsert invariants hold (YAML length == on-disk count; per-type counts consistent; no duplicate rows). If `false`, Index reconciled in-place (non-destructive) and flagged it; the orchestrator's quality gate #5 requires `true` to finalize the run.
- **entry-written, index-updated:** Required. `true` on success; `status: failed` would cover a write failure.

## Example (created — new decision entry)

```yaml
index-id: 2026-08-08-001-index
refine-id: 2026-08-08-001-refine
capture-id: 2026-08-08-001-capture
learn-id: 2026-08-08-001
input-shape: explicit
interactionMode: smart
status: complete
timestamp: 2026-08-08T14:34:00Z
entry-path: docs/learn/decision/use-pnpm-when-both-lockfiles-exist.md
slug: use-pnpm-when-both-lockfiles-exist
type: decision
index-applicability: DIRECT                  # current_project=8, general=6 → RECOMMENDED; refine higher if any
index-action: created
index-coherent: true
source-candidate: null
entry-written: true
index-updated: true
```

## Example (merged — analog de-indexed, canonical updated, lineage preserved)

```yaml
index-id: 2026-08-08-002-index
refine-id: 2026-08-08-002-refine
capture-id: 2026-08-08-002-capture
learn-id: 2026-08-08-002
input-shape: candidate
interactionMode: smart
status: complete
timestamp: 2026-08-08T14:42:00Z
entry-path: docs/learn/gotcha/ttl-must-propagate-to-redis-set.md
slug: ttl-must-propagate-to-redis-set
type: gotcha
index-applicability: DIRECT                  # current_project=8, general=7 → DIRECT
index-action: merged
merge:
  analog-slug: redis-ttl-set-vs-expire
  analog-file: docs/learn/gotcha/redis-ttl-set-vs-expire.md
  analog-deindexed: true
  analog-superseded-note-written: true
  canonical-related-updated: true
index-coherent: true
source-candidate:
  title: "Redis TTL must be propagated to the SET command"
  domain: data-storage
  source: { type: candidate, reference: "2026-07-10-001-review#F02" }
  summary: "TTL test failed because SET ... EX must carry the TTL."
  type: gotcha
entry-written: true
index-updated: true
```

## Notes

- Index is the **sole authoring-phase writer** of the entry file and the index; the upsert on `slug` is idempotent (a re-author overwrites, never duplicates).
- The `index-applicability` enum is **derived** from the frontmatter's numeric scores per [index-format.md](../../index-format.md); the artifact records the **result** of that derivation — it does not re-encode the derivation rule (no second formula).
- A `merged` action de-indexes the analog **without deleting its file** — the analog carries `superseded-by` + `status: obsolete`, and the canonical's `related` list links the analog's `slug`. The reader can walk either direction. This honors the [dedup-rules.md](../../dedup-rules.md) lineage-preservation rule (the `path-convention-split` gotcha is the model: a merged entry carries both the old and new knowledge, never just the new).
- `index-coherent: true` is the orchestrator's quality gate #5; the Index phase is responsible for leaving the index coherent (the YAML block, the per-type `(N)` counts, and the By Domain bullets are all in lockstep with the on-disk file tree).
- This artifact is the authoring run's **final** output. The Orchestrator marks the run complete; the durable knowledge entry now lives at `entry-path` and is discoverable via `docs/learn/index.md` (the source-of-truth index Plan/Work/Review search).