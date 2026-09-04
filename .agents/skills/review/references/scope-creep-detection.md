---
title: Scope-Creep Detection
description: Authoritative reference for the Scope phase (Step 4 pre-check) and the Analyze phase (final scope-creep category). Defines how changed files/behaviors are compared against resolved requirements to detect changes beyond the intended scope, the requirement-trace logic, and the rule that scope-creep can only run when a requirements source is present.
type: reference
version: 1.0
timestamp: "2026-08-08"
---

# Scope-Creep Detection

Authoritative reference for the **Scope** phase (Step 4 preliminary check) and the **Analyze** phase (Step 1, scope-creep category). Defines how the `required` file list and changed behaviors are compared against resolved requirements to detect changes **beyond the intended scope**, the **requirement-trace** logic attached to every finding, and the hard rule that the scope-creep category can only run when a requirements source is present. Scope and Analyze apply this reference; they do not re-encode it.

## Core Rule

> **Scope-creep detection requires requirements.** The category runs **only** when `requirements-source` is not `none`. When `requirements-source: none`, the category is **skipped** with the recorded note `skipped (no requirements)` and emits **no** scope-creep findings. Review never invents requirements to test against — without a spec, scope-creep is unmeasurable, and that is recorded explicitly, not silently.

This single rule prevents the most common mis-escalation (flagging "creep" against an imagined contract). A missing spec is a legitimate review configuration, not an error (see [error-handling.md](error-handling.md)).

## Resolved Requirements Shape

When `requirements-source` is present, Scope (Step 3) resolves it into a structured list:

```yaml
spec-content:
  - criterion: "C1: Redis client connects with retry"
    expected-behavior:
      - "connect() reads REDIS_URL"
      - "connect() retries up to 3 times on connection failure"
  - criterion: "C2: SessionStore exports get/save/delete"
    expected-behavior:
      - "get(key) returns the stored value or null"
```

Each requirement has a short `criterion` id (e.g. `C1`, `C2`) and a list of `expected-behavior` bullets. The requirement ids become the `trace` values Analyze attaches to in-scope findings.

## Requirement Trace vs Scope-Creep Flag

Every finding produced by Analyze carries **either** a `trace` **or** a `scope-creep: true` flag (orchestrator quality gate #5):

| Field                | When                                                                 | Example                                |
| -------------------- | ------------------------------------------------------------------- | -------------------------------------- |
| `trace: <criterion>` | The finding is **inside** the intended scope, relating to a requirement | `trace: C1` (a quality issue in the redis connect code) |
| `trace: general-quality` | The finding is within the change's intent but not tied to one criterion (acceptable trace) | a naming issue in a touched helper |
| `trace: no-requirements` | The finding is a quality/security/test/doc/integration issue but `spec-content: none` (scope-creep cannot be assessed) | any finding when there is no spec |
| `scope-creep: true`  | The finding describes a change **beyond** the requirements (the creep itself, not a defect) | a file/behavior with no requirement it serves |

> `scope-creep: true` is **never** set when `spec-content: none` — without requirements, "beyond scope" is undefined. Such findings carry `trace: no-requirements` instead.

## Detection Algorithm (Scope Step 4 — preliminary)

Run only when `requirements-source` is not `none`. This is a **preliminary** file-level check; Analyze confirms with severity.

```
1. For each file in change-boundary.required:
   - find the requirement(s) it serves (by path/convention match against spec-content)
   - if a required file or a changed behavior maps to NO requirement:
     -> add a preliminary scope-creep candidate: { file, candidate-reason }
2. For each requirement in spec-content:
   - if NO required file maps to it (expected change is absent):
     -> add a preliminary gap candidate: { criterion, expected-but-absent }
     (this is reported for context, NOT as creep — it's an omission, not creep)
3. Record preliminary-scope-creep: [...] (or "none")
4. If requirements-source: none -> record preliminary-scope-creep: "skipped (no requirements)"
```

The preliminary check is deliberately **coarse** (file-level); Analyze's final category check operates at the file-and-behavior level and assigns severity. The gap candidates (expected-but-absent) are surfaced for Analyze's tests/integration categories (coverage gaps), **not** mislabeled as creep.

## Detection Algorithm (Analyze Step 1, scope-creep category — final)

Run only when `spec-content` is not `none`. Confirms Scope's preliminary candidates and detects behavior-level creep.

```
1. Carry Scope's preliminary-scope-creep candidates as the starting set
2. For each candidate, inspect the hunks (from the Review Kit's diffs):
   - confirm the changed behaviors are not traceable to any requirement
   - if genuinely beyond scope -> emit a finding:
       { severity (per severity-rubric), category: scope-creep,
         location: file:hunk, message: "change beyond <criterion-set>",
         scope-creep: true }
3. Detect behavior-level creep not caught by the file-level pre-check:
   - a changed file that DOES map to a requirement, but a specific hunk/
     added behavior within it serves no requirement
   - emit a finding with scope-creep: true and a precise file:hunk location
4. Reconcile with Scope's preliminary count:
   - if the confirmed creep count differs from the preliminary count,
     that is an Analyze Smart pause trigger (the user confirms the delta)
5. If spec-content: none -> record the scope-creep category as
   "skipped (no requirements)" and emit no scope-creep findings
```

## Severity of Scope-Creep Findings

Scope-creep findings carry a severity per [severity-rubric.md](severity-rubric.md):

- A creep that introduces a **new public API / behavior / dependency** outside the requirements → typically **major** (it expands the merge's surface area).
- A creep that is a small, incidental edit (e.g. a stray comment region, an unrelated formatting change in a touched file) → **minor** or **nit**.
- A creep that introduces a security hole or breaks a core flow → escalate via the rubric to **blocker** (rare; the issue is the security break, traced as scope-creep).

Report's approval derivation treats **any** `scope-creep: true` finding as forcing `changes-requested` (see [approval-criteria.md](approval-criteria.md)) — creep always asks for a decision before merge.

## Work-linked Edge Cases

For `input-shape: work-linked`:

- The Work Manifest's resolved task list and each task's single Acceptance Criterion **are** the de facto requirements when Scope maps `requirements-source` to those task criteria. Scope records `requirements-source.type: plan-id | task-criterion` accordingly.
- A `dependency-warning: expanded-to-upstream` from the Work run is **expected** (the user explicitly expanded scope), **not** creep — Analyze must not flag upstream-task files as creep when the Work record shows the expansion was authorized.
- A `tentative` (blocked/skipped) task's files are still reviewed, but creep findings on them are flagged with the `tentative` note so the reviewer knows the file may not reflect final intent.

## Validation (Scope Step 4 / Analyze Step 1 re-checks)

- The category ran only when requirements were present (else explicitly skipped with the note).
- Every scope-creep finding carries `scope-creep: true` (never a `trace`) and a `location`.
- No scope-creep finding was emitted when `spec-content: none`.
- The confirmed count reconciles with the preliminary count (any delta is a documented Analyze pause trigger, not a silent discrepancy).

## Notes

- This reference is the single source of truth for the detection algorithm, the trace vs scope-creep-flag logic, and the "requires requirements" rule.
- Scope applies the preliminary check; Analyze applies the final check; Report derives approval from the creep flag (per [approval-criteria.md](approval-criteria.md)); neither the modules nor the orchestrator re-encode the algorithm.
- The `preliminary-scope-creep` field on the Review Scope artifact and the `scope-creep-summary` field on the Review Report are both populated from this reference's outputs.