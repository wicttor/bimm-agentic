---
title: Severity Rubric
description: Authoritative reference for the Analyze phase (severity assignment) and the Report phase (rollup). Defines the four severity levels (blocker / major / minor / nit), their criteria, the borderline-default rule, and how tool corroboration affects severity. Analyze assigns severities from this rubric; Report aggregates them and never re-encodes the levels.
type: reference
version: 1.0
timestamp: "2026-08-08"
---

# Severity Rubric

Authoritative reference for the **Analyze** phase (Step 2, severity assignment) and the **Report** phase (Step 1, rollup by severity). Defines the four severity levels, their criteria, the borderline-default rule, and how tool corroboration affects severity. Analyze assigns severities from this rubric; Report aggregates the counts and derives approval per [approval-criteria.md](approval-criteria.md); neither re-encodes the levels.

## The Four Severities

| Severity   | Merge impact                                | Default category pairing (guidance, not rule)                          |
| ---------- | ------------------------------------------- | ---------------------------------------------------------------------- |
| `blocker`  | Must fix before merge; do not merge         | Security hole, data-loss risk, broken core flow, regression in green-baseline suite |
| `major`    | Should fix before merge                     | Significant quality/test/integration issue causing maintenance pain    |
| `minor`    | Nice to fix; non-blocking                   | Small quality or documentation issue                                   |
| `nit`      | Style/preference; optional                  | Cosmetic, style, minor naming                                           |

## Criteria (authoritative)

### blocker

A `blocker` finding means the change **must not merge as-is**. Assign `blocker` when **any** of:

- A **security** hole was introduced: secret leakage, injection, missing authn/authz on a protected path, unsafe deserialization of untrusted input.
- A **data-loss risk** exists: a destructive migration without safety, a write path that can corrupt state.
- A **core flow is broken** by the change: the change breaks a previously-working primary user/code path.
- A **regression** in the `green`-baseline suite (a test that was green is now red because of this change).
- The change **silently breaks a documented public contract** (consumers will fail at runtime).

### major

A `major` finding means the change should fix the issue before merge but it is not a hard block. Assign `major` when **any** of:

- A **significant quality** issue: introduced duplication across multiple files, a new overlarge unit, a design that won't scale with the change's intent.
- A **tests** issue: production-code change with **no** accompanying test (or a test that asserts the wrong thing and would still pass if the behavior regressed).
- An **integration** issue: a non-silent contract change that will cause maintenance pain for callers (but compiles/works today).
- A **scope-creep** finding that introduces a **new public API/behavior/dependency** outside the requirements (per [scope-creep-detection.md](scope-creep-detection.md)).
- A **security** issue that is real but not a hole (e.g. weak validation that is not yet exploitable in the current call path).

### minor

A `minor` finding is a non-blocking improvement. Assign `minor` when **any** of:

- A **small quality** issue: a locally duplicated block, a slightly-too-large function, a missing helper extraction.
- A **documentation** issue: a public export lacks a docstring, a behavior change isn't in the CHANGELOG, a stale comment.
- A small **integration** deviation from project conventions (naming/layering) that compiles and works.
- An incidental **scope-creep** edit (a stray unrelated formatting change in a touched file) per [scope-creep-detection.md](scope-creep-detection.md).

### nit

A `nit` is purely stylistic — optional, never blocks. Assign `nit` when:

- Cosmetic/style preferences: formatting, minor naming taste, comment wording.
- The reviewer would phrase a thing differently but there is no correctness/quality impact.

## Borderline-Default Rule

> **When a finding's severity is borderline between two levels, default to the LOWER severity.** Do not over-escalate. Report derives the approval status from the tallies; an over-escalated `blocker`/`major` count causes spurious `changes-requested`/`rejected` verdicts.

This is the deliberate counterweight to reviewer tendency to escalate. Examples:

- A `blocker`/`major` borderline → assign `major`.
- A `major`/`minor` borderline → assign `minor`.
- A `minor`/`nit` borderline → assign `nit`.

The exception to the downward default is the **security** category: a borderline `blocker`/`major` **security** finding defaults to `blocker` (security findings default upward, because the cost of a missed block is far higher than the cost of a false alarm). Document the reasoning on the finding either way.

## Tool Corroboration

A configured tool (linter/type-checker/test run) can **corroborate** a finding and **sharpen its severity**, never inflate it unjustly:

- A `minor` quality finding that a linter flags as an **error** (not warning) for this repo → sharpen to `major` (the codebase treats it as an error).
- A `major` tests claim corroborated by an actual **test run failing** (regression confirmed) → sharpen to `blocker` (confirmed regression).
- A tool flag with **no change-boundary warrant** (a pre-existing repo condition, or a style rule the change didn't worsen) → **no** finding; do not let Review become a repo-wide audit.

Corroboration is recorded on the finding (`corroborated-by: <tool> <rule>`); un-corroborated findings carry no such field. Tools never create findings on their own outside the change boundary.

## Category × Severity Guidance Matrix

This matrix pairs the [review-categories.md](review-categories.md) categories with typical severity bands (guidance, not a hard rule — the criteria above govern):

| Category        | Typical blocker            | Typical major                       | Typical minor / nit             |
| --------------- | -------------------------- | ----------------------------------- | ------------------------------- |
| `quality`       | (rare; via core-flow)      | Duplication, overlarge units, design | Local smell, naming             |
| `security`      | Hole, secret, injection    | Weak validation (not yet exploitable) | (rare)                          |
| `tests`         | Regression in green suite  | No test for new behavior; wrong assertion | Missing edge case              |
| `documentation`| Silently alters a documented contract | Change not in CHANGELOG            | Missing docstring, stale comment |
| `integration`  | Silent contract break      | Caller maintenance pain             | Convention deviation            |
| `scope-creep`   | Creep causes core-flow break | New public API/behavior/dep outside reqs | Incidental stray edit          |

## Validation (Analyze Step 2 re-checks)

Every emitted finding carries a `severity` from this rubric. A finding:

- **without** a `severity` → reject (Category 2 / Category 6 recovery).
- whose `severity` is not one of `blocker`/`major`/`minor`/`nit` → reject.
- that is a borderline case must record the applied default (lower, except security-→-blocker) implicitly — Analyze does **not** emit a textual "defaulted" note per finding, but the borderline-default rule is the conscious policy.

## Notes

- This reference is the single source of truth for severity levels, their criteria, and the borderline-default rule. Analyze assigns; Report aggregates and derives approval per [approval-criteria.md](approval-criteria.md); neither re-encodes the levels.
- The security-upward-default exception is the **only** place severity defaults upward; all other borderline cases default downward.
- Tallies feed directly into [approval-criteria.md](approval-criteria.md): `blocker` count → `rejected`; otherwise `major` count > 0 → `changes-requested`; otherwise → `approved`.