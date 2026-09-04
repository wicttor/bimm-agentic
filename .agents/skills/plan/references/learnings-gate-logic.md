---
title: Learnings Gate Logic
description: Reference for Scope Phase Step 4. Defines keyword matching, relevance scoring, gap identification, and inclusion criteria.
type: reference
version: 1.1
timestamp: "2026-08-07"
---

# Learnings Gate Logic

Reference for **Scope Phase Step 4**. Defines keyword matching, relevance scoring, gap identification, and inclusion criteria.

## Algorithm

1. **Extract keywords** — Tokenize task description/intended behavior (remove stop words, normalize to lowercase, keep domain terms)
2. **Match learnings** — Exact match: keyword in learning title/summary; Fuzzy match: Levenshtein ≤2 for variants (e.g., "auth" vs "authentication")
3. **Score relevance** — HIGH/MEDIUM/LOW based on domain match and applicability
4. **Filter** — Include only HIGH/MEDIUM in Scoped Context
5. **Identify gaps** — For each task domain not covered by HIGH/MEDIUM learnings, document gap

**Example:** Task "Add WebSocket collaboration"

- Extract: `websocket`, `collaboration`, `synchronization`
- Match: `websocket-best-practices.md` (exact), `concurrent-edits.md` (fuzzy)
- Skip: `ci-cd-pipelines.md` (no match)

## Relevance Scoring

| Level      | Criteria                                                                                                | Example                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **HIGH**   | Exact domain match + DIRECT/CRITICAL applicability. Learning directly applies to explicit task goal.    | Task: "Migrate REST→gRPC" + Learning: `grpc-performance-tuning.md` (DIRECT) → HIGH     |
| **MEDIUM** | Related domain + RECOMMENDED/CONTEXTUAL applicability. Learning provides context or potential solution. | Task: "Reduce API latency" + Learning: `caching-strategies.md` (RECOMMENDED) → MEDIUM  |
| **LOW**    | Distant domain or HISTORICAL/INFORMATIONAL. Exclude from scope.                                         | Task: "Add dark mode UI" + Learning: `backend-load-balancing.md` (unrelated) → EXCLUDE |

**Inclusion:** Add HIGH/MEDIUM learnings to `Related Learnings` in Scoped Context. Exclude LOW.

## Gap Identification

A **learning gap** is a task domain with no HIGH/MEDIUM relevance learning.

**Algorithm:**

1. Extract task domains (from description, goals, constraints)
2. For each domain: check if HIGH/MEDIUM learning exists
3. If not, document gap with: name, domain, relevance to task, suggested action

**Format:**

```yaml
- gap_name: "[Domain] — [what's missing]"
  domain: [primary domain]
  relevance: why this matters for the task
  suggested_action: "Research external resource" or "Document post-implementation"
```

**Example:** Task "Implement multi-user undo/redo"

- Domains: `undo-redo`, `collaboration`, `conflict-resolution`
- Learning found: `ot-basics.md` (covers conflicts)
- Gap: "Undo/Redo Coordination — No learning on undo behavior in collaborative environments"
  → Suggested action: "Research Google Docs model; document post-implementation"

## Learning Entry Format (index.md)

Learnings must include:

```yaml
filename: docs/learn/xxx.md
domain: [primary domain]
tags: [related_domain_1, related_domain_2]
applicability: DIRECT | RECOMMENDED | CONTEXTUAL | HISTORICAL | INFORMATIONAL
summary: [1-2 sentence summary]
```

## Scope Phase Integration

**Scope Step 4** executes:

1. Extract keywords from task + intended behavior
2. Keyword match against `docs/learn/index.md` (exact + fuzzy)
3. Score matches: HIGH/MEDIUM/LOW per table above
4. Filter: keep HIGH/MEDIUM only
5. Identify gaps: domains not covered
6. Output: `Related Learnings` + `Learning Gaps` in Scoped Context

## Error Handling

| Error            | Recovery                             |
| ---------------- | ------------------------------------ |
| index.md missing | Skip; set empty learnings & gaps     |
| Malformed entry  | Log warning; skip entry; continue    |
| No matches       | Set `Related Learnings: []`; proceed |
| >10 matches      | Trim to top 5-7 by relevance score   |
