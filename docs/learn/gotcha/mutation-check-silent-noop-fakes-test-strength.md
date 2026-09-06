---
slug: mutation-check-silent-noop-fakes-test-strength
type: gotcha
domain: testing
priority: important
applicability:
  current_project: 7
  general: 9
tags: [testing, verification, review, mutation-testing]
created_at: 2026-09-04T20:20:00-04:00
updated_at: 2026-09-04T20:20:00-04:00
source:
  type: candidate
  reference: 2026-09-04-003-review#5
  extracted_at: 2026-09-04T20:20:00-04:00
confidence: high
summary: A mutation check whose source edit silently fails to apply reports 'all tests passed', which reads as a test gap when nothing was mutated — assert the edit landed (diff/replace-count) before interpreting the result.
related: [test-config-isolation-behaviorally-not-regex, ts-block-comment-glob-star-slash-terminates-early, recheck-branch-before-each-commit]
---

# A Mutation Check That Silently No-Ops Reports Fake Evidence

## Problem

To prove a green suite actually pins behavior, you inject a deliberate defect and expect failures.
One run comes back **"18 passed"** — the conclusion seems to be: *my tests don't check this*. That
conclusion gets written into a report, and it may be entirely false.

## Trap

The mutation was never applied. A scripted edit — a `sed`, a string `replace()`, a rename — fails
**silently** when its match target no longer exists. Source drifts during a session: a symbol gets
un-exported, a constant inlined, a line re-wrapped, or (as here) an earlier refactor in the same
session renames the very token the mutation script targets. `str.replace(a, b)` with zero matches is
a no-op that returns the original text; the run then tests unmutated code and reports a clean pass.

The asymmetry is what makes this dangerous. A mutation that *applies and is caught* yields a useful
red. A mutation that *fails to apply* yields the same-looking result as a genuine test gap — so a
no-op is indistinguishable from a real finding unless you verify the edit. The no-op direction is the
bad one: it manufactures a false conclusion about test quality, and "my tests are weak" is a
conclusion people act on by rewriting good tests.

## Solution

Make the edit itself assert, then interpret the test result:

1. **Assert the match count before writing** — in a script, `assert s.count(target) == 1`; in a
   `sed`, follow it with a check that the old token is gone and the new one present.
2. **Diff or grep after mutating, before running the suite** — `git diff --stat` must show the file
   changed. Zero-diff means the mutation was a no-op and the run is meaningless.
3. **Only then** read the test outcome. Expected-fail confirms the test pins the behavior; expected-
   pass is the real (and rarer) finding.
4. Re-run the corrected mutation and record both results, so the report shows the *verified* evidence
   rather than the artifact of a broken script.

In the source case, redoing the edit against the current token (the now-private
`RETRYABLE_ERROR_KINDS`) turned a false "18 passed" into **3 genuine failures**, confirming the suite
does pin retry semantics.

## Prevention

- Treat **"a test run on code you did not verify you changed"** as not evidence at all. The mutation
  script's exit code is not the check; the diff is.
- Write mutation checks with the same discipline as the tests they validate: a target that must match
  exactly once, or the script fails loudly.
- Prefer structural mutation over textual — replace a *value* the compiler must keep valid (`true` →
  `false`, one enum member → another) rather than a token string that may have been renamed. Textual
  targets rot within the same session; value targets don't.
- Apply the same rule to the inverse operation: a revert that silently fails leaves a mutated tree
  that then "passes", which is worse — it hides a defect that is still present. Re-verify the restore
  (re-run the suite, expect the original count).
- Report the mutation table with what was *expected* to break, so a reviewer can spot a no-op row
  (a mutation listed with zero failures is a question, not a result).

## Related Learnings

- `test-config-isolation-behaviorally-not-regex` — same root discipline: exercise the mechanism and
  assert the outcome, never trust that a textual operation had an effect.
- `ts-block-comment-glob-star-slash-terminates-early` — another case where the tool's silent
  interpretation of text diverges from what the author meant.
- `recheck-branch-before-each-commit` — sibling failure class: an assumption set earlier in a session
  (that the edit applies / that the branch is checked out) that stops being true mid-session.

## Source

Task `2026-09-04-001-T03` Review phase, `docs/plans/.work/.review/2026-09-04-003-review.md`
(mutation table M1–M3). The M3 script targeted `export const RETRYABLE_ERROR_KINDS`, but the Execute
Refactor pass — committed in `be635ba` — had already made that constant module-private in the same
session, so the script's match target no longer existed anywhere in the file.
