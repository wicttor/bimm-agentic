---
title: Captured Entry Artifact
description: Template for the Captured Entry Artifact produced by the Capture phase. Carries the drafted entry (frontmatter + per-type body per entry-schema), the proposed slug, the learn-id umbrella, the allocate capture-id, the source-candidate trace, and the inferred-flag; consumed by Refine for validation + dedup.
type: template
version: 1.0
timestamp: "2026-08-08"
---

# Captured Entry Artifact

The product of the **Capture** phase is a drafted entry — the per-type frontmatter and body per the authoritative [entry-schema.md](../../entry-schema.md) (which Capture looks up, never re-encodes) — plus the proposed `slug`, the allocated `learn-id` umbrella, and the `source-candidate` trace. Refine consumes it for validation + duplicate/analog check. Capture drafts; it does not validate uniqueness or write the file.

## Schema

```yaml
capture-id: YYYY-MM-DD-NNN-capture
learn-id: YYYY-MM-DD-NNN                 # umbrella id, allocated here, carried through Capture→Refine→Index
input-shape: explicit | candidate
interactionMode: detailed | smart | autopilot
status: complete
timestamp: ISO-8601 timestamp

target-type: decision | pattern | gotcha | workflow   # the entry's type; matches the prepared body section template
slug: "<proposed-kebab-case-slug>"        # global, descriptive; Refine uniqueness-checks; Index upserts

frontmatter:                              # authored per entry-schema.md; Capture drafts, Refine validates
  type: <same as target-type>
  slug: <same as above>
  domain: <primary-domain>
  priority: important | normal | null
  applicability: { current_project: <0-10>, general: <0-10> }
  tags: [tag-1, ...]
  created_at: ISO-8601
  updated_at: ISO-8601
  source: { type: commit | candidate | user, reference: <sha | report-id#finding-id | text>, extracted_at: ISO-8601 }
  confidence: high | medium | low | null
  # Lineage fields intentionally absent at capture (set by Maintain/Index on merge/migrate).

body: |                                   # the per-type section template per entry-schema.md
  # <Title in Title Case>

  ## Problem
  <drafted from the text/candidate>

  ## Solution / Pattern / Trap / Convention (per type)
  <drafted content>

  ## ...remaining sections for the type... (Decision Rationale / When to Apply / Solution-Prevention / Why / Application / Example / Related Learnings / Source)

source-candidate: | null                  # the picked Work/Review candidate (type, domain, source {finding-id}, summary),
                                           # or null for explicit input; carried for source traceability
inferred: true | false                     # true when drafted from a short description or candidate (a pause trigger);
                                           # false when grounded in a concrete ref/file the user provided
```

Also save the Captured Entry Artifact to `docs/learn/.capture/<capture-id>.md`.

## Validation Rules

- **capture-id:** Required. Format `YYYY-MM-DD-NNN-capture` per [id-generation.md](../../id-generation.md).
- **learn-id:** Required. Allocated by Capture (the umbrella); reuses the capture counter's NNN.
- **input-shape:** Required. `explicit` or `candidate` (a `maintain` shape must not reach Capture — routing error per [error-handling.md](../../error-handling.md)).
- **interactionMode:** Required, propagated from the Learn Input Artifact.
- **status:** Required. `complete`.
- **target-type:** Required. One of `decision` / `pattern` / `gotcha` / `workflow`.
- **slug:** Required. Proposed kebab-case; globally unique namespace; descriptive. Refine uniqueness-checks.
- **frontmatter:** Required. Authored per [entry-schema.md](../../entry-schema.md). Required fields: `type`, `slug`, `domain`, `applicability.current_project`, `applicability.general`, `tags` (2–6), `created_at`, `updated_at`, `source`. Optional: `priority` (default `normal`), `confidence` (default `medium`). Lineage fields (`migrated-from`/`superseded-by`/`related`/`status`) absent at capture.
- **body:** Required. The per-type section template per [entry-schema.md](../../entry-schema.md) (e.g., a `decision` body has Problem / Solution / Decision Rationale / Application / Related Learnings). Refine validates the sections are present.
- **source-candidate:** Required (= the picked candidate) when `input-shape: candidate`; `null` when `input-shape: explicit`. Carried so Refine/Index can set the entry's `source` field pointing back at the Work/Review report + finding id.
- **inferred:** Required. `true` is a Capture Smart pause trigger (the draft was inferred from a short description or candidate — confirm intent).

## Example (explicit decision, grounded in a commit ref)

```yaml
capture-id: 2026-08-08-001-capture
learn-id: 2026-08-08-001
input-shape: explicit
interactionMode: smart
status: complete
timestamp: 2026-08-08T14:30:00Z
target-type: decision
slug: use-pnpm-when-both-lockfiles-exist
frontmatter:
  type: decision
  slug: use-pnpm-when-both-lockfiles-exist
  domain: tooling
  priority: normal
  applicability: { current_project: 8, general: 6 }
  tags: [package-management, npm, pnpm, lockfiles]
  created_at: 2026-08-08T14:30:00Z
  updated_at: 2026-08-08T14:30:00Z
  source: { type: commit, reference: "1ee04e2", extracted_at: 2026-08-08T14:30:00Z }
  confidence: high
body: |
  # Use pnpm When Both Lockfiles Exist

  ## Problem
  When a repo has both package-lock.json and pnpm-lock.yaml, invocations must pick one; the wrong choice causes ghost deps.

  ## Solution
  Prefer the lockfile matching package.json's packageManager field; otherwise ask the user.

  ## Decision Rationale
  Reuses the Work skill's Prepare-phase npm-vs-pnpm resolution; one consistent packageManager recorded across phases.

  ## Application
  Work skill Prepare Step 1; Review skill Prepare Step 3 detects the runner + packageManager for the test-context.

  ## Related Learnings
  (none yet)
source-candidate: null
inferred: false
```

## Example (candidate gotcha, inferred from a Work Report)

```yaml
capture-id: 2026-08-08-002-capture
learn-id: 2026-08-08-002
input-shape: candidate
interactionMode: smart
status: complete
timestamp: 2026-08-08T14:35:00Z
target-type: gotcha
slug: ttl-must-propagate-to-redis-set
frontmatter:
  type: gotcha
  slug: ttl-must-propagate-to-redis-set
  domain: data-storage
  priority: important
  applicability: { current_project: 8, general: 7 }
  tags: [redis, ttl, session-store, caching]
  created_at: 2026-08-08T14:35:00Z
  updated_at: 2026-08-08T14:35:00Z
  source: { type: candidate, reference: "2026-07-10-001-review#F02", extracted_at: 2026-08-08T14:35:00Z }
  confidence: medium
body: |
  # Redis TTL Must Propagate to the SET Command

  ## Problem
  The session-store TTL test failed after the green gate.

  ## Trap
  Setting the TTL on the key separately rather than on SET ... EX silently loses the TTL on overwrite.

  ## Solution
  Pass the TTL on SET with EX; do not issue a separate EXPIRE.

  ## Prevention
  Assert the TTL is observable on the next get within the AC test; a separate EXPIRE path fails the test.

  ## Related Learnings
  (none yet)

  ## Source
  2026-07-10-001-review#F02 (redis TTL test blocked at Green gate)
source-candidate:
  title: "Redis TTL must be propagated to the SET command, not just the key"
  domain: data-storage
  source: { type: candidate, reference: "2026-07-10-001-review#F02" }
  summary: "TTL test failed because SET ... EX must carry the TTL."
  type: gotcha
inferred: true
```

## Notes

- Capture is the **allocating phase** for the `learn-id` umbrella (see [id-generation.md](../../id-generation.md)); Refine and Index inherit it unchanged.
- The `slug` is **proposed** here, not validated — Capture never silently collides; Refine's dedup check resolves any exact/analog match per [dedup-rules.md](../../dedup-rules.md).
- `inferred: true` (a short description or candidate sourced the draft) is the Capture Smart pause trigger; the user confirms the draft matches intent before Refine runs.
- The frontmatter's `source.reference` for a candidate points at the Work/Review report + finding id (`<review-id>#<finding-id>`) — the traceability link from the durable entry back to where it was first surfaced.
- Lineage fields are intentionally **absent** at capture — they are set only by Maintain (migration, base-wide merge) or Index (a Refine-time merge), per [entry-schema.md](../../entry-schema.md).