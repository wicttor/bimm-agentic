---
title: Error Handling & Recovery
description: Critical failure modes and recovery steps for end-session
type: reference
version: 2.0
timestamp: "2026-09-01"
---

# Error Handling & Recovery

Minimal reference for critical failures only. Surface errors explicitly; never silently skip or fabricate data.

## Critical Failures (Exit Immediately)

| Scenario                                                        | Recovery Action                                            |
| --------------------------------------------------------------- | ---------------------------------------------------------- |
| Working tree is unreadable (repo access issue)                  | Log error; ask user to verify repository is accessible     |
| Working tree is clean (no changes)                              | Inform user, exit gracefully (nothing to commit)           |
| User declines session completion (Phase 2)                      | List incomplete work, exit without committing              |
| Commit message is empty or invalid                              | Re-prompt user; never commit with placeholder              |
| Commit creation fails (identity not configured, hook rejection) | Log failure reason; do not fabricate SHA; suggest fix      |
| File write fails (artifact or index permission denied)          | Log error; provide commit SHA so user can recover manually |

## Self-Healing (Non-Blocking)

- **Missing `docs/plans/.end-session/`** → create it automatically
- **Missing `## Session Ends` in `docs/plans/index.md`** → create section before appending
- **Missing `docs/plans/index.md` entirely** → create minimal index with section

## User Decisions Always Required

- Confirm session completion (Phase 2)
- Approve commit message before committing
- Approve staging files before commit creation

4. If terminate = Yes: stop and inform the user with:
   - Error category and trigger
   - Recovery action attempted
   - Reason for termination
5. If terminate = No: after recovery, continue to the next step of the phase

````

## Retry Limits

- **Maximum retries per error:** 1
- **Maximum total retries per phase:** 2
- After exhausting retries, terminate with a clear error explaining what failed and suggesting the user resolve the underlying issue and re-run `/end-session`.

## Error Reporting Format

When reporting an error to the user, use this format:

```yaml
error:
  phase: pre-flight | confirm-completion | prepare-commit | create-commit | save-artifact | post-commit
  step: 0 | 1 | 2 | ...
  category: 1 | 2 | 3 | 4 | 5 | 6
  trigger: "[specific trigger description]"
  recovery_attempted: "[action taken]"
  outcome: recovered | terminated
  suggestion: "[next step for the user]"
````

## Cross-Phase Consistency Checks

| Check                                                                      | Action on Failure                                        |
| -------------------------------------------------------------------------- | -------------------------------------------------------- |
| `interactionMode` is identical across all phases                           | Log warning; use the earliest non-default value          |
| Change list in Phase 3/4 matches the Pre-flight list (no silent additions) | Reject; return to Pre-flight                             |
| Session artifact `commit-sha` matches the commit reported in Phase 4       | Reject the artifact; re-run Phase 5 with the correct SHA |
| Session artifact `agent` matches the attribution confirmed in Phase 3      | Reject the artifact; re-run Phase 5                      |
| `session-id` date matches today's date                                     | Reject; re-allocate the session-id                       |

## Notes

- All errors and warnings should be logged with a timestamp for debugging.
- Graceful exits (clean tree, user-declined completion) are **not** failures — they are valid outcomes of Phases 1–2 and must be reported as such.
- The skill is not resume-safe by design: a failed session end is re-run from Phase 1 with a fresh look at the working tree. The only idempotent write is the session artifact (overwrite on the same `session-id`, never duplicate).
- This reference is shared by all six phases; phase-specific handling is documented inline in the SKILL.md workflow.
