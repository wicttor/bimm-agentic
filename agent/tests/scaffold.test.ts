import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
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
  "vite.config.ts",
  "vitest.config.ts",
];

function makeTempParent(): string {
  const dir = mkdtempSync(join(tmpdir(), "scaffold-"));
  tempDirs.push(dir);
  return dir;
}

/** Build a throwaway repo root that mirrors the boilerplate layout. */
function makeFixtureRoot(): string {
  const root = makeTempParent();
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

function readFailure(result: ScaffoldResult): ScaffoldFailure {
  if (result.ok) {
    throw new Error(`expected scaffold() to fail, got a successful copy of ${result.copied.length} entries`);
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
    for (const banned of ["node_modules", "agent", "docs", "README.md", "vite-env.d.ts"]) {
      expect(existsSync(join(out, banned)), `${banned} must never be copied`).toBe(false);
    }
  });

  it("produces a deep copy, not symlinks", () => {
    const root = makeFixtureRoot();
    const out = join(root, "generated-app");

    const result = scaffold(root, out, { force: true });

    expect(result.ok).toBe(true);
    const stat = lstatSync(join(out, "src/App.tsx"));
    expect(stat.isSymbolicLink()).toBe(false);
    expect(stat.isFile()).toBe(true);
    expect(readdirSync(out, { recursive: true }).length).toBeGreaterThan(0);
  });

  it("reports the copied entries and the file count", () => {
    const root = makeFixtureRoot();
    const out = join(root, "generated-app");

    const result = scaffold(root, out);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.outDir).toBe(out);
    expect(result.copied).toEqual([...DEFAULT_INCLUDE]);
    expect(result.fileCount).toBe(9); // 3 app files in src/ + 1 in public/ + 5 root files
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
    expect(failure.existing).toContain("src");
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

    const failure = readFailure(scaffold(root, out, { include: ["index.html", "does-not-exist"] }));

    expect(failure.reason).toBe("missing-source");
    expect(failure.error).toContain("does-not-exist");
    expect(existsSync(join(out, "index.html")), "nothing is written when a source is missing").toBe(false);
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

    const result = scaffold(root, out, { exclude: [...DEFAULT_EXCLUDE, "mocks"] });

    expect(result.ok).toBe(true);
    expect(existsSync(join(out, "src/App.tsx"))).toBe(true);
    expect(existsSync(join(out, "src/mocks"))).toBe(false);
    if (result.ok) expect(result.copied).toEqual([...DEFAULT_INCLUDE]);
  });

  it("honours a custom include list", () => {
    const root = makeFixtureRoot();
    const out = join(root, "generated-app");

    const result = scaffold(root, out, { include: ["src", "index.html"] });

    expect(result.ok).toBe(true);
    expect(existsSync(join(out, "src/types.ts"))).toBe(true);
    expect(existsSync(join(out, "index.html"))).toBe(true);
    expect(existsSync(join(out, "package.json"))).toBe(false);
    if (result.ok) expect(result.copied).toEqual(["src", "index.html"]);
  });
});

describe("scaffold(): reference boilerplate stays read-only", () => {
  it("copies the real app subset without modifying the reference tree", () => {
    const appEntry = "src/App.tsx";
    const referenceBefore = readFileSync(join(repoRoot, appEntry));
    const siblingBefore = readFileSync(join(repoRoot, "src/types.ts"));
    const out = join(makeTempParent(), "generated-app");

    const result = scaffold(repoRoot, out);

    expect(result.ok).toBe(true);
    expect(existsSync(join(out, "src/types.ts"))).toBe(true);
    expect(existsSync(join(out, "agent"))).toBe(false);
    expect(existsSync(join(out, "docs"))).toBe(false);
    expect(existsSync(join(out, "node_modules"))).toBe(false);
    const copied = readFileSync(join(out, appEntry));
    expect(copied.equals(referenceBefore), "copied from the reference, byte-for-byte").toBe(true);
    expect(readFileSync(join(repoRoot, appEntry)).equals(referenceBefore), "reference src/ never written").toBe(true);
    expect(readFileSync(join(repoRoot, "src/types.ts")).equals(siblingBefore)).toBe(true);
  });
});
