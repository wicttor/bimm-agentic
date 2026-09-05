// Scaffolder for the agent (task 2026-09-04-001-T04).
//
// Copies the boilerplate **app subset** out of the reference repository into a disposable
// output directory the agent may then mutate. Two invariants drive the design:
//
//   1. The reference tree is read-only. Nothing here ever writes inside `rootDir`, and the copy
//      is built with `statSync`/`copyFileSync`, both of which dereference symlinks — so the
//      output is a deep copy that can be deleted without touching the exemplars.
//   2. The output directory is never merged into. A non-empty output is a clobber-guard failure
//      unless `force` replaces it outright, and an output that sits at or below a copied source
//      path is refused outright, because `force` there would delete reference boilerplate.

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

/** Path segments that must never reach the generated app, at any depth. */
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
}

export type ScaffoldResult = ScaffoldSuccess | ScaffoldFailure;

function fail(reason: ScaffoldFailureReason, outDir: string, error: string): ScaffoldFailure {
  return { ok: false, reason, outDir, error };
}

/** True when `child` is strictly inside `parent` (both absolute, lexically resolved). */
function isWithin(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel !== "" && !isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`);
}

/** `rel` is slash-separated and relative to the root; skip anything under an excluded segment. */
function shouldSkip(rel: string, exclude: ReadonlySet<string>): boolean {
  return rel.split("/").some((segment) => exclude.has(segment));
}

/** Recursive dereferencing copy. Returns the number of files written. */
function copyEntry(src: string, dest: string, rel: string, exclude: ReadonlySet<string>): number {
  if (shouldSkip(rel, exclude)) return 0;
  // statSync follows symlinks, so what lands in the output is always real content, never a
  // pointer back into the reference tree.
  if (statSync(src).isDirectory()) {
    mkdirSync(dest, { recursive: true });
    let written = 0;
    for (const child of readdirSync(src)) {
      written += copyEntry(join(src, child), join(dest, child), `${rel}/${child}`, exclude);
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
 * Refuses — writing nothing — when `outDir` is `rootDir`, an ancestor of it, or at/below a copied
 * source path; when a requested source entry is missing; or when `outDir` is non-empty and `force`
 * is not set. Never writes inside `rootDir`.
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

  // An output at or below a copied source path could be `--force`-deleted out of the reference
  // tree (or copy itself), so it is refused rather than worked around.
  for (const entry of include) {
    const source = join(root, entry);
    if (out === source || isWithin(source, out)) {
      return fail(
        "invalid-output",
        out,
        `cannot scaffold into "${out}": it is inside the source path "${source}", which would ` +
          `overwrite or delete reference boilerplate. Choose an --out outside the copied subset.`,
      );
    }
  }

  for (const entry of include) {
    if (!existsSync(join(root, entry))) {
      return fail(
        "missing-source",
        out,
        `cannot scaffold: required boilerplate path "${entry}" was not found in "${root}". ` +
          `The output directory is not a runnable app without it, so nothing was written.`,
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
    );
  }
  if (existing.length > 0 && options.force) {
    rmSync(out, { recursive: true, force: true });
  }

  const exclude = new Set(options.exclude ?? DEFAULT_EXCLUDE);
  let fileCount = 0;
  for (const entry of include) {
    fileCount += copyEntry(join(root, entry), join(out, entry), entry, exclude);
  }

  return { ok: true, outDir: out, copied: include, fileCount };
}
