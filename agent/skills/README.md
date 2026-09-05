# Agent Skills Directory

This directory contains procedural skills that the agent can discover and inject into prompts when their trigger conditions match the current task context.

## Directory Structure

Each skill is a directory named after the skill's identifier, containing a single `SKILL.md` file:

```
agent/skills/
├── validation-fix/
│   └── SKILL.md
├── optimization/
│   └── SKILL.md
└── ... (other skill directories)
```

## SKILL.md Format

Each `SKILL.md` file must start with YAML frontmatter followed by markdown body content.

### Frontmatter (Required Fields)

```yaml
---
name: <identifier>
description: <one-line description>
when-to-use: <condition or trigger>
---
```

**Fields:**

- `name` (string, required): Unique skill identifier. Should be kebab-case (e.g., `validation-fix`). This is used as the skill's unique ID.
- `description` (string, required): A short, one-line description of what this skill helps with. This appears in the skill index rendered to prompts.
- `when-to-use` (string, required): A plain-language condition or trigger describing when this skill applies. Examples:
  - `"task.errors contains 'type' or 'constraint' violations"`
  - `"task.purpose contains 'fast' or 'efficient'"`
  - `"task.file ends with '.test.ts'"`

### Body (Required)

After the closing `---`, the rest of the file is markdown content that becomes the procedural skill. This body is **only** injected into prompts when the skill's `when-to-use` condition matches.

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

1. **Discovers** all skills by scanning `agent/skills/*/SKILL.md`
2. **Parses** frontmatter to extract metadata (name, description, when-to-use)
3. **Renders** a skill index (name + description only) into system prompts
4. **Injects** the full body of matched skills when `when-to-use` matches a task's context

## No-Op Behavior

- If the `agent/skills/` directory does not exist, skill discovery is skipped entirely; this is a no-op that has no effect on prompt rendering.
- If a `SKILL.md` file has malformed frontmatter or missing required fields, it is skipped with a warning logged to the console; other skills are still discovered.

## Notes

- Skills are discovered and read at **prompt-build time by the agent**, not through the sandboxed tool registry. They are repo-local, developer-authored files.
- Skills are low-priority content in the token budget (T09 context builder): they are droppable if space is tight, and can never override the spec or hard rules.
- The `when-to-use` field is purely for matching logic — it is not evaluated as code; the agent's prompt builder determines which skills match based on task properties.
