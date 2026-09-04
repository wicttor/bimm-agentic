---
title: Scope
description: Gather context, check existing plans and learnings, validate domain, and return a scoped context object for downstream modules (research, design, generate).
type: module
version: 1.1
timestamp: "2026-08-07"
---

# Phase 1 - Scope & Context Gathering

**Purpose:** Entry point to the planning workflow. Gathers context, checks existing plans and learnings, validates domain, and returns a scoped context object that downstream modules (research, design, generate) consume.

## Workflow

This is the Phase 1 pipeline for the Plan Skill. It orchestrates the following steps:

### Step 0: Verification

Run the **[Step 0 verification](../references/error-handling.md)**. Required input: a valid **User Input Artifact** (see [user-input.md](../references/templates/artifacts/user-input.md)) from the Orchestrator.

### Step 1: Check for Existing Plan

1. Search `docs/plans/index.md` for existing plans related (grep title and description) to the task.
   - If the index file does not exist, assume no existing plans are present.
   - Ask the user one multiple-choice question:
     ```
     The Plans Index was not found. Do you want to run the /arreio-init to create all the necessary folders, files, and index for planning? (Recommended)
     What would you like to do?
      - Yes: Run /arreio-init to create the planning structure
      - No: Skip and continue without creating the structure
     ```
   - If the user selects "Yes," run `/arreio-init` to create the necessary structure, then run the Step 1 of the Scope phase again to check for existing plans.

2. **If an existing plan is found:**
   - Read the plan to understand its title and goal. Plan files are stored in `docs/plans/` with naming format: `YYYY-MM-DD-NNN-<kebab-case-name>.md` (e.g., `docs/plans/2026-07-02-001-migrate-session-storage.md`)
   - Ask the user one multiple-choice question:
     ```
     An existing plan was found: "[Plan Title]"
     What would you like to do?
     - Resume: Continue working on this plan
     - Review: Read the plan before deciding
     - Archive: Keep for reference, mark as inactive
     - Delete: Remove the plan entirely
     - Create New: Start fresh
     ```
   - Handle each choice:
     - **Resume:** Use plan as-is; set `existing_plan.action: resume`, `existing_plan.path: docs/plans/YYYY-MM-DD-NNN-<kebab-case-name>.md` and carry the reference forward; the pipeline still runs and produces a new `plan-id` that supersedes the existing plan
     - **Review:** Show plan summary, then re-prompt with same options
     - **Archive:** Move to archive; set `existing_plan.action: archive`, update `docs/plans/index.md` to mark as archived
     - **Delete:** Remove file; set `existing_plan.action: delete`, update `docs/plans/index.md` to remove entry
     - **Create New:** Keep old plan in archive; set `existing_plan.action: create-new`, `existing_plan.path: null`

3. **If no existing plan is found:**
   - Set `existing_plan.path: null`, `existing_plan.action: none`
   - Proceed to Step 2

### Step 2: Domain Validation

- Check if the context provided is a software/code planning task (the downstream phases are tailored for software planning).
- Record `domain: software | non-software` in the scoped context.
- **If the task is non-software:** ask one question with options *(1) Proceed anyway* (continue with generic, reduced software-style guidance) or *(2) Abort and plan manually*. On Abort, stop and inform the Orchestrator. On Proceed, continue with `domain: non-software`.

### Step 3: Bootstrap Problem Context

Evaluate if context is "rich enough" by confirming the **User Input Artifact** contains **all three** of:

- **Problem frame** — a clear `Task Description` (the problem statement)
- **Intended Behavior** — an observable desired outcome
- **Success Criteria** — 1–3 measurable outcomes (derive from `Goals & Objectives` if already measurable; otherwise collect below)

**If any of these three are missing or vague:** ask the user, one question at a time:

1. **Problem Frame:** "What problem are you trying to solve? Describe it in 1–2 sentences." (maps to `Task Description`)
2. **Intended Behavior:** "What should happen after this is implemented? Describe the desired outcome." (maps to `Intended Behavior`)
3. **Success Criteria:** "How will we know this is complete? What specific outcomes define success?" Collect 1–3 criteria.

**If all three are present and concrete:** extract them from the **User Input Artifact** and proceed to Step 4.

### Step 4: Learnings Index Gate

Always search for project learnings (in `docs/learn/index.md`) for entries matching the task description. For details on keyword matching, relevance rating, gap identification, and examples, see **[learnings-gate-logic.md](../references/learnings-gate-logic.md)**. Add HIGH and MEDIUM relevance learnings to `Related Learnings`; identify and document any learning gaps.

### Step 5: Requirements Search

1. Search `docs/` for files whose names or content match the task description.
   - Keywords: exact match on filename, grep content for relevant terms
   - If the directory does not exist, skip silently
   - ignore files in `docs/archives/`,`docs/plans/`, and `docs/learn/` (already handled in previous steps)
2. **For each match:**
   - Extract the title and a 1-2 sentence relevant excerpt
   - Add to `Requirements Found` list
3. If no matches found, set `Requirements Found` to empty.

### Step 6: Generate the Scoped Context Artifact

1. **Assign a `scope-id`** per [id-generation.md](../references/id-generation.md) (format `YYYY-MM-DD-NNN-scope`, saved to `docs/plans/.scope/`). Reuse it if the user later picks **Edit & Retry**.

2. Produce a **Scoped Context Artifact** block (as markdown) following the schema in [scoped-context.md](../references/templates/artifacts/scoped-context.md).
   - Include the generated `scope-id` in the artifact

### Step 7: Present, Confirm, and Save

Apply the **[phase confirmation behavior](../references/interaction-mode-propagation.md)** for the current `interactionMode`, using these scope-specific **Smart pause triggers**:

- 3+ learning gaps identified, or
- Domain flagged non-software (Step 2), or
- Conflicting requirements detected in the User Input.

- **Detailed:** present the Scoped Context Artifact and ask one question with options *(1) Proceed to Research, (2) Edit & Retry, (3) Abort*. On **Edit & Retry**, loop back through Steps 2–6 reusing the `scope-id`. On **Abort**, stop and inform the Orchestrator.
- **Smart:** pause only when a pause trigger above is true; otherwise auto-proceed.
- **Autopilot:** auto-proceed (no confirmation).

Then save the artifact to `docs/plans/.scope/<scope-id>.md` (ensure `interactionMode` is included) and return it, with the `interactionMode` value, to the Orchestrator for the transition to Phase 2 (Research).

## Output: Scoped Context Artifact

- Verify that the Scoped Context Artifact is complete and valid, containing all required fields, and it accurately reflects the user's input and any existing plans, learnings, or requirements found.
- Verify that the `interactionMode` value is set correctly based on the user's selection in the Orchestrator skill.
- Verify that the artifact is saved to `docs/plans/.scope/<scope-id>.md` for future reference or reuse.

> Pass the scoped context to `research` (Phase 2) for the research phase.
