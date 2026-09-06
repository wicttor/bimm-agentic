---
slug: recheck-branch-before-each-commit
type: workflow
domain: version-control
priority: important
applicability:
  current_project: 9
  general: 6
tags: [version-control, git, workflow, agent-runtime]
created_at: 2026-09-04T20:20:00-04:00
updated_at: 2026-09-04T20:20:00-04:00
source:
  type: candidate
  reference: 2026-09-04-003-review#6
  extracted_at: 2026-09-04T20:20:00-04:00
confidence: high
summary: An external session-end automation in this repo checks out main, merges, and pushes mid-run, so the branch verified at Triage may not be current at commit time — re-read git branch --show-current immediately before every commit.
related: [mutation-check-silent-noop-fakes-test-strength]
---

# Re-Verify the Checked-Out Branch Before Every Commit

## Convention

**Do not treat the branch observed at the start of a run as still true later in that run.** Read
`git branch --show-current` (plus `git status --porcelain`) **immediately before each commit**, in the
same command as the commit, and stop if the branch differs from what the run's artifacts record.

For `/work` runs specifically: the Work Manifest's `work-branch` is verified by the Triage-phase gate
and again before Execute, but a multi-task or long-running session can span an external branch change
between those checkpoints and the final commit. The commit-time check is the one that actually
determines where the work lands.

## Why

This repository has an **external session-end automation** (commits titled
`docs: record end-session artifact for <sha>`) that, on its own schedule:

1. checks out `main` from the work branch,
2. merges the work branch into it, and
3. **pushes `main` to `origin` — with credentials this agent does not have.**

Observed mid-run in task `2026-09-04-001-T03`; the reflog was unambiguous:

```
HEAD@{4}: checkout: moving from work/cli-agentic-code-generator to main
HEAD@{3}: merge e41a38e…            # Merge made by the 'ort' strategy
HEAD@{2}: commit: Add provider-agnostic LLM adapter (T03)
origin/main@{0}: update by push     # → 585be34, published externally
```

Three properties make this worth a standing convention rather than a one-off fix:

- **The switch is invisible to file work.** Untracked and modified files carry across the checkout, so
  edits, tests, and typechecks all behave normally while the commits land on a different branch than
  the one the artifacts record — violating the pipeline's branch-coherence gate with no local error.
- **It escalates from local to published.** Because the automation pushes, a branch mistake stops
  being a local cleanup and becomes rewritten public history. Correcting it after a push may require a
  force-push over commits the user never approved losing, which is why the decision belongs to the
  user, surfaced with evidence, not to the agent.
- **It is not an adversarial event.** The same automation is how T01 and T02 reached `main`; it is the
  repository's intended session-boundary flow. The convention is about coexisting with it, not
  preventing it.

## How

1. **At Triage**, record `work-branch`, `work-branch-base`, `work-branch-state` as usual, and note the
   branch's tip sha.
2. **Immediately before each commit**, in one command:
   ```bash
   git branch --show-current   # must equal the manifest's work-branch
   git status --porcelain      # must show only the files this commit intends to stage
   ```
   Prefer staging explicit paths over `git add -A`, so an unexpected tree state cannot be committed.
3. **On mismatch, do not commit.** Inspect `git reflog -n 6` and `git reflog show origin/<branch>` to
   establish whether the automation moved or pushed, then determine whether the commits are already
   published (`git rev-parse <branch> origin/<branch>`). Published state changes what remedies are
   safe.
4. **Surface it to the user with the evidence** and offer the real options — move the commits to the
   work branch, accept the state the automation produced, or leave it for manual handling. Do not
   force-push over a remote you did not write.
5. **Reconcile non-destructively where possible.** Advancing the work branch to the shared tip is a
   fast-forward; the state to avoid is local–remote divergence. Record what happened in the Work
   Report, because the next task's Triage reads this run's branch state as its baseline.
6. **Apply the same rule to every other assumption captured at run start** — test baseline, working
   tree cleanliness, and which artifacts are already committed. If it was verified once, it was
   verified against a moment, not against the run.

## Related Learnings

- `mutation-check-silent-noop-fakes-test-strength` — same root cause in a different domain: an
  assumption established earlier in a session (that the branch is checked out / that the edit applied)
  stops being true mid-session, and nothing announces it. Both are cured by re-verifying the mechanism
  at the moment its effect is committed, rather than at the moment it was configured.
