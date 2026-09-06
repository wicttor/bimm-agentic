// Skill discovery and injection (task 2026-09-04-001-T15).
//
// Discovers skills from `<skillsDir>/*/SKILL.md` (default `.agents/skills`, where the repository's
// own workflow skills live: plan, work, learn, review), parses frontmatter to extract metadata,
// and provides utilities to render a skill index, inject matched skill bodies into prompts, and
// load a skill's **phase modules** (`<skillDir>/modules/<phase>.md`) as one bounded bundle.
// A missing or empty skills directory is a no-op with no error.
//
// Arreio skills (`plan`, `work`) carry only `name` + `description` in frontmatter and no
// `when-to-use`, because they are invoked explicitly rather than matched to a task. `when-to-use`
// is therefore optional: present when a skill wants condition-based injection, absent when it
// wants name-based selection (`loadSkillBundle` by id).

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Metadata extracted from a skill's frontmatter.
 * Frontmatter format:
 *   ---
 *   name: <identifier>
 *   description: <short description>
 *   when-to-use: <condition or trigger>   # optional; absent for explicitly-invoked skills
 *   ---
 *   # Body
 *   ... markdown content ...
 */
export interface SkillMeta {
  /** Unique skill identifier (derived from directory name or frontmatter). */
  id: string;
  /** Human-readable skill name (from frontmatter). */
  name: string;
  /** One-line description (from frontmatter). */
  description: string;
  /**
   * Trigger condition or context where this skill applies (from frontmatter).
   * Empty string for skills with no `when-to-use` key — those are selected by name, not matched.
   */
  whenToUse: string;
  /** The body of the skill file (markdown content after frontmatter). */
  body: string;
  /** Full file path (for debugging and loading). */
  filePath: string;
}

/**
 * Parses YAML/frontmatter from the top of a file.
 * Returns { frontmatter object, body content } or null if parsing fails.
 */
function parseFrontmatter(
  content: string
): { meta: Record<string, string>; body: string } | null {
  const lines = content.split("\n");

  // Must start with ---
  if (!lines[0]?.startsWith("---")) {
    return null;
  }

  // Find the closing ---
  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.startsWith("---")) {
      endIdx = i;
      break;
    }
  }

  if (endIdx === -1) {
    return null; // No closing delimiter found
  }

  // Parse frontmatter lines as simple key: value pairs
  const meta: Record<string, string> = {};
  for (let i = 1; i < endIdx; i++) {
    const line = lines[i];
    if (!line || !line.includes(":")) continue;

    const colonIdx = line.indexOf(":");
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();

    // Remove leading/trailing quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) || 
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    meta[key] = value;
  }

  // Body is everything after the closing ---
  const body = lines.slice(endIdx + 1).join("\n").trim();

  return { meta, body };
}

/**
 * Scans the skills directory for SKILL.md files, parses frontmatter, and returns discovered skills.
 * Skips malformed files with a warning; missing directory is a no-op.
 */
export function discoverSkills(skillsDir: string): SkillMeta[] {
  if (!existsSync(skillsDir)) {
    return [];
  }

  const skills: SkillMeta[] = [];

  try {
    const entries = readdirSync(skillsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillPath = join(skillsDir, entry.name, "SKILL.md");
      if (!existsSync(skillPath)) continue;

      try {
        const content = readFileSync(skillPath, "utf-8");
        const parsed = parseFrontmatter(content);

        if (!parsed) {
          console.warn(
            `[Skills] Malformed frontmatter in ${entry.name}/SKILL.md; skipping.`
          );
          continue;
        }

        const { meta, body } = parsed;

        // Validate required fields. `when-to-use` is optional: explicitly-invoked skills
        // (the repository's own plan/work skills) are addressed by id instead.
        if (!meta.name || !meta.description) {
          console.warn(
            `[Skills] Missing required fields in ${entry.name}/SKILL.md (requires: name, description); skipping.`
          );
          continue;
        }

        skills.push({
          id: entry.name,
          name: meta.name,
          description: meta.description,
          whenToUse: meta["when-to-use"] ?? "",
          body,
          filePath: skillPath,
        });
      } catch (err) {
        console.warn(
          `[Skills] Error reading ${entry.name}/SKILL.md: ${err instanceof Error ? err.message : String(err)}; skipping.`
        );
        continue;
      }
    }
  } catch (err) {
    console.warn(
      `[Skills] Error reading skills directory: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Sort skills by id for deterministic ordering
  skills.sort((a, b) => a.id.localeCompare(b.id));

  return skills;
}

/**
 * Renders a skill index: a human-readable list of skill names and descriptions.
 * Does NOT include the full body text — that is injected separately per-task.
 */
export function renderSkillIndex(metas: SkillMeta[]): string {
  if (metas.length === 0) {
    return "";
  }

  const lines: string[] = [
    "## Available Skills",
    "",
  ];

  for (const meta of metas) {
    lines.push(`- **${meta.name}**: ${meta.description}`);
  }

  lines.push("");
  return lines.join("\n");
}

/**
 * Loads and returns the body of a skill file.
 * Caller is responsible for passing a valid SkillMeta.
 */
export function loadSkillBody(meta: SkillMeta): string {
  try {
    const content = readFileSync(meta.filePath, "utf-8");
    const parsed = parseFrontmatter(content);
    return parsed?.body ?? meta.body;
  } catch {
    // Fallback to cached body if file can't be read
    return meta.body;
  }
}

/** Default cap for a rendered skill bundle, in bytes (~14k tokens at 4 chars/token). */
export const DEFAULT_SKILL_BUNDLE_MAX_BYTES = 56_000;

/** Options for `loadSkillBundle`. */
export interface SkillBundleOptions {
  /**
   * Phase module basenames to append, resolved as `<skillDir>/modules/<name>.md`, in the order
   * given. Omit for the SKILL.md body alone. Modules that do not exist or do not fit the byte
   * budget are reported in `omitted` rather than silently dropped.
   */
  modules?: string[];
  /** Maximum rendered size in bytes (default `DEFAULT_SKILL_BUNDLE_MAX_BYTES`). */
  maxBytes?: number;
}

/** What `loadSkillBundle` produced: the text, plus an honest account of what it left out. */
export interface SkillBundle {
  /** Rendered markdown: SKILL.md body followed by the included phase modules. */
  text: string;
  /** Module names actually included, in the order requested. */
  included: string[];
  /** `{ name, reason }` for every module not included. */
  omitted: { name: string; reason: "missing" | "over-budget" | "read-error" }[];
  /** Bytes in `text`. */
  bytes: number;
}

/**
 * Loads a skill plus selected phase modules as one bounded prompt bundle.
 *
 * Skills are written for a human orchestrator who can open `modules/scope.md` when the pipeline
 * reaches Scope. A single LLM call cannot, so the modules that matter for this call are inlined —
 * and the byte budget keeps that bounded, reporting whatever had to be dropped.
 */
export function loadSkillBundle(
  meta: SkillMeta,
  options: SkillBundleOptions = {}
): SkillBundle {
  const maxBytes = options.maxBytes ?? DEFAULT_SKILL_BUNDLE_MAX_BYTES;
  const skillDir = dirname(meta.filePath);

  const base = loadSkillBody(meta);
  let text = base;
  let bytes = base.length;
  const included: string[] = [];
  const omitted: SkillBundle["omitted"] = [];

  // De-duplicate while preserving the caller's order.
  const requested = [...new Set(options.modules ?? [])];

  for (const name of requested) {
    const modulePath = join(skillDir, "modules", `${name}.md`);
    if (!existsSync(modulePath)) {
      omitted.push({ name, reason: "missing" });
      continue;
    }

    let raw: string;
    try {
      raw = readFileSync(modulePath, "utf-8");
    } catch {
      omitted.push({ name, reason: "read-error" });
      continue;
    }

    const body = parseFrontmatter(raw)?.body ?? raw;
    const section = `\n\n#### Phase module: ${name} (${meta.id}/modules/${name}.md)\n\n${body}`;

    if (bytes + section.length > maxBytes) {
      omitted.push({ name, reason: "over-budget" });
      continue;
    }

    text += section;
    bytes += section.length;
    included.push(name);
  }

  return { text, included, omitted, bytes };
}

/** Find a discovered skill by directory id or frontmatter name (case-insensitive). */
export function findSkill(skills: SkillMeta[], id: string): SkillMeta | undefined {
  const needle = id.toLowerCase();
  return skills.find((s) => s.id.toLowerCase() === needle || s.name.toLowerCase() === needle);
}

/**
 * Injects matching skill bodies into a prompt.
 * Non-destructive: returns a new prompt string with matched skills appended.
 *
 * @param prompt The original prompt text.
 * @param skills All discovered skills.
 * @param shouldInject Predicate: returns true if the skill should be injected into this prompt.
 * @returns The prompt with injected skills, or the original prompt if no matches.
 */
export function injectMatchingSkills(
  prompt: string,
  skills: SkillMeta[],
  shouldInject: (skill: SkillMeta) => boolean
): string {
  const matched = skills.filter(shouldInject);

  if (matched.length === 0) {
    return prompt;
  }

  const injections = matched.map((skill) => {
    const body = loadSkillBody(skill);
    return `### Procedural Skill: ${skill.name}\n\n${body}`;
  });

  return `${prompt}\n\n## Procedural Skills\n\n${injections.join("\n\n")}`;
}
