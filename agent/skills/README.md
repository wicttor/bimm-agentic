# Agent Skills Directory

Skills are procedural markdown the agent loads and follows. The pipeline's own procedures — `plan` and
`work` — come from **`.agents/skills/`** at the repository root, which is the default `--skills-dir`
(see `DEFAULTS.skillsDir` in `agent/src/config.ts`). This directory (`agent/skills/`) is a placeholder
for app-local skills and holds only this reference.

A skill is invoked two ways: **by name** (the planner loads `plan`, the executor loads `work`) or
**by condition** (`when-to-use` matching a task's context). Name-invoked skills therefore need no
text in `when-to-use`.

## Directory Structure

Each skill is a directory named after the skill's identifier, containing a `SKILL.md` and optionally
phase `modules/`:

```
.agents/skills/
├── plan/
│   ├── SKILL.md
│   └── modules/            # phase modules, inlined on request
│       ├── generate.md
│       └── tasks.md
├── work/
│   ├── SKILL.md
│   └── modules/
│       └── execute.md
└── validation-fix/
    └── SKILL.md
```

## SKILL.md Format

Each `SKILL.md` file must start with YAML frontmatter followed by markdown body content.

### Frontmatter

```yaml
---
name: <identifier>
description: <one-line description>
when-to-use: <condition or trigger>   # optional
---
```

**Fields:**

- `name` (string, required): Unique skill identifier. Should be kebab-case (e.g., `validation-fix`). This is used as the skill's unique ID.
- `description` (string, required): A short, one-line description of what this skill helps with. This appears in the skill index rendered to prompts.
- `when-to-use` (string, **optional**): A plain-language condition or trigger describing when this skill applies. Examples:
  - `"task.errors contains 'type' or 'constraint' violations"`
  - `"task.purpose contains 'fast' or 'efficient'"`
  - `"task.file ends with '.test.ts'"`

  A skill with no `when-to-use` is **not** a discovery or parse failure: `discoverSkills()` accepts it
  with `whenToUse` defaulting to `""`, and it is selected by name instead of by matching. That is
  exactly how the repository's workflow skills are written — `plan` and `work` carry only `name` and
  `description`, because the CLI loads them explicitly rather than guessing when they apply.

The only required pair is `name` + `description`. A skill missing either one is skipped with a warning,
and the rest of the directory is still discovered.

### Body (Required)

After the closing `---`, the rest of the file is markdown content that becomes the procedural skill.
When a skill is loaded **by name** (`loadSkillBundle`), its body is inlined verbatim as the binding
procedure for the call; when one is loaded **by condition**, the body is injected only for tasks whose
context matches its `when-to-use`.

Example body sections might include:

- Step-by-step procedures
- Common pitfalls to avoid
- Best practices for the skill's domain
- Code patterns or examples
- Decision trees for complex scenarios

The body is a raw markdown dump — do not include another heading level 1 (`#`), as the agent will add section headers when injecting.

## Example Skill

```markdown
---
name: validation-fix
description: "Techniques for fixing validation errors without weakening contracts"
when-to-use: "task.errors contains 'type' or 'constraint' violations"
---

## Validation Fix Techniques

When the validation gate reports type errors or constraint violations:

1. **Type errors**: Check the error location, read the type definition, and adjust the value or the type guard.
2. **Constraint violations**: Verify the business rule is correctly implemented; do not weaken it.
3. **Never use type assertions** unless the type checker is wrong (rare).

Always preserve the original intent of the contract.
```

## Discovery and Injection

At prompt-build time, the agent:

1. **Discovers** all skills by scanning `<skillsDir>/*/SKILL.md` (default `.agents/skills`)
2. **Parses** frontmatter to extract metadata (`name`, `description`, and `when-to-use` when present)
3. **Renders** a skill index (name + description only) into system prompts
4. **Loads** either the whole bundle for a named skill — plus any `modules/<phase>.md` the caller asks
   for, under `SKILL_BLOCK_MAX_BYTES`, with every non-inlined module reported — or the body of each
   condition-matched skill

## No-Op Behavior

- If the skills directory does not exist or has no skills, discovery returns nothing and the prompt is rendered without a skill block; this is a no-op, not an error.
- If a `SKILL.md` file has malformed frontmatter or is missing `name`/`description`, it is skipped with a warning logged to the console; other skills are still discovered.
- A missing or over-budget phase module is reported in the rendered block rather than dropped silently.

## Notes

- Skills are discovered and read at **prompt-build time by the agent**, not through the sandboxed tool registry. They are repo-local, developer-authored files.
- Skills are low-priority content in the token budget (T09 context builder): they are droppable if space is tight, and can never override the spec or hard rules.
- `when-to-use` is purely descriptive matching text — it is never evaluated as code; the agent's prompt builder decides which skills match based on task properties. Skills that are invoked by name leave it out.
