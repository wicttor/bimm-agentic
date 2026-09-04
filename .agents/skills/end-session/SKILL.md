---
name: end-session
description: "Create a single clear commit at session end capturing state. Saves a session artifact to docs/plans/.end-session/ with agent attribution from file changes."
argument-hint: "[Optional: reason for ending session]"
disable-model-invocation: true
version: 2.0.0
timestamp: "2026-09-01"
---

# End Session

Create a well-documented commit when a work session ends, with a persistent session artifact for continuity.

## Usage

```text
/end-session                           # End current session
/end-session "switching to bugfix"     # End with context note
```

## Workflow

### 1. Pre-flight: Verify Changes

1. Check working tree for modifications
2. If no changes, inform the user and exit
3. Show list of changed files; ask if all should be included
4. Create `docs/plans/.end-session/` if missing (self-healing)

**Critical failure:** Working tree is unreadable or inaccessible → exit with error.

### 2. Confirm & Prepare

1. Ask user: "Ready to end this session?" (yes/no)
2. If no, list incomplete work and exit
3. Draft commit message:
   - Subject: imperative mood, ≤50 chars, no period (e.g., "Add feature" not "Added")
   - Body: explain **why**, not what; include skills used (e.g., "Used: -plan, -work")
   - Add `[AGENT: {AGENT_NAME}]` as last line (mandatory)
4. Show message for user approval; allow edits

**Critical failure:** User declines or message is empty after body prompt → exit without committing.

### 3. Create & Record

1. Stage approved files and create commit
2. Capture commit SHA
3. Allocate session ID: `YYYY-MM-DD-NNN` (date + sequential counter)
4. Write session artifact to `docs/plans/.end-session/<session-id>.md`
5. Register in `docs/plans/index.md` under `## Session Ends` (create section if missing)
6. Report: commit SHA + artifact path + suggest `/learn maintain` if learnings were touched

**Critical failure:** Commit creation fails or artifact write fails → surface error with SHA (if captured) so user can recover manually.

## Session Artifact Format

```markdown
---
type: session
session-id: 2026-09-01-001
timestamp: "2026-09-01T14:30:00"
commit-sha: "<short sha>"
agent: "<agent name>"
files-changed: <count>
status: complete
---

# Session End: <commit subject>

## Reason

<context note or "session complete">

## Changed Files

- <path> (added | modified | deleted)

## Commit Message

<verbatim subject + body>

## Next Steps

<open todos or "none">
```

## Requirements

- **Changes required**: session ends only if there are staged changes
- **User approval**: commit message always shown before committing
- **No push**: changes remain local; user pushes manually
- **Attribution**: `[AGENT: ...]` trailer derived from session file changes (current agent if mixed)
- **Artifact**: saved to `docs/plans/.end-session/` and indexed in `docs/plans/index.md`

## References

| Reference                                         | Purpose                                   |
| ------------------------------------------------- | ----------------------------------------- |
| [error-handling.md](references/error-handling.md) | Critical failure modes and recovery steps |
