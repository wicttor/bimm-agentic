---
title: User Input Artifact
description: Template for the User Input Artifact produced by the Orchestrator. Captures raw user input, task description, intended behavior, goals, constraints, and context for downstream phases.
type: template
version: 1.1
timestamp: "2026-08-07"
---

# User Input Artifact

The **User Input Artifact** is the entry point to the Plan workflow. It captures the raw input from the user before the Scope phase processes and structures it. The Orchestrator produces this artifact and passes it to Phase 1 (Scope) for validation and context enrichment.

## Schema

```yaml
type: user-input
timestamp: ISO-8601 timestamp (e.g., 2026-07-02T14:30:00Z)
source: user-prompt | saved-prompt | document | previous-plan | hybrid
status: provided | incomplete | invalid

# User Input

## Task Description
[1-3 sentence description of the task or project]

## Intended Behavior
[Description of the desired outcome or what should happen after completion]

## Goals & Objectives
- [Goal 1]
- [Goal 2]
- (Optional; may be empty if not provided)

## Constraints & Limitations
- [Constraint 1]
- [Constraint 2]
- (Optional; may be empty if not provided)

## Context Source
[Where the input came from: direct user question, saved prompt file, attached document, resume of previous plan, or combination]

## Additional Context
[Any other relevant information: related files, previous attempts, team notes, external references]
(Optional; may be empty)
```

## Validation Rules

- **Task Description:** Required. Must be non-empty and non-ambiguous.
- **Intended Behavior:** Required. Must describe an observable outcome.
- **Goals & Objectives:** Optional but recommended. If empty, Scope will ask clarifying questions.
- **Constraints & Limitations:** Optional. If empty, Scope assumes no explicit constraints.
- **Context Source:** Required. Must be one of: `user-prompt`, `saved-prompt`, `document`, `previous-plan`, or `hybrid`.
- **Additional Context:** Optional. May be empty or contain freeform notes.

## Example

```yaml
type: user-input
timestamp: 2026-07-02T10:15:00Z
source: user-prompt
status: provided

# User Input

## Task Description
Add real-time collaboration features to the editor. Multiple users should be able to edit the same document simultaneously and see changes update in real-time.

## Intended Behavior
When User A types in a document, User B sees the text appear within 200ms. Cursor positions and selections are also synchronized. Conflicts are resolved using operational transformation.

## Goals & Objectives
- Enable simultaneous multi-user editing
- Keep latency under 200ms
- Support up to 10 concurrent users per document
- Maintain backward compatibility with single-user editing

## Constraints & Limitations
- Must use WebSocket protocol (no long-polling)
- Backend infrastructure limited to 2 GB RAM per instance
- Cannot require changes to existing client API

## Context Source
user-prompt

## Additional Context
Related issue: https://github.com/org/repo/issues/42
Previous prototype: /docs/brainstorms/collab-v1.md
Team notes in Slack: channel #editor-features
```

## Usage in Workflow

1. **Orchestrator** generates this artifact from user input, saved prompt, or document
2. **Scope Phase (Step 0)** validates the artifact for completeness and format
3. **Scope Phase (Steps 1-5)** enriches the artifact with learnings, requirements, and existing plans
4. **Scoped Context Artifact** is the output that downstream phases consume

## Missing Input Recovery

If the User Input Artifact is incomplete or invalid at Step 0, the Scope phase uses this recovery workflow:

| Field                     | Validation                    | Recovery                                                     |
| ------------------------- | ----------------------------- | ------------------------------------------------------------ |
| Task Description          | Non-empty, < 500 chars        | Ask: "What problem are you trying to solve?"                 |
| Intended Behavior         | Non-empty, observable outcome | Ask: "What should happen after this is implemented?"         |
| Goals & Objectives        | Optional                      | Ask: "What specific outcomes define success?" (collect 1-3)  |
| Constraints & Limitations | Optional                      | Ask: "Are there any hard constraints?" (collect if provided) |
| Context Source            | Must be valid type            | Infer from input origin; ask if ambiguous                    |
| Additional Context        | Optional                      | Skip if empty                                                |

**Note:** If Task Description or Intended Behavior cannot be provided, abort planning and ask the user to return with more context.
