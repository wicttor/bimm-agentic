// Acceptance-Criterion test for task 2026-09-04-001-T15 (Skill discovery and prompt injection).
//
// AC under test:
//   Skills are discovered from agent/skills/*/SKILL.md, indexed (name + description only),
//   injected fully (with body) when 'when-to-use' matches a task context; missing dir is a no-op;
//   malformed frontmatter is skipped with a warning, not aborting the run.

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  discoverSkills,
  renderSkillIndex,
  loadSkillBody,
  injectMatchingSkills,
  type SkillMeta,
} from "../src/skills.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const testSkillsDir = join(repoRoot, ".test-skills-temp");

/**
 * Test fixture: a valid skill with frontmatter, name, description, and when-to-use.
 */
const VALID_SKILL_CONTENT = `---
name: validation-fix
description: "Techniques for fixing validation errors without weakening contracts"
when-to-use: "task.errors contains 'type' or 'constraint' violations"
---

# Validation Fix Techniques

When the validation gate reports type errors or constraint violations:

1. **Type errors**: Check the error location, read the type definition, and adjust the value or the type guard.
2. **Constraint violations**: Verify the business rule is correctly implemented; do not weaken it.
3. **Never use type assertions** unless the type checker is wrong (rare).

Always preserve the original intent of the contract.
`;

const VALID_SKILL_CONTENT_2 = `---
name: optimization
description: "Strategies for optimizing performance without changing semantics"
when-to-use: "task.purpose contains 'fast' or 'efficient'"
---

# Optimization Strategies

Focus on algorithmic improvements:

1. Review the current implementation for unnecessary work.
2. Eliminate redundant computations.
3. Consider caching if repeated calls are likely.

Measure before and after.
`;

const MALFORMED_SKILL_CONTENT = `---
name: broken
description: "A skill with broken frontmatter
when-to-use: "unclosed quote

This content is never parsed.
`;

beforeEach(() => {
  // Create a temporary test skills directory
  if (existsSync(testSkillsDir)) {
    rmSync(testSkillsDir, { recursive: true });
  }
  mkdirSync(testSkillsDir, { recursive: true });
});

afterEach(() => {
  // Clean up after tests
  if (existsSync(testSkillsDir)) {
    rmSync(testSkillsDir, { recursive: true });
  }
});

describe("Skills discovery and injection (T15)", () => {
  describe("discoverSkills", () => {
    it("discovers valid skills from SKILL.md files", () => {
      // Arrange: create two valid skills
      mkdirSync(join(testSkillsDir, "validation-fix"));
      mkdirSync(join(testSkillsDir, "optimization"));
      writeFileSync(join(testSkillsDir, "validation-fix", "SKILL.md"), VALID_SKILL_CONTENT);
      writeFileSync(
        join(testSkillsDir, "optimization", "SKILL.md"),
        VALID_SKILL_CONTENT_2
      );

      // Act
      const skills = discoverSkills(testSkillsDir);

      // Assert: skills are sorted alphabetically by id
      expect(skills).toHaveLength(2);
      // "optimization" < "validation-fix" alphabetically
      expect(skills[0]).toMatchObject({
        id: "optimization",
        name: "optimization",
        description: "Strategies for optimizing performance without changing semantics",
        whenToUse: "task.purpose contains 'fast' or 'efficient'",
      });
      expect(skills[1]).toMatchObject({
        id: "validation-fix",
        name: "validation-fix",
        description: "Techniques for fixing validation errors without weakening contracts",
        whenToUse: "task.errors contains 'type' or 'constraint' violations",
      });
    });

    it("is a no-op when skills directory does not exist", () => {
      // Act & Assert: no error thrown, returns empty array
      const skills = discoverSkills(join(repoRoot, "does-not-exist"));
      expect(skills).toEqual([]);
    });

    it("skips malformed skills with a warning", () => {
      // Arrange: create one valid and one malformed skill
      mkdirSync(join(testSkillsDir, "good-skill"));
      mkdirSync(join(testSkillsDir, "bad-skill"));
      writeFileSync(join(testSkillsDir, "good-skill", "SKILL.md"), VALID_SKILL_CONTENT);
      writeFileSync(join(testSkillsDir, "bad-skill", "SKILL.md"), MALFORMED_SKILL_CONTENT);

      // Spy on console.warn
      const warnSpy = vi.spyOn(console, "warn");

      // Act
      const skills = discoverSkills(testSkillsDir);

      // Assert: good skill is discovered, bad one is skipped with warning
      expect(skills).toHaveLength(1);
      expect(skills[0]?.name).toBe("validation-fix");
      expect(warnSpy).toHaveBeenCalled();
      expect(warnSpy.mock.calls[0]?.[0]).toContain("bad-skill");

      warnSpy.mockRestore();
    });

    it("ignores files that are not SKILL.md", () => {
      // Arrange: create a skill directory with extra files
      mkdirSync(join(testSkillsDir, "skill-with-extras"));
      writeFileSync(
        join(testSkillsDir, "skill-with-extras", "SKILL.md"),
        VALID_SKILL_CONTENT
      );
      writeFileSync(join(testSkillsDir, "skill-with-extras", "README.md"), "# Extra file");
      writeFileSync(join(testSkillsDir, "skill-with-extras", "example.ts"), "// Code");

      // Act
      const skills = discoverSkills(testSkillsDir);

      // Assert: only SKILL.md is parsed
      expect(skills).toHaveLength(1);
    });
  });

  describe("renderSkillIndex", () => {
    it("renders a readable index of skill names and descriptions", () => {
      // Arrange
      const metas: SkillMeta[] = [
        {
          id: "validation-fix",
          name: "validation-fix",
          description: "Techniques for fixing validation errors without weakening contracts",
          whenToUse: "task.errors contains 'type' or 'constraint' violations",
          body: "...",
          filePath: "test",
        },
        {
          id: "optimization",
          name: "optimization",
          description: "Strategies for optimizing performance without changing semantics",
          whenToUse: "task.purpose contains 'fast' or 'efficient'",
          body: "...",
          filePath: "test",
        },
      ];

      // Act
      const index = renderSkillIndex(metas);

      // Assert
      expect(index).toContain("validation-fix");
      expect(index).toContain("Techniques for fixing validation errors");
      expect(index).toContain("optimization");
      expect(index).toContain("Strategies for optimizing performance");
      // Body text should NOT be in index
      expect(index).not.toContain("Validation Fix Techniques");
    });

    it("returns empty string for empty skill list", () => {
      // Act
      const index = renderSkillIndex([]);

      // Assert
      expect(index).toBe("");
    });
  });

  describe("loadSkillBody", () => {
    it("returns the body of a skill file", () => {
      // Arrange: create a skill
      mkdirSync(join(testSkillsDir, "test-skill"));
      const skillPath = join(testSkillsDir, "test-skill", "SKILL.md");
      writeFileSync(skillPath, VALID_SKILL_CONTENT);

      const meta: SkillMeta = {
        id: "test-skill",
        name: "test-skill",
        description: "Test",
        whenToUse: "test",
        body: "", // Will be loaded
        filePath: skillPath,
      };

      // Act
      const body = loadSkillBody(meta);

      // Assert
      expect(body).toContain("Validation Fix Techniques");
      expect(body).toContain("Type errors");
      expect(body).not.toContain("name: validation-fix");
    });
  });

  describe("injectMatchingSkills", () => {
    it("injects skills that match the given condition", () => {
      // Arrange
      const metas: SkillMeta[] = [
        {
          id: "validation-fix",
          name: "validation-fix",
          description: "Techniques for fixing validation errors",
          whenToUse: "hasErrors",
          body: "# Validation Fix\n\nFix validation errors.",
          filePath: "test",
        },
        {
          id: "optimization",
          name: "optimization",
          description: "Optimization strategies",
          whenToUse: "needsFastness",
          body: "# Optimization\n\nOptimize for speed.",
          filePath: "test",
        },
      ];

      const prompt = "This is the task prompt.";

      // Act: inject skills where whenToUse matches
      const result = injectMatchingSkills(prompt, metas, (meta) => meta.id === "validation-fix");

      // Assert
      expect(result).toContain("This is the task prompt.");
      expect(result).toContain("Validation Fix");
      expect(result).toContain("Fix validation errors.");
      expect(result).not.toContain("Optimization");
      expect(result).not.toContain("Optimize for speed");
    });

    it("returns prompt unchanged if no skills match", () => {
      // Arrange
      const metas: SkillMeta[] = [
        {
          id: "validation-fix",
          name: "validation-fix",
          description: "Techniques for fixing validation errors",
          whenToUse: "hasErrors",
          body: "# Validation Fix\n\nFix validation errors.",
          filePath: "test",
        },
      ];

      const prompt = "This is the task prompt.";

      // Act: inject with no matching condition
      const result = injectMatchingSkills(prompt, metas, () => false);

      // Assert
      expect(result).toBe(prompt);
    });

    it("injects multiple matching skills", () => {
      // Arrange
      const metas: SkillMeta[] = [
        {
          id: "skill1",
          name: "skill1",
          description: "First",
          whenToUse: "matches",
          body: "# Skill 1\n\nContent 1.",
          filePath: "test",
        },
        {
          id: "skill2",
          name: "skill2",
          description: "Second",
          whenToUse: "also-matches",
          body: "# Skill 2\n\nContent 2.",
          filePath: "test",
        },
      ];

      const prompt = "Task prompt";

      // Act: inject both skills
      const result = injectMatchingSkills(prompt, metas, () => true);

      // Assert
      expect(result).toContain("Skill 1");
      expect(result).toContain("Skill 2");
      expect(result).toContain("Content 1");
      expect(result).toContain("Content 2");
    });
  });

  describe("Integration: full discovery and index flow", () => {
    it("discovers skills and renders index without body text", () => {
      // Arrange: create two valid skills
      mkdirSync(join(testSkillsDir, "validation-fix"));
      mkdirSync(join(testSkillsDir, "optimization"));
      writeFileSync(join(testSkillsDir, "validation-fix", "SKILL.md"), VALID_SKILL_CONTENT);
      writeFileSync(
        join(testSkillsDir, "optimization", "SKILL.md"),
        VALID_SKILL_CONTENT_2
      );

      // Act
      const skills = discoverSkills(testSkillsDir);
      const index = renderSkillIndex(skills);

      // Assert
      expect(index).toContain("validation-fix");
      expect(index).toContain("optimization");
      expect(index).not.toContain("Validation Fix Techniques"); // Body content excluded
      expect(index).not.toContain("Optimization Strategies"); // Body content excluded
    });
  });
});
