---
title: Execution Mode Selection
description: Authoritative reference for the Prepare phase. Defines the three execution modes (inline/serial/parallel), their selection defaults, the risk floor (HIGH-risk forces inline, non-downgradable), and the per-mode flows Execute follows.
type: reference
version: 1.0
timestamp: "2026-08-07"
---

# Execution Mode Selection

Authoritative reference for the **Prepare** phase (Step 3). Defines the three execution modes, their selection defaults, the **risk floor**, and the per-mode flows the Execute phase follows. Prepare looks these up; Execute follows them; neither re-derives them.

> `executionMode` governs **how multiple tasks are run**. It is distinct from `interactionMode` (when to pause), which is set at the Orchestrator (see [interaction-mode-propagation.md](interaction-mode-propagation.md)). Both are carried independently through every artifact.

## Modes

| Mode       | Behavior                                                                    | Select when (default)                                            |
| ---------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `inline`   | One task at a time; pause between tasks; re-confirm the user before each destructive (Red) step. | `interactionMode: detailed`, **or** any task in the list is HIGH-risk or `P0` |
| `serial`   | Run the ordered list sequentially; no per-task pause; stop only on a `blocked` task. | Default fallback — most task lists                              |
| `parallel` | Run each wave's independent tasks concurrently; waves run in order (Wave N starts after Wave N-1 settles). | `execution-list` has 2+ independent waves **and** no task is HIGH-risk |

## Selection Algorithm (authoritative)

```
1. Read from the Work Manifest each task's priority (P0/P1/P2) and any HIGH-risk flag.
2. default_mode =
     inline    if interactionMode == detailed OR any task is HIGH-risk OR any P0 task present
     parallel  if execution-list has >= 2 independent waves AND no task is HIGH-risk
     serial    otherwise (fallback)
3. Apply the risk floor (below): any HIGH-risk task is forced to inline
   treatment — record per-task inline-override for that task.
4. In Detailed mode: ask the user, presenting the recommendation.
   In Smart mode: auto-select unless a Smart pause trigger fires.
   In Autopilot mode: auto-select; never ask.
5. Honor user preference unless it violates the risk floor; on violation, ask the
   user to accept inline instead.
6. Record executionMode + per-mode flow:
     inline    -> single-task-pause: true
     serial    -> stop-on-blocked: true
     parallel  -> waves: [Wave0, Wave1, ...]
```

## Risk Floor (authoritative, non-downgradable)

- **Any HIGH-risk task forces `inline` treatment for that task**, regardless of the selected `executionMode`.
  - If the list-level `executionMode` is `serial`/`parallel` but an individual task is HIGH-risk, that task runs inline (pause + re-confirm before its Red step) while independent non-HIGH-risk tasks may keep the list mode elsewhere.
  - The user may not downgrade a HIGH-risk task below `inline`. A preference that violates this is rejected; the user is asked to accept `inline`.
- HIGH-risk is carried from the Work Manifest (Triage preserved the per-task risk flag from the `/plan` design/research artifacts or inferred it for ad-hoc tasks).

## Per-Mode Flow (authoritative; Execute follows these)

### inline
- Run one task at a time.
- After each task completes or blocks, pause for the user (the `single-task-pause: true` flag) and re-confirm before the next task's Red (destructive) step.
- Best when `interactionMode: detailed` or any task is HIGH-risk; it is the only mode allowed for a HIGH-risk task.

### serial
- Run the flat ordered list sequentially.
- Do **not** pause between tasks.
- Stop only when a task becomes `blocked` (`stop-on-blocked: true`).
- On a block: surface the reason and ask the user whether to (a) continue with remaining independent tasks, (b) retry, or (c) abort.

### parallel
- Group `execution-list` into waves:
  - **Wave 0** — tasks with all dependencies already `completed`.
  - **Wave N** — tasks all of whose dependencies are in Waves `< N`; each wave is independent internally and runs concurrently.
  - Within a wave, stable order by original unit number.
- Waves run in order: Wave N starts only after Wave N-1 fully settles (all its tasks completed/blocked/skipped).
- A `blocked` task in an earlier wave blocks only its dependents in later waves, not the whole current wave.
- A HIGH-risk task in any wave is, per the risk floor, pulled to inline treatment (pause + re-confirm) even though surrounding tasks run concurrently.

## Resume Behavior

On re-entry (re-running Work), Prepare recomputes `executionMode` the same way, but Execute skips any task already `completed` (per the resume policy in [task-execution-rules.md](task-execution-rules.md)) and runs from the first non-completed task. The execution mode does not change on resume.

## Smart Pause Triggers (Prepare)

Prepare pauses in Smart mode when:
- `baseline: red` and the user has not yet chosen a baseline policy, or
- `executionMode: parallel` on an execution list of > 5 tasks (concurrency risk), or
- A HIGH-risk task is present but the selected `executionMode` would not give it `inline` treatment (risk-floor conflict pre-override).

## Failure Conditions

| Trigger                                                  | Recovery                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| `executionMode` missing from the Execution Plan         | Category 2 default per error-handling.md; re-run Prepare           |
| A cycle in wave grouping (no wave can start)             | Surface to the user; ask to break (remove a dependency) or abort    |
| User preference violates the risk floor                 | Ask the user to accept `inline` instead; do not silently downgrade  |

## Notes

- This reference is the single source of truth for mode definitions, defaults, the risk floor, and per-mode flows. Prepare records the selection; Execute follows the flow; Review verifies they match (orchestrator quality gate #2).
- The mode is independent from `interactionMode`: a Detailed run may use parallel execution, and an Autopilot run still gives HIGH-risk tasks inline treatment.