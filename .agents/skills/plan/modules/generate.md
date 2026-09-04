---
title: Generate
description: Render the final plan from the Design Artifact by selecting a tier, filling the plan template, and saving it to docs/plans/. Produces a Final Plan Artifact for the optional Tasks phase.
type: module
version: 1.1
timestamp: "2026-08-07"
---

# Phase 4 - Generate

**Purpose:** Fourth step in the planning workflow. Reads the Design Artifact, selects a plan tier (Fast/Standard/Deep) based on complexity and risk, renders the final plan from the [Final Plan template](../references/templates/artifacts/final-plan.md), and saves it to `docs/plans/`. Returns a [Final Plan Artifact](../references/templates/artifacts/final-plan.md) that the optional Tasks phase consumes.

## Workflow

This is the Phase 4 pipeline for the Plan Skill. It orchestrates the following steps:

### Step 0: Verification

Run the **[Step 0 verification](../references/error-handling.md)**. Required input: a valid **Design Artifact**. Specifically verify:

1. The Design Artifact exists and contains `design-id`, `scope-id`, `research-id`, `interactionMode`, `complexity`, `tier_recommended`, `Approach`, `High-Level Technical Design`, and `Implementation Units`.
2. The `complexity` field is one of: `TRIVIAL`, `LOW`, `MEDIUM`, `HIGH`, `VERY_HIGH`.
3. The `interactionMode` is present and valid (default to `smart` if missing; log warning).
4. Cross-phase consistency: the `scope-id` and `research-id` match the upstream artifacts.

### Step 1: Tier Selection

Select the plan tier based on complexity, risk, and user preference. For the full algorithm, risk floor rules, and tier section requirements, see **[plan-tier-selection.md](../references/plan-tier-selection.md)**.

1. **Read inputs:**
   - `complexity` from the Design Artifact
   - `risk_level` from the Research Findings (carried via the Design Artifact's complexity assessment)
   - `tier_recommended` from the Design Artifact (the algorithm's suggestion)

2. **Determine user preference:**
   - In **Detailed** mode: Ask the user which tier they want, presenting the recommendation. Options: `Fast`, `Standard`, `Deep`, `Auto`.
   - In **Smart** mode: Auto-select, unless a pause trigger fires (Deep tier, preference conflicts with risk floor, or CRITICAL risk). If paused, ask the user.
   - In **Autopilot** mode: Set `user_preference = auto`; never ask.

3. **Apply the selection algorithm** (see [plan-tier-selection.md](../references/plan-tier-selection.md)):
   - Start from the complexity-driven default tier.
   - Upgrade if risk warrants it (respect the risk floor).
   - Honor user preference unless it violates the risk floor.

4. **Record the selected tier** as `tier` and the algorithm's recommendation as `tier_recommended` (for audit when the user overrides).

### Step 2: Plan Rendering

Render the final plan from the [Final Plan template](../references/templates/artifacts/final-plan.md), including only the sections required by the selected tier.

1. **Assemble frontmatter:**

   ```yaml
   plan-id: YYYY-MM-DD-NNN
   type: plan
   title: "[Plan title]"
   status: complete
   tier: fast | standard | deep
   tier_recommended: fast | standard | deep
   complexity: TRIVIAL | LOW | MEDIUM | HIGH | VERY_HIGH
   risk: Low | Medium | High | Critical
   scope-id: YYYY-MM-DD-NNN-scope
   research-id: YYYY-MM-DD-NNN-research
   design-id: YYYY-MM-DD-NNN-design
   interactionMode: detailed | smart | autopilot
   created: YYYY-MM-DD
   updated: YYYY-MM-DD
   version: 1.0
   ```

2. **Render sections per tier** (see [plan-tier-selection.md](../references/plan-tier-selection.md) for the full section list):

   | Section                       | Fast | Standard | Deep |
   | ----------------------------- | :--: | :------: | :--: |
   | Overview                      |  ✅  |    ✅    |  ✅  |
   | High-Level Technical Design   |  ✅  |    ✅    |  ✅  |
   | Implementation Units (Phased) |  ✅  |    ✅    |  ✅  |
   | Alternative Approaches        |  ➖  |    ✅    |  ✅  |
   | Risk Analysis & Mitigation    |  ✅  |    ✅    |  ✅  |
   | Operational / Rollout Notes   |  ➖  |    ✅    |  ✅  |
   | Related Learnings             |  ✅  |    ✅    |  ✅  |
   | Learning Gaps                 |  ➖  |    ✅    |  ✅  |

   Legend: ✅ required, ➖ optional (skip if not applicable).

3. **Carry forward content from the Design Artifact:**
   - `Approach` → Overview
   - `High-Level Technical Design` → High-Level Technical Design
   - `Implementation Units` → Implementation Units (Phased)
   - `Alternative Approaches` → Alternative Approaches Considered
   - `Related Learnings` → Related Learnings
   - `Learning Gaps` → Learning Gaps

4. **Build the Risk Analysis table** from the Research Findings' high-risk detection and the Design's complexity:
   - Each risk row: `| [Specific risk] | High/Medium | [Concrete mitigation] |`
   - Fast tier: 1–2 rows (brief)
   - Standard tier: full table covering all detected high-risk areas
   - Deep tier: full table with impact ratings + rollback plan

5. **Build Operational / Rollout Notes** (Standard/Deep only) from the Design's rollout units:
   - Feature flags, monitoring, data migration, rollback plan, performance baseline
   - Skip the section entirely if not applicable (Fast tier, or no rollout units)

6. **Right-size:** Per Plan Skill core principles — small tasks → short plans; complex work → more structure. Do not pad a Fast plan with empty sections; do not omit required sections from a Deep plan.

### Step 3: Plan ID Generation

1. **Assign a `plan-id`** per [id-generation.md](../references/id-generation.md) (format `YYYY-MM-DD-NNN`). Reuse it if the user later picks **Edit & Retry**.
2. **Derive the plan filename** from the plan title (lowercase, hyphens, no stopwords): `docs/plans/YYYY-MM-DD-NNN-<kebab-case-name>.md`.

### Step 4: Present and Confirm

Apply the **[phase confirmation behavior](../references/interaction-mode-propagation.md)** for the current `interactionMode`, using these generate-specific **Smart pause triggers**:

- The selected tier is `Deep`, or
- The user's tier preference conflicts with the risk floor, or
- Research reported CRITICAL risk (Security or Payments).

- **Detailed:** present the assembled Final Plan (in memory) and ask one question with options *(1) Proceed to Tasks, (2) Edit & Retry, (3) Skip Tasks, (4) Abort*.
- **Smart:** pause only when a pause trigger above is true; otherwise auto-proceed.
- **Autopilot:** auto-proceed (no confirmation); the Tasks phase still always asks the user before writing files.

Map each answer to its action so save+index **never run before the decision**:

| Answer | Action |
| --- | --- |
| **Proceed to Tasks** | Run Step 5, then return with `continue-to-tasks: true`. |
| **Skip Tasks** | Run Step 5, then return with `continue-to-tasks: false`. |
| **Edit & Retry** | Loop back through Steps 1–3 reusing the `plan-id` (save+index have not run yet). |
| **Abort** | Stop; inform the Orchestrator; do not save. |

### Step 5: Assemble, Save, and Register

Run this step only after confirmation (or any auto-proceed path); never on **Abort** or a pending **Edit & Retry**.

1. **Assemble** the complete plan — frontmatter (Step 2.1) + rendered sections (Step 2.2–2.6) — with `plan-id` set to the assigned id.
2. **Save** (write or overwrite) the plan to `docs/plans/YYYY-MM-DD-NNN-<kebab-case-name>.md`.
3. **Register** in `docs/plans/index.md`. **Insert or replace** the row by `plan-id` (idempotent on Edit & Retry) — never blind-append. If the index does not exist, create it with a header row. Row format:

```markdown
| [YYYY-MM-DD-NNN](YYYY-MM-DD-NNN-<kebab-case-name>.md) | [Plan Title] | [tier] | [tier_recommended] | [complexity] | [risk] | ready |
```

### Step 6: Return to Orchestrator

Return the Final Plan Artifact to the Orchestrator — `path`, `plan-id`, `tier`, `tier_recommended`, `interactionMode`, and `continue-to-tasks` (`true` if the user chose Proceed to Tasks, `false` on Skip). The Orchestrator continues to Phase 5 (Tasks) when `continue-to-tasks: true`, or marks the plan complete otherwise.

## Output: Final Plan Artifact

- Verify that the Final Plan is complete and valid, containing all required frontmatter fields (`plan-id`, `type`, `title`, `status`, `tier`, `tier_recommended`, `complexity`, `risk`, `scope-id`, `research-id`, `design-id`, `interactionMode`, `created`, `updated`, `version`) and all tier-required sections.
- Verify that all file paths in the plan are repository-relative (never absolute) and wrapped in backtick code formatting.
- Verify that `## Related Learnings` is present and references `docs/learn/index.md` entries (or states "No relevant learnings found").
- Verify that `## Learning Gaps` is present (may be empty).
- Verify that the plan is saved to `docs/plans/YYYY-MM-DD-NNN-<kebab-case-name>.md` and registered in `docs/plans/index.md`.

> The Final Plan is the primary deliverable of the Plan Skill. Pass it to `tasks` (Phase 5, optional) for task slicing, or mark the plan as complete if the user declines tasks.
