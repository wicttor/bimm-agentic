---
title: Index Format
description: Authoritative reference for the Index phase (upsert) and Maintain phase (rebuild). Defines the canonical docs/learn/index.md structure: a YAML entries block (the read-contract record per entry — filename/domain/tags/applicability/summary) plus the human-readable By Category / By Domain markdown tables. Defines the applicability-enum derivation from the per-entry numeric scores and the idempotency rule.
type: reference
version: 1.0
timestamp: "2026-08-08"
---

# Index Format

Authoritative reference for the canonical `docs/learn/index.md` format. Defines the **hybrid structure** — a YAML `entries:` block (the read-contract record per entry) plus the human-readable **By Category** / **By Domain** markdown tables — and the **`applicability` enum derivation** from the per-entry numeric scores (the write→read projection). Index upserts one record per authoring run; Maintain rebuilds the whole index from the file tree (the source of truth). Both apply this format; neither re-encodes it.

> This is the file Plan, Work, and Review all read via [learnings-gate-logic.md](../../plan/references/learnings-gate-logic.md). The YAML `entries:` block is the **read contract** — the five-field record shape the gate-logic parses. The markdown tables are the human-readable projection of the same data. Both are derived from the per-entry frontmatter ([entry-schema.md](entry-schema.md)); the index never stores a field the entry's frontmatter cannot produce. **No second formula** — the search algorithm lives in Plan's gate-logic; the format lives here.

## Canonical Structure

```markdown
# Knowledge Index

The project's durable knowledge base. Source of truth for decisions, patterns,
gotchas, and workflows. Plan/Work/Review search this index via the YAML block.

**Last updated:** <ISO-8601>

## Entries

```yaml
entries:
  - filename: docs/learn/decision/critical-risk-tier-security-payments-2026-07-04.md
    domain: planning
    tags: [risk-assessment, security]
    applicability: DIRECT
    summary: CRITICAL risk tier above HIGH for security/payments; always external research
  - filename: docs/learn/gotcha/secondary-spec-contradicts-authoritative-matrix.md
    domain: skill-design
    tags: [single-source-of-truth, contradictions]
    applicability: DIRECT
    summary: Don't re-encode an authoritative matrix as a contradicting secondary formula
  # ...one record per on-disk entry; de-indexed (obsolete/superseded) entries are EXCLUDED
```

## By Category

### Decision (N)

| File | Title | Domain | Applicability |
|------|-------|--------|---------------|
| [critical-risk-tier-security-payments-2026-07-04.md](decision/critical-risk-tier-security-payments-2026-07-04.md) | Introduce CRITICAL Risk Tier Above HIGH for Security/Payments Areas | planning | DIRECT |
| ... | ... | ... | ... |

### Pattern (N)
... (same table shape, a row per pattern)

### Gotcha (N)
... (same table shape, a row per gotcha)

### Workflow (N)
... (same table shape, a row per workflow)

## By Domain

- **planning:** critical-risk-tier-security-payments-2026-07-04, plan-tier-selection-algorithm-2026-07-04, ...
- **skill-design:** pipeline-phase-module-template-2026-07-04, quality-gates-pipeline-orchestration-2026-07-04, ...
- **artifact-naming:** daily-counter-artifact-naming-2026-07-02, cross-phase-id-chaining-2026-07-04, ...
- ... (one bullet per domain, listing the slugs; de-indexed entries excluded)
```

## Read-Contract Record (the YAML `entries:` block)

Each record carries **exactly these five fields** — the gate-logic's read contract. No more, no fewer:

```yaml
- filename: docs/learn/<type>/<slug>.md    # REQUIRED. Repo-relative path to the entry file.
  domain: <primary-domain>                # REQUIRED. The entry's frontmatter domain.
  tags: [<tag>, ...]                       # REQUIRED. The entry's frontmatter tags (carried verbatim).
  applicability: <enum>                    # REQUIRED. Derived per the table below — never stored on the entry.
  summary: <1-2 sentence summary>         # REQUIRED. The frontmatter summary, or the body Problem/Solution derivation.
```

- `filename` — repo-relative; uses forward slashes; stable (the slug is the upsert key, so the filename is stable across re-authors).
- `domain`, `tags` — carried verbatim from the entry's frontmatter.
- `applicability` — **derived** (see below), never stored on the entry's frontmatter (the entry keeps the numeric scores; the index projects to the enum).
- `summary` — the entry's frontmatter `summary` field if present; else the first 1–2 sentences of the entry's Problem/Solution body (Capture/Refine/Index derive this; Maintain re-derives on rebuild).

## Applicability Enum Derivation (authoritative)

The write side (the entry frontmatter per [entry-schema.md](entry-schema.md)) stores `applicability: { current_project: N, general: N }`. The index-record projects this to a single enum (the read side's vocabulary). The derivation:

| Condition (write-side numerics)           | Enum          | Gate-logic handling                 |
| ----------------------------------------- | ------------- | ----------------------------------- |
| `current_project ≥ 8 AND general ≥ 7`    | `DIRECT`      | HIGH relevance — included           |
| `current_project ≥ 5 AND general ≥ 5`    | `RECOMMENDED` | MEDIUM relevance — included         |
| `general ≥ 5`                             | `CONTEXTUAL`  | MEDIUM relevance — included         |
| `general ≥ 3`                             | `HISTORICAL`  | LOW relevance — excluded by gate    |
| otherwise                                 | `INFORMATIONAL` | LOW relevance — excluded         |

The enum is computed by Index Step 1 (for upsert) and Maintain Step 5 (for rebuild) from the entry's frontmatter. **It is never stored on the entry** — projecting from the numeric scores to the enum at index time avoids a second-source contradiction (honoring the secondary-spec gotcha: one mapping lives here, the entry keeps the rich numerics).

> Gate-logic relevance: gate-logic matches keywords, then scores HIGH/MEDIUM/LOW. The enum above maps DIRECT/RECOMMENDED/CONTEXTUAL/HISTORICAL/INFORMATIONAL to that HIGH/MEDIUM/LOW banding (DIRECT/RECOMMENDED/CONTEXTUAL are potentially HIGH/MEDIUM; HISTORICAL/INFORMATIONAL are LOW). The mapping lives in the gate-logic, not here — here we only produce the enum the gate-logic expects.

## By Category / By Domain Tables

The human-readable projection. Both are **derived** from the same on-disk entries (the YAML block and the tables are in lockstep; Index/Maintain never allow them to drift):

- **By Category** — four `### <Type> (N)` subsections (Decision/Pattern/Gotcha/Workflow), each a `| File | Title | Domain | Applicability |` markdown table, one row per entry of that type. The `(N)` is the count of that type's entries.
- **By Domain** — one bullet per domain, listing the slugs of that domain's entries, comma-separated. Covering all on-disk domains (the union of every entry's `domain`).

`Title` is the entry's body `# <Title>` heading (Title Case), carried verbatim. `Applicability` is the same derived enum as the YAML record. `De-indexed` entries (frontmatter `status: obsolete` or a `superseded-by` whose canonical is present) are **excluded** from both the YAML block and the tables.

## Idempotency

`docs/learn/index.md` is upserted by `slug`:

- **Upsert (Index Step 3)** — the record is updated in place in the YAML `entries:` block (matched on `filename`), and the row is updated in place in the By Category table and the By Domain bullet (matched on `slug`/title). A re-author with the same `slug` overwrites the record, never appends a second.
- **Rebuild (Maintain Step 5)** — the file tree is the source of truth: re-scan `docs/learn/<type>/*.md`, regenerate the YAML block and the tables, recompute the per-type `(N)` counts and the By Domain bullets. Idempotent (re-running rebuild over an unchanged tree produces an identical file).

**Totals coherence** is the invariant: the YAML `entries:` block length must equal the count of non-de-indexed entry files on disk; each `### <Type> (N)` count must equal the number of records of that type in the YAML block; the By Domain bullets must list the same entries. If any drifts, Index reconciles in-place (non-destructive) and Maintain fully rebuilds.

## Validation (Index Step 3 / Maintain Step 5 re-checks)

- Every on-disk entry (non-de-indexed) has exactly one YAML record and exactly one row in By Category and one slug in By Domain.
- Every `applicability` enum in the index matches the derivation for that entry's frontmatter numerics (no drift).
- The `(N)` counts match the YAML records per type.
- The `summary` is present for every record (body-derived if absent in frontmatter).
- No two records share a `filename` (the upsert key is unique).

## Failure-Condition Reference

| Trigger                                                  | Outcome per this reference                              |
| -------------------------------------------------------- | ------------------------------------------------------- |
| An entry's frontmatter lacks numerics entirely (legacy pre-Schema entry) | Migration/Maintain infers from the legacy `severity` per [migration-bootstrap.md](migration-bootstrap.md); no inference here. |
| Two on-disk entries have the same `slug` (corrupt store)  | Index/Maintain detect the duplicate `filename` in the YAML; flag; the user picks the canonical (dedup per [dedup-rules.md](dedup-rules.md)). |
| An entry has a `superseded-by` but is still in the YAML block | Refine/Maintain de-index it (remove the record + row); the canonical's `related` already links its slug. |

## Notes

- This reference is the single source of truth for the canonical index format, the read-contract record (five fields), the applicability-enum derivation, and the idempotency rules. Index and Maintain apply it; the orchestrator and modules never re-encode the format inline.
- The YAML block and the markdown tables are **two projections of one on-disk truth** (the entry files). Allowing them to drift would re-introduce the secondary-spec gotcha at the index level; the idempotency invariant prevents that.
- The `index-applicability` enum is the bridge between the write side (rich numerics) and the read side (HIGH/MEDIUM/LOW banding). It is **derived**, never stored on the entry — stored once here, derived once at index time.
- De-indexed entries (obsolete / superseded) remain on disk but are removed from the index. `docs/learn/index.md` is an index of **active** knowledge, not a registry of every file ever written.