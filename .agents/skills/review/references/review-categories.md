---
title: Review Categories
description: Authoritative reference for the Analyze phase. Defines the six review categories (quality, security, tests, documentation, integration, scope-creep) and the per-category checks Analyze runs across the Review Kit's diffs. Analyze applies the categories; it does not re-encode them.
type: reference
version: 1.0
timestamp: "2026-08-08"
---

# Review Categories

Authoritative reference for the **Analyze** phase (Step 1). Defines the six review categories and the per-category checks Analyze runs across the Review Kit's diffs. Each finding is tagged with exactly one `category` from this reference, a `severity` per [severity-rubric.md](severity-rubric.md), and a `location` (repository-relative `file:line` or `file:hunk`). Analyze applies the categories; it does not re-encode them.

## The Six Categories

| Category        | What it reviews                                                          | Runs when                       |
| --------------- | ------------------------------------------------------------------------ | ------------------------------- |
| `quality`       | Design, clarity, DRY, naming, error handling, structural soundness       | Always                          |
| `security`      | Input validation, authn/authz, secrets, injection, unsafe patterns       | Always                          |
| `tests`         | **Test the tests:** coverage, assertion correctness, flakiness, test smells, missing tests | Always           |
| `documentation` | Public API docs, README, inline comments, changelog for changed behavior | Always                          |
| `integration`   | Caller/contract impact, module boundaries, project conventions, consumer breakage | Always                  |
| `scope-creep`   | Changes beyond the resolved requirements                                 | Only when `spec-content` not `none` |

The scope-creep category is the only conditional one; the other five always run. Its detection logic is authoritative in [scope-creep-detection.md](scope-creep-detection.md); this reference lists it only as a category and points to that file for the algorithm.

## Per-Category Checks

### quality

Review the changed production code (and the non-test parts of touched files) for:

| Check                  | Criteria (authoritative)                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| Design & structure     | The change fits the existing architecture; no gratuitous abstraction or premature layering             |
| Clarity                 | Intent is readable; no cryptic or misnamed symbols; complex logic is commented where needed           |
| DRY                     | No duplicated logic introduced by the change that belongs in a shared helper                            |
| Naming                  | Identifiers are intention-revealing (matches project conventions)                                      |
| Error handling          | Errors are propagated/handled explicitly, not swallowed; no silent `catch` that hides root causes     |
| Structural soundness    | Functions/classes do one thing; no overlarge units introduced; no speculative generality               |

Trim, don't add: a quality finding is warranted when the change **introduces** a smell, not by a pre-existing condition outside the change boundary.

### security

Review the change for:

| Check                  | Criteria (authoritative)                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| Input validation        | User/external input is validated at the boundary; no untrusted data flowing unchecked                   |
| Authn / authz           | Authentication/authorization checks are present where the change touches a protected path              |
| Secret leakage          | No secrets (API keys, tokens, passwords) added to code/config/logs; no secret committed to disk        |
| Injection               | No SQL/OS/command/template injection introduced; parameterized queries used                             |
| Unsafe patterns         | No `eval`/`exec`/`innerHTML`/deserialization-of-untrusted-data/path-traversal introduced               |
| Dependency safety      | No known-vulnerable dependency added (Analyze notes it; corroborate with a scanner if configured)      |

A security finding is almost always at least `major`, often `blocker` per [severity-rubric.md](severity-rubric.md).

### tests

**Test the tests** — evaluate the tests that accompany the change, not just production code. Use the Review Kit's `test-context` (covering tests per changed file; whether the change ships its own tests):

| Check                  | Criteria (authoritative)                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| Coverage                | Changed behavior is covered by a test; a production-code change with **no** accompanying test is a finding |
| Assertion correctness   | Tests assert the **intended** behavior (the Acceptance Criterion / expected behavior), not incidental implementation details |
| Flakiness               | No timing/order-dependent assertions, no shared mutable state, no reliance on external network/state    |
| Test smells             | No skipped/`.only`/commented-out assertions; no brittle string-matching where structural checks suffice |
| Boundary cases          | Edge cases (empty, null, max, error paths) are covered where the behavior warrants it                   |

> A change that adds production code without any test is itself a `major` finding (or `blocker` if the changed behavior is security/core-flow). This is the **most important** tests-category signal.

### documentation

Review the change for:

| Check                  | Criteria (authoritative)                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| Public API docs         | New/changed public exports are documented (JSDoc/docstrings/OpenAPI) where the project documents them  |
| README / changelog     | User-facing behavior changes are noted in README/CHANGELOG per project convention                       |
| Inline comments         | Non-obvious logic is commented (intent, not mechanics); no commented-out code left                       |
| Removed docs            | When behavior is removed/deprecated, the docs are updated to match (no stale references)                 |

Documentation findings are typically `minor`/`nit` unless the change silently alters a public/documented behavior (then `major`).

### integration

Review the change's impact on the surrounding system (use the Review Kit's `context` callers/importers):

| Check                  | Criteria (authoritative)                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| Caller / contract impact| Callers of changed public symbols still compile/behave; no silent contract break                         |
| Module boundaries       | The change respects module boundaries; no cross-boundary coupling introduced                            |
| Project conventions     | The change follows the project's conventions (naming, layering, import rules, error style)              |
| Consumer breakage       | No downstream consumer (internal or external) is broken by the change                                   |
| Backward compatibility  | Backward-incompatible changes are deliberate and surfaced (not silent)                                   |

An integration finding that breaks consumers is typically `major`; a silent breaking change is `blocker`.

### scope-creep

**Only when `spec-content` is not `none`.** The detection algorithm is authoritative in [scope-creep-detection.md](scope-creep-detection.md). Each creep finding carries `scope-creep: true` (never a `trace`) and a `location`. When `spec-content: none`, Analyze records this category as `skipped (no requirements)` and emits no scope-creep findings.

## How to Use This Reference (Analyze)

1. For each changed file in the Review Kit's `diffs`, run the five always-on categories against the hunks.
2. Run the scope-creep category only when `spec-content` is present, per [scope-creep-detection.md](scope-creep-detection.md).
3. Tag each finding with exactly one `category` from the table above, a `severity` from [severity-rubric.md](severity-rubric.md), and a `location`.
4. Attach a `trace` **or** `scope-creep: true` flag per [scope-creep-detection.md](scope-creep-detection.md).
5. Optionally corroborate a finding with a configured tool (linter/type-checker/test run) — tools corroborate, they never create findings outside the change boundary.

## Failure-Condition Reference

| Trigger                                                | Outcome per this reference                                  |
| ------------------------------------------------------ | ----------------------------------------------------------- |
| Production-code change with no accompanying test         | `tests` finding (signal severity per rubric)                |
| Scope-creep category invoked with `spec-content: none`   | Reject per [error-handling.md](error-handling.md) Category 6 |
| Finding with no `category` from this reference           | Reject (Category 2 / Category 6 recovery)                   |
| A finding warranted only by a pre-existing repo condition (outside the change boundary) | Drop the finding — Review reviews the change, not the whole repo |

## Notes

- This reference is the single source of truth for the category set and per-category check criteria. Analyze applies it; Report aggregates by category and never re-defines the checks.
- Tools (linters/type-checkers/test runs) are **corroborative only** — a finding must be warranted by the change under review, never by a pre-existing condition elsewhere in the repo. This is the guardrail against "Review became a repo-wide audit."
- The scope-creep category deliberately defers to [scope-creep-detection.md](scope-creep-detection.md) for its algorithm; this reference lists it only as a category to avoid re-encoding the detection rules in two places (honoring single-source-of-truth).