---
title: Design Artifact
description: Template for the Design Artifact produced by the Design phase. Captures the chosen approach, implementation units, complexity assessment, and alternatives considered for downstream generation.
type: template
version: 1.1
timestamp: "2026-08-07"
---

# Design Artifact

The product of the **Design** phase (Phase 3) is a structured design object that the **Generate** phase consumes to render the final plan. It captures the chosen approach, the implementation unit decomposition, the complexity assessment, and the alternatives considered (and why they were rejected).

When the **Design** phase completes, it produces a design block (as markdown) with this schema:

## Schema

```yaml
type: design
design-id: YYYY-MM-DD-NNN-design
scope-id: YYYY-MM-DD-NNN-scope        # Inherited from Scope phase; traceability link
research-id: YYYY-MM-DD-NNN-research  # Inherited from Research phase
status: complete
interactionMode: detailed | smart | autopilot
timestamp: ISO-8601 timestamp (e.g., 2026-07-04T14:30:00Z)
complexity: TRIVIAL | LOW | MEDIUM | HIGH | VERY_HIGH
tier_recommended: fast | standard | deep

# Design

## Approach
[1-3 sentence summary of the chosen approach and why it fits the scoped context and research findings]

## High-Level Technical Design
[ONE of: Mermaid diagram, pseudo-code sketch, or data-flow map — directional guidance, not implementation specification]

## Implementation Units (Phased)

### Phase 1: Foundation
- U1. **[Unit Name]**
  - Goal: [What this unit accomplishes]
  - Dependencies: None
  - Files:
    - Create: `path/to/file`
    - Test: `path/to/test`
  - Acceptance Criteria:
    - [Single, verifiable criterion — each criterion later becomes exactly one task and one test]
  - Test Scenarios:
    - [Scenario]: [Input -> Expected Outcome]

- U2. **[Unit Name]**
  - Goal: [What this unit accomplishes]
  - Dependencies: U1
  - Files:
    - Create: `path/to/file`
  - Acceptance Criteria:
    - [Single, verifiable criterion]
  - Test Scenarios:
    - [Scenario]: [Input -> Expected Outcome]

### Phase 2: Integration
- U3. **[Unit Name]**
  - Goal: [What this unit accomplishes]
  - Dependencies: U1, U2
  - Files:
    - Modify: `path/to/file`
  - Acceptance Criteria:
    - [Single, verifiable criterion]
  - Test Scenarios:
    - [Scenario]: [Input -> Expected Outcome]

### Phase 3: Rollout (if applicable)
- U4. **[Unit Name]**
  - Goal: [What this unit accomplishes]
  - Dependencies: U3
  - Files:
    - Modify: `path/to/file`
  - Acceptance Criteria:
    - [Single, verifiable criterion]

## Complexity Assessment
- scope_breadth: 0-3
- integration_surface: 0-3
- risk_level: LOW | MEDIUM | HIGH | CRITICAL   # Inherited from Research phase
- novelty: 0-3
- data_migration: 0-3
- total: [sum]
- complexity: TRIVIAL | LOW | MEDIUM | HIGH | VERY_HIGH

## Alternative Approaches Considered
- **[Approach Name]**: [Description] → **Rejected because:** [Rationale]
- **[Approach Name]**: [Description] → **Rejected because:** [Rationale]

## Related Learnings
- docs/learn/XXX.md — [1-line applicability note]
- (List from docs/learn/index.md; empty list if none)

## Learning Gaps
- [Gap name] — [Follow-up action via /learn]
```

Also save the design artifact to `docs/plans/.design/<design-id>.md` for future reference or reuse. The `interactionMode` and `complexity` values flow into the Generate artifact for tier selection.

## Validation Rules

- **Approach:** Required. Must reference the scoped context and research findings (not invented in isolation).
- **High-Level Technical Design:** Required. Must be ONE of: Mermaid diagram, pseudo-code sketch, or data-flow map. Directional only — not an implementation specification.
- **Implementation Units:** Required. At least one unit (U1). Each unit must have a Goal, Dependencies, Files, and **Acceptance Criteria** (at least one; each criterion becomes exactly one task and one test in the Tasks phase). Test Scenarios required for units in phases 1–2; optional for rollout-only units.
- **Complexity Assessment:** Required. All five dimensions scored 0–3; `total` must equal the sum; `complexity` must match the threshold mapping.
- **Alternative Approaches:** Required for MEDIUM+ complexity; at least 1 alternative. For HIGH/VERY_HIGH, at least 2 alternatives. For TRIVIAL/LOW, may be empty.
- **Related Learnings:** Required (may be empty list). Must reference `docs/learn/index.md`.
- **Learning Gaps:** Required (may be empty list). Inherited from Scope phase; updated if design reveals new gaps.
- **scope-id / research-id:** Required. Must match the upstream artifacts for cross-phase consistency (see [error-handling.md](../../error-handling.md)).

## Usage in Workflow

1. **Design Phase** produces this artifact from the Scoped Context and Research Findings
2. **Design Phase Step 0** validates the incoming Scoped Context and Research Findings (see [error-handling.md](../../error-handling.md))
3. **Generate Phase** reads the `complexity` and `tier_recommended` fields to select the plan tier (see [plan-tier-selection.md](../../plan-tier-selection.md))
4. **Generate Phase** renders the final plan from the units and alternatives captured here

## Missing Field Recovery

If the Design Artifact is incomplete at validation, use this recovery workflow:

| Field                       | Validation                       | Recovery                                                                                           |
| --------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------- |
| Approach                    | Non-empty, references context    | Re-run Design phase; ask user to clarify approach                                                  |
| High-Level Technical Design | One of three formats present     | Ask user to choose diagram, pseudo-code, or data-flow map                                          |
| Implementation Units        | At least U1 with Goal/Files      | Re-run Design decomposition step                                                                   |
| Complexity Assessment       | All 5 dimensions + total + level | Recompute from units; see [design-complexity-assessment.md](../../design-complexity-assessment.md) |
| Alternative Approaches      | Count matches complexity tier    | Ask user for additional alternatives if below threshold                                            |
| scope-id / research-id      | Matches upstream artifacts       | Reject; ask Orchestrator to re-run from the mismatched phase                                       |

**Note:** If the Approach or Implementation Units cannot be produced, abort planning and ask the user to revisit the research phase — the scoped context may be insufficient for design.
