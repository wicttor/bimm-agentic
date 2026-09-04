---
title: Design
description: Design the solution based on the scoped context and research findings. Decomposes the approach into phased implementation units, assesses complexity, and produces a Design Artifact for the Generate phase.
type: module
version: 1.1
timestamp: "2026-08-07"
---

# Phase 3 - Design

**Purpose:** Third step in the planning workflow. Reads the Scoped Context and Research Findings, selects an approach, decomposes it into phased implementation units, assesses complexity, and returns a [Design Artifact](../references/templates/artifacts/design.md) that the Generate phase renders into a final plan.

## Workflow

This is the Phase 3 pipeline for the Plan Skill. It orchestrates the following steps:

### Step 0: Verification

Run the **[Step 0 verification](../references/error-handling.md)**. Required inputs:

1. **Scoped Context Artifact** with `scope-id`, `domain`, `Problem`, `Intended Behavior`, `Success Criteria`.
2. **Research Findings Artifact** with `research-id`, `Patterns Found`, `High-Risk Detection` (with `risk_level`), `Tech Stack`.
3. `interactionMode` present (default to `smart` if missing; log warning).
4. Cross-phase consistency: the research artifact's `scope-id` matches the scope output.

### Step 1: Approach Selection

1. **Read the Scoped Context** to understand the problem, intended behavior, and success criteria.
2. **Read the Research Findings** to identify available patterns, confidence levels, high-risk areas, and technical constraints.
3. **Draft 2–3 candidate approaches** that satisfy the success criteria. Base each on:
   - Patterns found in the codebase (prefer HIGH-confidence patterns when available)
   - Tech stack constraints from research
   - Risk level and whether external research was conducted
4. **Evaluate each approach** against:
   - Fit with success criteria
   - Pattern reuse (higher confidence = lower risk)
   - Complexity (fewer integration points = simpler)
   - Reversibility (can it be rolled back?)
5. **Select the recommended approach.** If no clear winner emerges, present the top 2 to the user in one question and let them choose.
6. **Record the selected approach** as a 1–3 sentence summary in the Design Artifact's `Approach` field, including why it fits the context and research.

### Step 2: High-Level Technical Design

Produce a **directional** design representation (NOT an implementation specification). Choose ONE of:

- **Mermaid diagram** — Use `sequenceDiagram`, `flowchart`, or `graph` to show component interaction. Best for multi-actor flows.
- **Pseudo-code sketch** — High-level steps in plain language. Best for algorithmic/logic-heavy work.
- **Data-flow map** — ASCII arrows showing how data moves through the system. Best for pipeline/ETL work.

The design must:

- Reference real components, files, or services from the research findings (be concrete)
- Show the "happy path" only; edge cases go in the Implementation Units
- Avoid implementation details (naming, abstractions, code structure) — those are decided during execution

> **Note:** This is directional guidance for review, not an implementation specification to copy. The implementation phase will determine specific naming, abstractions, and code structure.

### Step 3: Implementation Unit Decomposition

Break the approach into **phased implementation units**. Each unit is a coherent, testable chunk of work.

1. **Define phases** based on dependency layers:
   - **Phase 1: Foundation** — Units with no dependencies (infra, interfaces, schema)
   - **Phase 2: Integration** — Units depending on Phase 1 (wiring, middleware, adapters)
   - **Phase 3: Rollout** (if applicable) — Units for migration, feature flags, cutover

2. **For each unit, record:**
   - **Unit ID:** `U1`, `U2`, ... (never renumber; preserve across iterations)
   - **Name:** Short, descriptive
   - **Goal:** What this unit accomplishes (1 sentence)
   - **Dependencies:** Which unit IDs must complete first (or "None")
   - **Files:** `Create`, `Modify`, and `Test` paths — repository-relative, in backtick code formatting
   - **Acceptance Criteria:** A list of one or more checkable criteria. **Each criterion later becomes exactly one task and one test** (see Tasks phase). Phrase each as a single, verifiable outcome — not a bundle.
   - **Test Scenarios:** `[Scenario]: [Input -> Expected Outcome]` (required for Phase 1–2 units; optional for rollout-only)

3. **Decomposition check:** Units are sized so the Tasks phase can honor **one Acceptance Criterion per task**. If a unit's criteria would need > 5 files or > 1 day, split that unit (or its criteria) finer; never let a single criterion exceed one task (see [task-slicing-rules.md](../references/task-slicing-rules.md)).

4. **Dependency check:** Verify no cycles exist. A unit may only depend on units in earlier phases. If a cycle is detected, restructure the units.

### Step 4: Complexity Assessment

Score the design across five dimensions (0–3 each) and compute the complexity level. For the scoring table, dimension definitions, and threshold mapping, see **[design-complexity-assessment.md](../references/design-complexity-assessment.md)**.

1. Score each dimension:
   - `scope_breadth` — from the Implementation Units' file lists
   - `integration_surface` — from Research Findings' patterns and tech stack
   - `risk_level` — **inherited** from Research Findings (do not re-score)
   - `novelty` — compare chosen approach against `Patterns Found` confidence
   - `data_migration` — from the design's operational/rollout notes draft
2. Sum the scores (0–15).
3. Map to complexity level: `TRIVIAL | LOW | MEDIUM | HIGH | VERY_HIGH`.
4. Record all five scores, the total, and the complexity level in the Design Artifact.

### Step 5: Alternative Approaches

Document the approaches considered but not selected, with rejection rationale.

- **TRIVIAL / LOW complexity:** At least 1 alternative (may be brief).
- **MEDIUM complexity:** At least 1 alternative with rationale.
- **HIGH / VERY_HIGH complexity:** At least 2 alternatives with side-by-side rationale.

Format: `**[Approach Name]**: [Description] → **Rejected because:** [Rationale]`

### Step 6: Learnings and Gaps Update

1. **Carry forward** the `Related Learnings` and `Learning Gaps` from the Scoped Context.
2. **Add new learnings** discovered during design (e.g., a pattern confirmed or refuted).
3. **Add new gaps** the design revealed (e.g., "No learning on Redis failover in production").
4. Update both lists in the Design Artifact.

### Generate the Design Artifact

1. **Assign a `design-id`** per [id-generation.md](../references/id-generation.md) (format `YYYY-MM-DD-NNN-design`, saved to `docs/plans/.design/`). Reuse it if the user later picks **Edit & Retry**.

2. Produce a **Design Artifact** block (as markdown) following the schema in [design.md](../references/templates/artifacts/design.md).
   - Include the generated `design-id`, inherited `scope-id` and `research-id`, `interactionMode`, `complexity`, and `tier_recommended` (derived from complexity per [plan-tier-selection.md](../references/plan-tier-selection.md)).

### Step 7: Present, Confirm, and Save

Apply the **[phase confirmation behavior](../references/interaction-mode-propagation.md)** for the current `interactionMode`, using these design-specific **Smart pause triggers**:

- `complexity = VERY_HIGH`, or
- Research reported HIGH risk with `patterns_found_count < 3`, or
- 3+ learning gaps carried from Scope, or
- The selected approach has no local pattern precedent (Novelty = 3).

- **Detailed:** present the Design Artifact and ask one question with options *(1) Proceed to Generate, (2) Edit & Retry, (3) Abort*. On **Edit & Retry**, loop back through Steps 1–6 reusing the `design-id`. On **Abort**, stop and inform the Orchestrator.
- **Smart:** pause only when a pause trigger above is true; otherwise auto-proceed.
- **Autopilot:** auto-proceed (no confirmation).

Then save the artifact to `docs/plans/.design/<design-id>.md` (ensure `interactionMode`, `complexity`, and `tier_recommended` are included) and return it, with the `interactionMode` value, to the Orchestrator for the transition to Phase 4 (Generate).

## Output: Design Artifact

- Verify that the Design Artifact is complete and valid, containing all required fields: `design-id`, `scope-id`, `research-id`, `interactionMode`, `complexity`, `tier_recommended`, Approach, High-Level Technical Design, Implementation Units (each with Acceptance Criteria), Complexity Assessment, Alternative Approaches, Related Learnings, and Learning Gaps.
- Verify that the `complexity` value matches the threshold mapping from the five dimension scores.
- Verify that `tier_recommended` is consistent with the complexity and risk level per [plan-tier-selection.md](../references/plan-tier-selection.md).
- Verify that the artifact is saved to `docs/plans/.design/<design-id>.md` for future reference or reuse.

> Pass the design artifact to `generate` (Phase 4) for final plan generation.
