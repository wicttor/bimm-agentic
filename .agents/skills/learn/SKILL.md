---
name: learn
description: "Curate the project's durable knowledge base — decisions, patterns, gotchas, workflows — as the source of truth that Plan/Work/Review search via docs/learn/index.md. Orchestrates Capture -> Refine -> Index for authoring one entry, plus an on-demand Maintain pass (dedup/refresh/prune) and a one-time legacy-to-canonical migration. Stores decisions, not logs; knowledge, not sessions; durable entries, not session memory. Local-only; no agent dependency; no fallback paths."
disable-model-invocation: true
---

# Learn

Orchestrates the project's durable knowledge base. Authors durable **knowledge entries** — `decision` / `pattern` / `gotcha` / `workflow` — through `Capture -> Refine -> Index`, and maintains them through an on-demand `Maintain` pass (dedup / refresh / prune) plus a one-time legacy-to-canonical migration. The knowledge base lives at `docs/learn/` and is the **source of truth** that Plan, Work, and Review search via `docs/learn/index.md`. No agent dependency, no fallback paths.

> **Store decisions, not logs; knowledge, not sessions.** This skill authors durable, decision-shaped entries — it does **not** extract transient session transcripts or event logs. An entry is a conclusion a future skill needs; it is never a "what we did this session" record.

## Skill Invocation

This skill is invoked by prompting:

- `/learn <type> <text>` — **explicit author.** `<type>` is one of `decision` / `pattern` / `gotcha` / `workflow`; `<text>` is the content (prose, a reference to a file/commit, or a short description to expand). Runs the Capture → Refine → Index pipeline and writes one durable entry to `docs/learn/<type>/`.
- `/learn <candidate-ref>` — **curate a candidate.** `<candidate-ref>` points at a Work `review-id` (the Work Report's `learnings-to-capture` list) or a Review `report-id` (the Review Report's `learnings-to-capture` list). Capture refines each candidate into a durable entry; the user confirms which to author.
- `/learn maintain` — **on-demand maintenance.** Runs the Maintain phase standalone: dedup, refresh, prune stale entries, and (once) migrate the legacy `docs/learnings/` store into the canonical `docs/learn/` store. Does not author new entries.
- `/learn` (no args) — ask: "What would you like to capture? Provide a type (decision/pattern/gotcha/workflow) and text, a candidate ref, or `maintain`."

This skill runs the learn pipeline, authoring/maintaining knowledge entries, acting as the Orchestrator.

## Interaction Method

- Ask the user one structured question at a time (2–4 concrete options) using the agent's interactive question capability; never hardcode a specific tool name.
- If input is empty, ask: "What would you like to capture? Provide a type and text, a candidate ref, or `maintain`."

Before starting the workflow, ask the user to choose an interaction mode:

- **Detailed** — Confirm at each phase transition and before each destructive write (entry creation, index rewrite, prune). Maximum control. Best for authoritative decisions or sensitive maintenance.
- **Autopilot** — All phases run automatically; only the final outcome is reported. Fastest. Best for routine, well-scoped entries.
- **Smart** — Phases run automatically; pause only on destructive or ambiguous operations (a likely-duplicate detected at Refine; a prune that would delete an entry at Maintain; a migration that would rewrite 28 legacy paths).

Store in the context object:

```yaml
interactionMode: detailed | smart | autopilot
```

**Propagation:** `interactionMode` flows into the `capture`, `refine`, `index`, and `maintain` artifacts; each downstream phase reads it to adjust confirmation behaviour (detailed = pause every transition + before destructive writes; autopilot = run all; smart = pause only on duplicates, prunes, and migrations).

## Orchestration Implementation

Each phase runs sequentially: the orchestrator calls the phase module, receives the output artifact, validates it with a quality gate, and passes the artifact to the next phase.

### INPUT

- Receives a context object from the user, a saved prompt, a document, or a combination.
- **Three input shapes:**
  1. **Explicit** — `/learn <type> <text>`. Capture drafts an entry of the named type from the text. The canonical path for authoring a decision/pattern/gotcha/workflow.
  2. **Candidate** — `/learn <candidate-ref>`. The ref resolves to a Work `review-id` (`docs/plans/.work/.review/<id>.md`) or a Review `report-id` (`docs/review/.report/<id>.md`); Capture reads its `learnings-to-capture` list and, for each candidate, drafts the corresponding entry. The user confirms which candidates become durable entries.
  3. **Maintain** — `/learn maintain`. Runs only the Maintain phase (dedup / refresh / prune); bypasses Capture → Refine → Index (no new entry is authored).
- **If no context is provided**, ask: "What would you like to capture? Provide a type and text, a candidate ref, or `maintain`."
- **Unified key:** downstream phases key off a `learn-id` umbrella (`YYYY-MM-DD-NNN`), allocated by Capture. For Maintain-only runs, Maintain allocates its own `maintain-id` (no `learn-id` umbrella — there is no newly authored entry).
- Output: [Learn Input Artifact](references/templates/artifacts/learn-input.md)

### Pre-Flight Check

Before starting the learn pipeline, the orchestrator verifies that required folders exist:

- `docs/learn/` — must exist for writing entries and the index; the seed `docs/learn/index.md` must exist (empty `entries:` block is valid — the legacy migration populates 28 entries)
- `docs/learn/.capture/`, `docs/learn/.refine/`, `docs/learn/.index/`, `docs/learn/.maintain/` — must exist for saving the phase artifacts

**Self-Healing:** If any are missing, the orchestrator automatically creates them (`mkdir -p`), and seeds `docs/learn/index.md` from the [index-format.md](references/index-format.md) template. This allows the Learn skill to run even if `arreio-init` wasn't explicitly run.

For **explicit** input, verify `<type>` is one of the four; if not, ask to pick from the four. For **candidate** input, verify the ref resolves to a non-empty `learnings-to-capture` list; if the list is empty, inform the user (no candidates to curate). For **maintain** input, verify `docs/learn/` exists; if only the legacy `docs/learnings/` exists, the migration runs first as part of Maintain.

### Phases

| Phase | Phase Module                          | Output Artifact                                                              | Saved to                               |
| ----- | ------------------------------------ | ---------------------------------------------------------------------------- | -------------------------------------- |
| 1     | [Capture](modules/capture.md)        | [Captured entry](references/templates/artifacts/captured-entry.md)           | `docs/learn/.capture/<id>.md`   |
| 2     | [Refine](modules/refine.md)          | [Refined entry](references/templates/artifacts/refined-entry.md)             | `docs/learn/.refine/<id>.md`    |
| 3     | [Index](modules/index.md)            | [Index update](references/templates/artifacts/index-update.md)               | `docs/learn/.index/<id>.md`     |
| 4     | [Maintain](modules/maintain.md) _(on demand)_ | [Maintain log](references/templates/artifacts/maintain-log.md)   | `docs/learn/.maintain/<id>.md`  |

**Phase 4 is on-demand.** A normal `/learn <type> <text>` run executes Phases 1–3 and writes one entry; Maintain runs only via `/learn maintain`. The migration procedure (legacy → canonical) is a Maintain operation, run once.

### Quality Gates

Between phases, the orchestrator validates the output artifact before passing it to the next phase:

1. **Schema validation** — required fields present and well-formed (see [error-handling.md](references/error-handling.md) for the per-type field list).
2. **Cross-phase consistency** — IDs (`learn-id`, `capture-id`, `refine-id`, `index-id`, `maintain-id`) match the upstream artifacts; `interactionMode` is identical across artifacts.
3. **Status check** — the artifact's `status` is `complete` (not `pending` or `failed`).
4. **Entry coherence (after Refine)** — the candidate entry has a valid `type` (one of the four), a unique `slug`, and all required frontmatter fields (`domain`, `tags`, `applicability`, `summary`); the per-entry frontmatter and the index-record shape agree with [entry-schema.md](references/entry-schema.md); no exact duplicate was detected per [dedup-rules.md](references/dedup-rules.md).
5. **Index idempotency (after Index)** — `docs/learn/index.md` was updated by upserting on the entry's `slug` (YAML block entry + By Category / By Domain rows); the YAML `entries:` length matches the on-disk entry-file count; no duplicate index rows; totals (Decision/Pattern/Gotcha/Workflow counts) are consistent.

If a gate fails, the orchestrator returns to the producing phase with the error context (per the recovery workflow in [error-handling.md](references/error-handling.md)).

### Index Registration

The **Index phase** is the skill's only index writer for authored entries; the **Maintain phase** is the only index rebuilder:

| Phase    | Registers To                       | Update                                                                                                       |
| -------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Index    | `docs/learn/<type>/<slug>.md` + `docs/learn/index.md` | Write the entry file; upsert the YAML `entries:` block record **and** the By Category / By Domain markdown rows, keyed on `slug`. Idempotent on `slug`. |
| Maintain | `docs/learn/index.md`              | Rebuild the index from the on-disk file tree (full reconcile): re-scan `docs/learn/<type>/*.md`, regenerate the YAML block + tables, and (once) migrate legacy `docs/learnings/` entries. Idempotent. |

**Idempotency rule:** re-authoring the same decision upserts on `slug` (overwrites the entry file and its index record, never duplicates). Refine rejects an exact duplicate (same `slug`) and asks to either update the existing entry or pick a new slug — never silently two entries (per [dedup-rules.md](references/dedup-rules.md)).

### FINAL OUTPUT

- **Entry file:** Saved to `docs/learn/<type>/<slug>.md` with the [entry-schema.md](references/entry-schema.md) frontmatter (`type`, `domain`, `tags`, `applicability`, `summary`, plus `created_at`/`updated_at`, `source`, `confidence`, and `related`).
- **Index:** `docs/learn/index.md` updated — a YAML `entries:` block (the `filename` / `domain` / `tags` / `applicability` / `summary` record per entry — the **read contract** that Plan/Work/Review's [learnings-gate-logic.md](../plan/references/learnings-gate-logic.md) parses) plus the human-readable By Category / By Domain tables.
- **Maintain Log (if `/learn maintain`):** Saved to `docs/learn/.maintain/<maintain-id>.md`, recording the dedup/refresh/prune operations performed and any migration applied.
- **Not produced:** This skill produces **no session log, no event transcript, no "what we did."** Only durable entries and the index.

## References

The orchestrator and phase modules share these reference files:

| Reference                                                                       | Used By                                  |
| ------------------------------------------------------------------------------- | ---------------------------------------- |
| [error-handling.md](references/error-handling.md)                               | All phases (Step 0 verification)         |
| [id-generation.md](references/id-generation.md)                                 | Capture, Index, Maintain (entry-id + slug allocation) |
| [interaction-mode-propagation.md](references/interaction-mode-propagation.md)   | All phases (Step N confirmation)        |
| [entry-schema.md](references/entry-schema.md)                                   | Capture + Refine (the per-entry frontmatter + the index-record shape — the write contract) |
| [dedup-rules.md](references/dedup-rules.md)                                     | Refine + Maintain (duplicate detection, merge, lineage preservation) |
| [index-format.md](references/index-format.md)                                   | Index (the canonical `docs/learn/index.md` format — YAML block + tables) |
| [migration-bootstrap.md](references/migration-bootstrap.md)                     | Maintain (one-time `docs/learnings/` → `docs/learn/` migration) |

Artifact templates live in [references/templates/artifacts/](references/templates/artifacts/):

| Template                                                                       | Produced By |
| ----------------------------------------------------------------------------- | ----------- |
| [learn-input.md](references/templates/artifacts/learn-input.md)               | Orchestrator |
| [captured-entry.md](references/templates/artifacts/captured-entry.md)         | Capture   |
| [refined-entry.md](references/templates/artifacts/refined-entry.md)           | Refine    |
| [index-update.md](references/templates/artifacts/index-update.md)             | Index     |
| [maintain-log.md](references/templates/artifacts/maintain-log.md)             | Maintain  |

### Write side vs read side (single source of truth)

> The Learn skill **owns the write side** — the per-entry frontmatter schema ([entry-schema.md](references/entry-schema.md)) and the `docs/learn/index.md` format ([index-format.md](references/index-format.md)). The Plan skill **owns the read side** — the keyword/relevance search in [learnings-gate-logic.md](../plan/references/learnings-gate-logic.md), reused cross-skill by Work and Review. The two contracts share the **index-record shape** (`filename`, `domain`, `tags`, `applicability`, `summary` + the `applicability` enum). Learn **guarantees** its index satisfies that shape; it does **not** re-encode the search algorithm (honoring the secondary-spec-contradicts-authoritative-matrix gotcha — one algorithm lives in Plan's gate-logic, one schema lives here; see `docs/learn/gotcha/2026-08-07-secondary-spec-contradicts-authoritative-matrix.md` post-migration).

## Core Principles

- **Source of Truth, Not Memory:** `docs/learn/` is the project's durable, authoritative knowledge base. Plan/Work/Review search it; this skill authors and maintains it. Not a session memory, not an event log.
- **Store Decisions, Not Logs; Knowledge, Not Sessions:** Every entry is a conclusion a future skill needs — a decision, a confirmed pattern, a recurring gotcha, or a workflow convention. Never an ephemeral "what we did this session."
- **One Entry per Conclusion; Four Types:** `decision` (authoritative choices), `pattern` (confirmed, reusable), `gotcha` (recurring traps + prevention), `workflow` (conventions). One entry carries one conclusion.
- **Idempotent Writes:** Authoring a known `slug` upserts the entry file and its index record — never duplicates. Maintain rebuilds the index from the file tree and is idempotent. Re-running a normal `/learn` over the same content merges, it does not pile up.
- **Dedup Welcomed, Lineage Preserved:** Decisions don't duplicate, but analogs exist; dedup merges an analog into the canonical entry and records the merge (the path-convention-split entry is the model — a migrated entry carries both the old and new path knowledge, not just the new; see `docs/learn/gotcha/2026-08-07-path-convention-split-silently-noops.md` post-migration).
- **Write Side / Read Side Split:** Learn owns the entry schema and the index format; Plan owns the search algorithm. Both agree on the index-record shape. Never re-encode the other side's logic inline.
- **Transparent Artifacts:** Each phase produces an explicit output artifact for the next phase.
- **Behavior-Described, Tool-Agnostic:** Steps describe required capabilities ("write the entry file", "rebuild the index", "ask the user to confirm"), not specific tool names.
- **Stay Portable:** Use repository-relative paths only — `docs/learn/<type>/<slug>.md`, never absolute.
- **Error Handling:** Fail explicitly, not silently; each phase has clear error handling with recovery suggestions.
- **Single Source of Truth:** This skill defines all its own write-side rules; it does not depend on any external agent rule file.
- **Local-Only:** No GitHub sync, no outbound posting; entries live on disk under `docs/learn/`.