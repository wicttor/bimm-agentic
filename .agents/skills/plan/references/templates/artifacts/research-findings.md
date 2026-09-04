---
title: Research Findings Artifact
description: Template for the Research Findings Artifact produced by the Research phase. Captures research findings, insights, and relevant information for downstream phases.
type: template
version: 1.1
timestamp: "2026-08-07"
---

# Output: Research Findings

After completing the workflow, produce a research findings block (in memory or as markdown):

```yaml
type: research
research-id: YYYY-MM-DD-NNN-research
scope-id: YYYY-MM-DD-NNN-scope        # Inherited from Scope phase; traceability link
status: complete
interactionMode: detailed | smart | autopilot
timestamp: ISO-8601 timestamp (e.g., 2026-07-04T14:30:00Z)

# Research Findings

## Patterns Found
- `path/to/pattern/file` — [pattern description]

## High-Risk Detection
- Detected areas: [list]
- Risk Level: CRITICAL | HIGH | MEDIUM | LOW
- External Research Recommended: YES | NO

## Tech Stack
- [Framework]: [version]
- [Language]: [version]
- [Database]: [version]
- [Key libraries]: [versions]

## External Research
- Needed: YES | NO
- Guidance: [librarian query or web search suggestion]
- Status: completed | skipped | declined

## Technical Constraints
- [Constraint 1]
- [Constraint 2]

## Findings Summary
[2-3 sentence overview of all findings]
```

This findings object is passed to `design` (Phase 3) for the design phase.
