---
title: Install Skills
description: Verify or manually install Arreio skills to the project's .agents/skills directory, providing a fallback if npm postinstall was skipped.
type: module
version: 1.0
timestamp: "2026-09-01"
---

# Phase 0 - Install Skills (Fallback)

**Purpose:** Verify that Arreio skills are installed to the project's `.agents/skills/` directory, making them available for discovery and invocation by your AI coding agent. This is normally handled by the npm postinstall script, but this phase provides a manual fallback if postinstall was skipped or if users need to reinstall skills.

## Workflow

This is the Phase 0 pipeline for the Arreio Init Skill. It performs verification and optional installation before creating project structure.

### Step 1: Check if Skills Already Installed

First, verify that Arreio skills are already available:

1. Check if `.agents/skills/` directory exists in the project and contains the expected skill folders (plan, work, review, learn, end-session, arreio-init).
2. If all skills are present and current, log success and skip to project structure initialization (Step 2).
3. If skills are missing or incomplete, proceed to Step 2.

**Result:**

- ✓ Skills already installed → Skip to project structure
- ✗ Skills missing → Proceed to manual installation

### Step 2: Verify Installation Context (if needed)

### Step 2: Verify Installation Context (if needed)

Verify that the prerequisites are met if skills need to be installed:

1. Arreio is installed as an npm package in the current project (`node_modules/arreio/` exists).
2. The skills directory exists in the package: `node_modules/arreio/skills/` contains subdirectories for each skill.
3. The project directory is writable (required to create `.agents/skills/`).

If any verification fails:

- **Missing package:** Suggest running `npm install arreio` first.
- **Missing skills:** Report a package integrity error (the skills/ directory is missing from the installed package).
- **No write access:** Report an environment error (unable to write to project directory).

### Step 3: Create Target Directory

Create the destination directory hierarchy:

### Step 3: Create Target Directory

Create the destination directory hierarchy:

1. If `.agents/` does not exist, create it.
2. If `.agents/skills/` does not exist, create it.
3. Log: `✓ Created .agents/skills/`

### Step 4: Copy Skills from Package

Copy each skill directory from `node_modules/arreio/skills/` to `.agents/skills/`:

**Skills to copy:**

- `plan` — Planning and decomposition
- `work` — Task execution with guardrails
- `review` — Code review and analysis
- `learn` — Knowledge capture and indexing
- `end-session` — Session documentation
- `arreio-init` — Workspace initialization (this skill itself, for re-runs)

**Copy algorithm:**

For each skill:

1. Read the source directory: `node_modules/arreio/skills/<skill-name>/`
2. Copy recursively to destination: `.agents/skills/<skill-name>/`
3. Verify the destination directory was created and contains the expected files (`SKILL.md`, `modules/`, `references/`).
4. Log: `✓ Copied <skill-name>`

If any copy operation fails:

- Log the error and the source/destination paths.
- Ask the user to manually verify the source exists and the destination is writable.
- Do not proceed to the next phase.

### Step 5: Verify Installation Success

After all skills are copied, verify that the expected skill files are present:

For each skill, check:

- `.agents/skills/<skill-name>/SKILL.md` exists
- Directory structure is intact (modules/, references/ subdirs if present)

If verification passes, log:

```
✓ Arreio skills installed successfully
  - plan
  - work
  - review
  - learn
  - end-session
  - arreio-init

Skills are now available to your AI coding agent.
```

If verification fails for any skill, report which skills failed and suggest manual verification.

### Step 6: Log Installation Summary

Provide the user with confirmation and next steps:

```
Installation complete. Arreio skills are now available:

Next step: Project structure will be initialized in the next phase of arreio-init.

You can now use:
  /plan    — Create implementation plans
  /work    — Execute tasks with guardrails
  /review  — Conduct code reviews
  /learn   — Capture and organize knowledge
```

## Success Criteria

After this phase completes:

- ✓ `.agents/skills/` directory exists in the project
- ✓ All six skills are copied to `.agents/skills/`:
  - `.agents/skills/plan/`
  - `.agents/skills/work/`
  - `.agents/skills/review/`
  - `.agents/skills/learn/`
  - `.agents/skills/end-session/`
  - `.agents/skills/arreio-init/`
- ✓ Each skill directory contains `SKILL.md` and expected subdirectories
- ✓ Skills are ready for discovery by your AI coding agent

## Error Handling

Refer to [error-handling.md](../references/error-handling.md) for category classification and resolution strategies. Common errors:

- **Category 1 (Missing context):** Arreio package not installed; suggest `npm install arreio`.
- **Category 2 (Routing error):** Skills directory missing from package; report package integrity issue.
- **Category 3 (Environment issue):** Cannot write to project `.agents/` directory; insufficient permissions.

## Notes

- This phase runs **before** project structure initialization (Phase 1 → Create Core Folders).
- Skills are copied to the project's `.agents/` directory, keeping them scoped to the project. Each project gets its own copy of skills.
- The copy is non-destructive; if skills already exist in `.agents/skills/`, they are overwritten with the latest version from the installed package. This supports package updates.
- This phase is idempotent; running it multiple times produces the same result.
