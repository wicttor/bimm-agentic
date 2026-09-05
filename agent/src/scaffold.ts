// Scaffolder for the agent (task 2026-09-04-001-T04).
//
// Copies the boilerplate **app subset** out of the reference repository into a disposable
// output directory the agent may then mutate. Two invariants drive the design:
//
//   1. The reference tree is read-only. Nothing here ever writes inside `rootDir`; the copy is
//      built with `copyFileSync`/`statSync`, both of which dereference symlinks, so the output
//      is a deep copy that can be deleted without touching the exemplars.
//   2. The output directory is never merged into. A non-empty output is a clobber guard failure
//      unless `force` replaces it outright, and the output path is excluded from the copy so a
//      nested output can never be copied into itself.

import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/** The app subset that makes a scaffolded copy runnable on its own. */
export const DEFAULT_INCLUDE = [
  "src",
  "public",
  "index.html",
  "package.json",
  "tsconfig.json",
  "vite.config.ts",
  "vitest.config.ts",
] as const;

/** Trees that must never reach the generated app, at any depth. */
export const DEFAULT_EXCLUDE = ["node_modules", "agent", "docs"] as const;

export interface ScaffoldOptions {
  /** Replace a non-empty output directory instead of refusing (the `--force` escape hatch). */
  force?: boolean;
  /** Repo-relative entries to copy; defaults to the boilerplate app subset. */
  include?: readonly string[];
  /** Path segments never copied, at any depth; defaults to `DEFAULT_EXCLUDE`. */
  exclude?: readonly string[];
}

export type ScaffoldFailureReason = "invalid-output" | "non-empty-output" | "missing-source";

export interface ScaffoldSuccess {
  ok: true;
  /** Absolute path of the output directory. */
  outDir: string;
  /** Entries that were copied, in `include` order. */
  copied: string[];
  /** Number of files written into the output directory. */
  fileCount: number;
}

export interface ScaffoldFailure {
  ok: false;
  reason: ScaffoldFailureReason;
  outDir: string;
  /** CLI-printable message naming the offending path and, where relevant, the escape hatch. */
  error: string;
  /** For `non-empty-output`: the entries already living in the output directory. */
  existing?: string[];
}

export type ScaffoldResult = ScaffoldSuccess | ScaffoldFailure;

interface CopyRules {
  exclude: ReadonlySet<string>;
  /** Path of the output directory relative to the root, or `null` when it lives outside the root. */
  outRel: string | null;
}

function fail(reason: ScaffoldFailureReason, outDir: string, error: string, existing?: string[]): ScaffoldFailure {
  return existing === undefined
    ? { ok: false, reason, outDir, error }
    : { ok: false, reason, outDir, error, existing };
}

/** True when `child` is strictly inside `parent` (both absolute, lexically resolved). */
function isWithin(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel !== "" && !isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`);
}

/** `rel` is slash-separated and relative to the root; skip excluded segments and the output itself. */
function shouldSkip(rel: string, rules: CopyRules): boolean {
  if (rel.split("/").some((segment) => rules.exclude.has(segment))) return true;
  if (rules.outRel === null) return false;
  return rel === rules.outRel || rel.startsWith(`${rules.outRel}/`);
}

/** Recursive dereferencing copy. Returns the number of files written. */
function copyEntry(src: string, dest: string, rel: string, rules: CopyRules): number {
  if (shouldSkip(rel, rules)) return 0;
  // statSync follows symlinks: what lands in the output is always real content, never a pointer
  // back into the reference tree.
  if (statSync(src).isDirectory()) {
    mkdirSync(dest, { recursive: true });
    let written = 0;
    for (const child of readdirSync(src)) {
      written += copyEntry(join(src, child), join(dest, child), `${rel}/${child}`, rules);
    }
    return written;
  }
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  return 1;
}

/**
 * Copy the boilerplate app subset from `rootDir` into `outDir`.
 *
 * Refuses (without writing anything) when `outDir` is `rootDir` or an ancestor of it, when a
 * requested source entry is missing, or when `outDir` is non-empty and `force` is not set.
 * Never writes inside `rootDir`.
 */
export function scaffold(
  rootDir: string,
  outDir: string,
  options: ScaffoldOptions = {},
): ScaffoldResult {
  const root = resolve(rootDir);
  const out = resolve(outDir);
  const include = [...(options.include ?? DEFAULT_INCLUDE)];

  if (out === root || isWithin(out, root)) {
    return fail(
      "invalid-output",
      out,
      `cannot scaffold into "${out}": it is the project root itself or an ancestor of it, ` +
        `so the reference boilerplate would be destroyed. Choose a separate --out directory.`,
    );
  }

  const rules: CopyRules = {
    exclude: new Set(options.exclude ?? DEFAULT_EXCLUDE),
    outRel: isWithin(root, out) ? relative(root, out).split(sep).join("/") : null,
  };

  for (const entry of include) {
    if (!existsSync(join(root, entry))) {
      return fail(
        "missing-source",
        out,
        `cannot scaffold: required boilerplate path "${entry}" was not found in "${root}". ` +
          `Point --root at the boilerplate repository. Nothing was written.`,
      );
    }
  }

  const existing = existsSync(out) ? readdirSync(out).sort() : [];
  if (existing.length > 0 && !options.force) {
    return fail(
      "non-empty-output",
      out,
      `output directory "${out}" is not empty (contains: ${existing.join(", ")}). ` +
        `Refusing to overwrite it; pass --force to replace its contents. Nothing was written.`,
      existing,
    );
  }
  if (existing.length > 0 && options.force) {
    rmSync(out, { recursive: true, force: true });
  }

  let fileCount = 0;
  for (const entry of include) {
    fileCount += copyEntry(join(root, entry), join(out, entry), entry, rules);
  }

  return { ok: true, outDir: out, copied: include, fileCount };
}
