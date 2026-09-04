---
title: Plan Tier Selection
description: Reference for the Generate phase. Defines the Fast/Standard/Deep tier model, the selection algorithm that combines complexity, risk, and user preference, and the template sections each tier requires.
type: reference
version: 1.1
timestamp: "2026-08-07"
---

# Plan Tier Selection

This file documents the tier system used by the **Generate** phase (Phase 4) to right-size the final plan document. It defines three tiers, the selection algorithm, the template sections each tier requires, and how tier choice interacts with the interaction mode.

## When to Apply

Tier selection happens at the start of the Generate phase, after reading the Design Artifact (which carries the `complexity` field) and the Research Findings (which carry the `risk_level`). The chosen tier determines which sections of the [Final Plan template](templates/artifacts/final-plan.md) are rendered and how much structure the plan contains.

## The Three Tiers

| Tier         | Use When                                           | Length    | Sections Included                                                |
| ------------ | -------------------------------------------------- | --------- | ---------------------------------------------------------------- |
| **Fast**     | Trivial/low complexity, straightforward work       | 1–2 pages | Overview, High-Level Design, Units (single phase), Risks (brief) |
| **Standard** | Medium complexity, typical feature work            | 2–4 pages | All template sections, phased units, full risk table             |
| **Deep**     | High/very-high complexity, cross-system, high-risk | 4+ pages  | All template sections + alternatives + rollout ops + monitoring  |

## Selection Algorithm

```
function select_tier(complexity, risk_level, user_preference):
  # 1. Start from complexity-driven default
  if complexity in [TRIVIAL, LOW]:
    base_tier = Fast
  elif complexity == MEDIUM:
    base_tier = Standard
  else:  # HIGH or VERY_HIGH
    base_tier = Deep

  # 2. Upgrade tier if risk warrants it
  if risk_level == HIGH and base_tier == Fast:
    base_tier = Standard
  if risk_level == CRITICAL:
    base_tier = Deep

  # 3. Honor explicit user preference (never downgrade below risk floor)
  if user_preference == "fast" and risk_level not in [HIGH, CRITICAL]:
    return Fast
  if user_preference == "deep":
    return Deep
  if user_preference == "standard" and risk_level != CRITICAL:
    return Standard

  return base_tier
```

### Inputs

| Input             | Source                          | Values                                |
| ----------------- | ------------------------------- | ------------------------------------- |
| `complexity`      | Design Artifact                 | TRIVIAL, LOW, MEDIUM, HIGH, VERY_HIGH |
| `risk_level`      | Research Findings Artifact      | LOW, MEDIUM, HIGH, CRITICAL           |
| `user_preference` | User (asked in Generate Step 1) | `fast`, `standard`, `deep`, or `auto` |

### Risk Floor

The risk level sets a **minimum tier** that user preference cannot override:

| Risk Level | Minimum Tier |
| ---------- | ------------ |
| LOW        | Fast         |
| MEDIUM     | Fast         |
| HIGH       | Standard     |
| CRITICAL   | Deep         |

Rationale: High/critical risk mandates enough structure to capture alternatives, rollout, and rollback — even if the user wants a short plan.

## Tier Section Requirements

### Fast Tier

Required sections:

- Overview (1–2 sentences)
- High-Level Technical Design (one of: Mermaid, pseudo-code, or data-flow map)
- Implementation Units (single phase, 1–3 units)
- Risk Analysis & Mitigation (brief table, 1–2 rows)
- Related Learnings

Optional (skip if not applicable): Alternative Approaches, Operational Notes, Learning Gaps.

### Standard Tier

Required sections (all template sections):

- Overview
- High-Level Technical Design
- Implementation Units (phased, 2+ phases)
- Alternative Approaches Considered (at least 1)
- Risk Analysis & Mitigation (full table)
- Operational / Rollout Notes
- Related Learnings
- Learning Gaps

### Deep Tier

Required sections (all Standard sections, plus):

- Alternative Approaches Considered (at least 2, with side-by-side comparison)
- Risk Analysis & Mitigation (full table with impact ratings)
- Operational / Rollout Notes (must include: feature flags, monitoring, data migration, rollback plan, performance baseline)
- Explicit complexity and tier in frontmatter
- Cross-system integration map (data-flow or sequence diagram)

## Interaction Mode Behavior

| Mode      | Tier Selection Behavior                                                                             |
| --------- | --------------------------------------------------------------------------------------------------- |
| Detailed  | Ask the user to confirm the selected tier; offer to override                                        |
| Smart     | Auto-select; pause **only** if selected tier is Deep (or user preference conflicts with risk floor) |
| Autopilot | Auto-select with `user_preference = auto`; never pause                                              |

**Smart mode pause triggers:**

- Selected tier is Deep (signals complex work worth a review)
- User preference conflicts with risk floor (e.g., user wants Fast but risk is HIGH)
- Research phase reported CRITICAL risk (Security or Payments)

## Asking the User for Preference

In Detailed mode (or when Smart mode pauses), ask the user one question:

```
Based on the design complexity (HIGH) and risk level (HIGH), I recommend the Standard tier.
Which tier would you like for the plan?
  - Fast: Short plan, minimal structure (1-2 pages)
  - Standard: Full plan with phased units and risk table (2-4 pages) [Recommended]
  - Deep: Comprehensive plan with alternatives and rollout ops (4+ pages)
  - Auto: Let the algorithm decide (result: Standard)
```

Record the user's choice as the selected **`tier`** in the final plan frontmatter; preserve the algorithm's suggestion as **`tier_recommended`** so an override is auditable.

## Worked Examples

### Example 1: Low complexity, low risk

- `complexity = LOW`, `risk_level = LOW`, `user_preference = auto`
- Base tier: Fast. No risk upgrade. Auto preference → **Fast**.

### Example 2: Medium complexity, high risk, user wants fast

- `complexity = MEDIUM`, `risk_level = HIGH`, `user_preference = fast`
- Base tier: Standard. Risk upgrade: already Standard (HIGH floor). User wants Fast but HIGH risk floor is Standard → **Standard**.
- Smart mode would pause (preference conflicts with risk floor).

### Example 3: High complexity, critical risk (payments)

- `complexity = HIGH`, `risk_level = CRITICAL`, `user_preference = auto`
- Base tier: Deep. CRITICAL forces Deep. Auto preference → **Deep**.
- Smart mode pauses (Deep tier + CRITICAL risk).

## Error Handling

| Scenario                                | Recovery                                        |
| --------------------------------------- | ----------------------------------------------- |
| `complexity` field missing from Design  | Default to MEDIUM; log warning                  |
| `risk_level` missing from Research      | Default to MEDIUM; log warning                  |
| User provides invalid preference value  | Treat as `auto`; log warning                    |
| Selected tier conflicts with risk floor | Enforce risk floor; inform user of the override |

## Notes

- Tier choice is recorded in the final plan's frontmatter as `tier: fast | standard | deep`
- The tier also influences the Tasks phase: Fast tier often produces 1–3 tasks; Standard 4–8; Deep 8+
- If the user overrides the tier, preserve the algorithm's recommendation in a `tier_recommended` field for audit
- Tier selection is the primary "right-sizing" mechanism — Small tasks → short plans; complex work → more structure (per Plan Skill core principles)
