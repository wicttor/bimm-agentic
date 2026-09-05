import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_EXCLUDE,
  DEFAULT_INCLUDE,
  scaffold,
  type ScaffoldFailure,
  type ScaffoldResult,
  type ScaffoldSuccess,
} from "../src/scaffold.ts";

// Acceptance-Criterion test for task 2026-09-04-001-T04 (Scaffolder: boilerplate copy).
//
// AC under test:
//   Scaffolding copies the app subset (src/, public/, index.html, package.json,
//   tsconfig.json, vite.config.ts, vitest.config.ts) into the output directory, excludes
//   node_modules/, agent/, docs/ and any pre-existing output, and refuses to overwrite a
//   non-empty output directory unless --force is passed.
//
// The reference `src/` is never written to: except for the last suite, every run happens
// against a synthetic fixture root inside os.tmpdir(), so the repository working tree is
// never a test artifact.

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

/** Synthetic boilerplate repo: app subset plus trees that must never be copied. */
const FIXTURE_FILES: Record<string, string> = {
  "src/App.tsx": "export const App = () => null;\n",
  "src/types.ts": "export interface Car { id: string }\n",
  "src/mocks/handlers.ts": "export const handlers = [];\n",
  "public/mockServiceWorker.js": "// worker\n",
  "index.html": "<!doctype html>\n",
  "package.json": '{"name":"fixture","type":"module"}\n',
  "tsconfig.json": '{"compilerOptions":{}}\n',
  "vite.config.ts": "export default {};\n",
  "vitest.config.ts": "export default {};\n",
  "agent/src/index.ts": "// agent code, never copied\n",
  "docs/plans/plan.md": "# plan, never copied\n",
  "node_modules/left-pad/index.js": "// dependency, never copied\n",
  "README.md": "# readme, not in the app subset\n",
  "vite-env.d.ts": "/// <reference types=\"vite/client\" />\n",
};

const tempDirs: string[] = [];

/**
 * The AC's copy subset, spelled out here rather than imported, so the tests assert the
 * contract independently of the constant the implementation happens to use.
 */
const APP_SUBSET_ENTRIES = [
  "src",
  "public",
  "index.html",
  "package.json",
  "tsconfig.json",
  "vite-env.d.ts",
  "vite.config.ts",
  "vitest.config.ts",
];

function makeTempParent(): string {
  const dir = mkdtempSync(join(tmpdir(), "scaffold-"));
  tempDirs.push(dir);
  return dir;
}

/**
 * Build a throwaway repo root that mirrors the boilerplate layout.
 *
 * The root is nested one level below the temp parent on purpose: the ancestor-refusal test passes
 * `dirname(root)` as the output, so that path must be a private disposable directory and never a
 * shared one like `/tmp` itself.
 */
function makeFixtureRoot(): string {
  const root = join(makeTempParent(), "repo");
  mkdirSync(root, { recursive: true });
  for (const [rel, content] of Object.entries(FIXTURE_FILES)) {
    const target = join(root, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, "utf8");
  }
  return root;
}

function writeFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

/**
 * Snapshot every file under `dir` as `relative-path<TAB>content-hash`, sorted.
 *
 * Proves the read-only invariant for the **whole** tree: comparing two named files byte-for-byte
 * cannot notice a scaffold that leaves them intact but writes a new file into `src/`.
 */
function treeSnapshot(dir: string): string[] {
  const lines: string[] = [];
  for (const entry of readdirSync(dir, { recursive: true })) {
    const rel = entry.toString();
    const abs = join(dir, rel);
    if (statSync(abs).isFile()) {
      lines.push(`${rel}	${createHash("sha1").update(readFileSync(abs)).digest("hex")}`);
    }
  }
  return lines.sort();
}

function readFailure(result: ScaffoldResult): ScaffoldFailure {
  if (result.ok) {
    throw new Error(`expected scaffold() to fail, got a successful copy of ${result.copied.length} entries`);
  }
  return result;
}

function readSuccess(result: ScaffoldResult): ScaffoldSuccess {
  if (!result.ok) {
    throw new Error(`expected scaffold() to succeed, got ${result.reason}: ${result.error}`);
  }
  return result;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("scaffold(): fresh copy of the boilerplate app subset", () => {
  it("copies the app subset into an empty output directory", () => {
    const root = makeFixtureRoot();
    const out = join(root, "generated-app");
    mkdirSync(out, { recursive: true });

    const result = scaffold(root, out);

    expect(result.ok).toBe(true);
    for (const entry of APP_SUBSET_ENTRIES) {
      expect(existsSync(join(out, entry)), `${entry} missing from scaffold`).toBe(true);
    }
    expect(readFileSync(join(out, "src/types.ts"), "utf8")).toBe(FIXTURE_FILES["src/types.ts"]);
    expect(readFileSync(join(out, "src/mocks/handlers.ts"), "utf8"), "nested paths preserved").toBe(
      FIXTURE_FILES["src/mocks/handlers.ts"],
    );
  });

  it("copies exactly the app subset: no node_modules, agent, docs, or extras", () => {
    const root = makeFixtureRoot();
    const out = join(root, "generated-app");

    const result = scaffold(root, out);

    expect(result.ok).toBe(true);
    expect(readdirSync(out).sort()).toEqual([...APP_SUBSET_ENTRIES].sort());
    for (const banned of ["node_modules", "agent", "docs", "README.md"]) {
      expect(existsSync(join(out, banned)), `${banned} must never be copied`).toBe(false);
    }
  });

  it("produces a deep copy, not symlinks", () => {
    const root = makeFixtureRoot();
    const out = join(root, "generated-app");

    expect(scaffold(root, out).ok).toBe(true);
    const stat = lstatSync(join(out, "src/App.tsx"));
    expect(stat.isSymbolicLink()).toBe(false);
    expect(stat.isFile()).toBe(true);
  });

  it("reports the copied entries and the file count", () => {
    const root = makeFixtureRoot();
    const out = join(root, "generated-app");

    const success = readSuccess(scaffold(root, out));

    expect(success.outDir).toBe(out);
    expect(success.copied).toEqual([...DEFAULT_INCLUDE]);
    expect(success.fileCount).toBe(10); // 3 app files in src/ + 1 in public/ + 6 root files
  });

  it("treats pre-existing output as a clobber to replace, never a merge target", () => {
    const root = makeFixtureRoot();
    const out = join(root, "generated-app");
    writeFile(join(out, "src/stale.ts"), "// from a previous run\n");
    writeFile(join(out, "node_modules/left-pad/index.js"), "// stale install\n");

    const failure = readFailure(scaffold(root, out));

    expect(failure.reason).toBe("non-empty-output");
    expect(readFileSync(join(out, "src/stale.ts"), "utf8")).toBe("// from a previous run\n");

    const forced = scaffold(root, out, { force: true });
    expect(forced.ok).toBe(true);
    expect(existsSync(join(out, "src/stale.ts")), "pre-existing output replaced, not merged").toBe(false);
    expect(existsSync(join(out, "node_modules")), "pre-existing output replaced, not merged").toBe(false);
    expect(existsSync(join(out, "generated-app")), "output never nests inside itself").toBe(false);
  });
});

describe("scaffold(): clobber guard", () => {
  it("refuses to overwrite a non-empty output directory without force", () => {
    const root = makeFixtureRoot();
    const out = join(root, "generated-app");
    writeFile(join(out, "src/App.tsx"), "// hand-edited by someone\n");

    const failure = readFailure(scaffold(root, out));

    expect(failure.reason).toBe("non-empty-output");
    expect(failure.outDir).toBe(out);
    expect(failure.error).toContain("--force");
    expect(failure.error).toContain("generated-app");
    expect(failure.error).toMatch(/contains: src\b/);
    expect(readdirSync(out), "the refusal left the directory alone").toEqual(["src"]);
    expect(readFileSync(join(out, "src/App.tsx"), "utf8")).toBe("// hand-edited by someone\n");
  });

  it("accepts an output directory that exists but is empty", () => {
    const root = makeFixtureRoot();
    const out = join(root, "generated-app");
    mkdirSync(out, { recursive: true });

    expect(scaffold(root, out).ok).toBe(true);
  });

  it("replaces the output directory when force is set", () => {
    const root = makeFixtureRoot();
    const out = join(root, "generated-app");
    writeFile(join(out, "src/App.tsx"), "// hand-edited by someone\n");
    writeFile(join(out, "notes.txt"), "// stale\n");

    const result = scaffold(root, out, { force: true });

    expect(result.ok).toBe(true);
    expect(readFileSync(join(out, "src/App.tsx"), "utf8")).toBe(FIXTURE_FILES["src/App.tsx"]);
    expect(existsSync(join(out, "notes.txt"))).toBe(false);
    expect(existsSync(join(out, "package.json"))).toBe(true);
  });
});

describe("scaffold(): output-directory safety", () => {
  it("refuses an output directory nested inside a copied source directory", () => {
    const root = makeFixtureRoot();
    const out = join(root, "src", "generated-app");

    expect(readFailure(scaffold(root, out, { force: true })).reason).toBe("invalid-output");
    expect(existsSync(join(root, "src/App.tsx")), "the reference tree survived the refusal").toBe(true);
  });

  it("refuses when the output directory is the repository root itself", () => {
    const root = makeFixtureRoot();

    const failure = readFailure(scaffold(root, root, { force: true }));

    expect(failure.reason).toBe("invalid-output");
    expect(existsSync(join(root, "src/App.tsx")), "nothing was deleted from the source tree").toBe(true);
  });

  it("refuses when the output directory is an ancestor of the repository root", () => {
    const root = makeFixtureRoot();

    expect(readFailure(scaffold(root, dirname(root), { force: true })).reason).toBe("invalid-output");
    expect(existsSync(join(root, "src/App.tsx"))).toBe(true);
  });

  it("reports a missing source entry instead of scaffolding a broken app", () => {
    const root = makeFixtureRoot();
    const out = join(root, "generated-app");
    // Pre-populated so a partial copy is observable: a refusal must not rewrite what is there.
    writeFile(join(out, "stale-marker.txt"), "// untouched by a refused scaffold\n");
    rmSync(join(root, "public"), { recursive: true, force: true });

    const failure = readFailure(scaffold(root, out));

    expect(failure.reason).toBe("missing-source");
    expect(failure.error).toContain("public");
    expect(existsSync(join(out, "src")), "nothing is copied when a source is missing").toBe(false);
    expect(existsSync(join(out, "index.html")), "nothing is copied when a source is missing").toBe(false);
    expect(readFileSync(join(out, "stale-marker.txt"), "utf8")).toBe("// untouched by a refused scaffold\n");
  });

  it("validates sources before replacing, so force never destroys output on a missing source", () => {
    const root = makeFixtureRoot();
    const out = join(root, "generated-app");
    writeFile(join(out, "precious.txt"), "// keep me\n");
    rmSync(join(root, "tsconfig.json"), { force: true });

    const failure = readFailure(scaffold(root, out, { force: true }));

    expect(failure.reason).toBe("missing-source");
    expect(readFileSync(join(out, "precious.txt"), "utf8")).toBe("// keep me\n");
  });

  it("reports a missing later entry too, even when the first entries exist", () => {
    const root = makeFixtureRoot();
    const out = join(root, "generated-app");
    writeFile(join(out, "stale-marker.txt"), "// untouched\n");
    rmSync(join(root, "vitest.config.ts"), { force: true });

    const failure = readFailure(scaffold(root, out));

    expect(failure.reason).toBe("missing-source");
    expect(failure.error).toContain("vitest.config.ts");
    expect(existsSync(join(out, "src")), "all sources are validated before any is copied").toBe(false);
  });
});

describe("scaffold(): configurable include/exclude", () => {
  it("defaults are the AC copy subset and the three never-copied trees", () => {
    expect([...DEFAULT_INCLUDE]).toEqual(APP_SUBSET_ENTRIES);
    expect([...DEFAULT_EXCLUDE]).toEqual(["node_modules", "agent", "docs"]);
  });

  it("applies a custom exclude list at any depth", () => {
    const root = makeFixtureRoot();
    const out = join(root, "generated-app");

    const success = readSuccess(scaffold(root, out, { exclude: [...DEFAULT_EXCLUDE, "mocks"] }));

    expect(existsSync(join(out, "src/App.tsx"))).toBe(true);
    expect(existsSync(join(out, "src/mocks"))).toBe(false);
    expect(success.copied).toEqual([...DEFAULT_INCLUDE]);
  });

  it("honours a custom include list", () => {
    const root = makeFixtureRoot();
    const out = join(root, "generated-app");

    const success = readSuccess(scaffold(root, out, { include: ["src", "index.html"] }));

    expect(existsSync(join(out, "src/types.ts"))).toBe(true);
    expect(existsSync(join(out, "index.html"))).toBe(true);
    expect(existsSync(join(out, "package.json"))).toBe(false);
    expect(success.copied).toEqual(["src", "index.html"]);
  });
});

describe("scaffold(): reference boilerplate stays read-only", () => {
  it("copies the real app subset without modifying the reference tree", () => {
    const appEntry = "src/App.tsx";
    const referenceBefore = readFileSync(join(repoRoot, appEntry));
    const srcBefore = treeSnapshot(join(repoRoot, "src"));
    const out = join(makeTempParent(), "generated-app");

    const result = scaffold(repoRoot, out);

    expect(result.ok).toBe(true);
    expect(existsSync(join(out, "src/types.ts"))).toBe(true);
    expect(existsSync(join(out, "agent"))).toBe(false);
    expect(existsSync(join(out, "docs"))).toBe(false);
    expect(existsSync(join(out, "node_modules"))).toBe(false);
    expect(readFileSync(join(out, appEntry)).equals(referenceBefore), "copied byte-for-byte").toBe(true);
    // The hard invariant: not one file added, removed, or changed anywhere under src/.
    expect(treeSnapshot(join(repoRoot, "src")), "reference src/ never written to").toEqual(srcBefore);
  });

  it("leaves the entire source tree untouched, not just the copied files", () => {
    const root = makeFixtureRoot();
    const before = treeSnapshot(root);
    // Output goes next to the fixture root, never inside it, so any new file under `root` is a
    // stray write by definition rather than the scaffold's own output.
    const out = join(dirname(root), "generated-app");

    expect(scaffold(root, out).ok).toBe(true);

    expect(treeSnapshot(root), "no stray writes and no deletions anywhere in the source tree").toEqual(before);
  });
});
