---
title: Scoped Context Artifact
description: Template for the Scoped Context Artifact produced by the Scope phase. Captures problem frame, intended behavior, success criteria, and relevant learnings or requirements.
type: template
version: 1.1
timestamp: "2026-08-07"
---

# Scoped Context Artifact

The product of the **Scope** phase is a structured context object that downstream modules (research, design, generate) consume. It captures the problem frame, intended behavior, success criteria, and any relevant learnings or requirements.

When the **Scope** phase completes, the orchestrator produces a scoped context block (as markdown) with this schema:

```yaml
title: [plan title]
type: scope
scope-id: YYYY-MM-DD-NNN-scope
domain: software | non-software
status: complete
interactionMode: detailed | smart | autopilot
timestamp: ISO-8601 timestamp (e.g., 2026-07-04T14:30:00Z)

# Scoped Context

## Problem
[Clear statement of the problem frame]

## Intended Behavior
[Description of desired outcome]

## Success Criteria
- [Criterion 1]
- [Criterion 2]

## Existing Plan
path: docs/plans/...md | null
action: resume | review | archive | delete | create-new | none

## Related Learnings
- docs/learn/XXX.md — [1-line applicability note]
- (List from docs/learn/index.md; empty list if none)

## Learning Gaps
- [Gap name] — [Follow-up action via /learnings]

## Requirements Found
- docs/brainstorms/XXX.md — [relevant excerpt]
- docs/requirements/XXX.md — [relevant excerpt]
- (Empty list if none found)
```

Also save the scoped context to `docs/plans/.scope/<scope-id>.md` for future reference or reuse. The `interactionMode` value flows into `research`, `design`, and `generate` artifacts.
