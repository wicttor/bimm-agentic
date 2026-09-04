---
title: Interaction Mode Propagation
description: Reference for how `interactionMode` propagates through the Work pipeline (Triage -> Prepare -> Execute -> Review). Set at the Orchestrator; each phase reads and applies mode-specific behavior.
type: reference
version: 1.0
timestamp: "2026-08-07"
---

# Interaction Mode Propagation

Reference for how `interactionMode` propagates through the Work pipeline (`Triage → Prepare → Execute → Review`). Set at the Orchestrator; each phase reads and applies mode-specific behavior.

> `interactionMode` governs **when to pause for the user**. It is distinct from **execution mode** (`inline` / `serial` / `parallel`), which governs **how multiple tasks are run** and is selected in Prepare (see [execution-mode-selection.md](execution-mode-selection.md)). Both are carried independently through every artifact.

## Modes

| Mode          | Behavior                                              | Use Case                             |
| ------------- | ----------------------------------------------------- | ------------------------------------ |
| **Detailed**  | Pause at each phase; present artifacts; require approval | Complex/high-risk work, unfamiliar codebases |
| **Smart**     | Auto-proceed; pause only on HIGH-risk flags           | Familiar codebases with guardrails   |
| **Autopilot** | Run all phases auto (Review still reports)             | Straightforward, well-planned task lists |

## Phase Behavior by Mode

| Phase        | Detailed                                         | Smart                                                                                                       | Autopilot                         |
| ------------ | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | --------------------------------- |
| **Triage**   | Present manifest; ask Proceed/Edit/Abort          | Auto-proceed; pause if ad-hoc inferred list, unmet upstream dep (task-file), or task-artifact validation recovery | Auto-proceed                      |
| **Prepare**   | Present execution plan; ask Proceed/Edit/Abort   | Auto-proceed; pause if red-baseline open, parallel > 5 tasks, or HIGH-risk risk-floor conflict             | Auto-proceed                      |
| **Execute**  | Per-task pause (inline) + ask Proceed/Edit/Abort  | Auto-proceed; pause if blocked-at-retry-limit, new regression on Refactor, or parallel dependent-blocked   | Auto-proceed (inline mode still pauses for HIGH-risk tasks) |
| **Review**   | Present work report; ask Finalize/Edit/Abort     | Auto-proceed; pause if regressions-found, scope-creep, or learnings-to-capture non-empty                    | Auto-proceed (strips to Smart triggers) |

**Smart mode pauses only on each phase's documented triggers above** (the canonical list lives in each module's confirmation step; this table is a summary).

## Artifact Schema

All phase artifacts include `interactionMode`:

```yaml
interactionMode: detailed | smart | autopilot # Passed from previous phase
status: pending | complete | failed
```

## Implementation

**Each phase must:**

1. Read `interactionMode` from the incoming artifact (or context, for Triage).
2. Apply mode-specific behavior per the table above.
3. Include `interactionMode` in the output artifact.

## Example

**SMART mode on a plan-based run:**

- Triage reads a plan-based index (no inferred list) → auto-proceeds
- Prepare detects a GREEN baseline, serial mode → auto-proceeds
- Execute runs serially; one task hits the retry-limit → pauses (blocked-at-retry-limit)
- User reviews the block reason and chooses to continue with remaining independent tasks → execute resumes
- Review finds no regressions, no scope-creep, empty learnings → auto-proceeds

**Result:** Paused only for the genuine blocker; faster than Detailed with safety guardrails.

## Execution Mode Independence

`executionMode` is chosen in Prepare and propagated alongside `interactionMode`:

- A **Detailed** run may still use **parallel** execution (every independent task runs concurrently, but Review still confirms).
- An **Autopilot** run still gives HIGH-risk tasks **inline** treatment (per the execution-mode-selection risk floor), even though no confirmation prompt is shown.

The two never override one another; the orchestrator's quality gate #2 cross-checks both are identical across artifacts.

## Error Handling

| Scenario                    | Recovery                              |
| --------------------------- | ------------------------------------- |
| Mode missing                | Default to "smart"; log warning       |
| Invalid mode value          | Reject; re-prompt Orchestrator        |
| Artifact missing mode field | Assume "smart"; log warning; continue |
| User selects "Abort"        | Stop immediately; inform Orchestrator |
| Timeout/connection lost     | Pause; ask user to retry or abort     |