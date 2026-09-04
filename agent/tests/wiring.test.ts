import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

// Wiring guard for the `agent/` sub-project (task 2026-09-04-001-T01).
//
// Acceptance Criterion under test:
//   `npm run typecheck` compiles only the app (`src/`), `npm run agent:typecheck` compiles only
//   `agent/`, and agent tests execute in a **node** environment that is never swept into the app's
//   jsdom project.
//
// These assertions are behavioural: they run the real npm scripts and inspect what the real
// vitest/tsc configs do, rather than pattern-matching config text into a tautology.

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

const PROBE_REL = "agent/src/__type_error_probe__.ts";
const PROBE_ABS = resolve(repoRoot, PROBE_REL);
const PROBE_SOURCE =
  "// Intentional compile error used only to prove agent/app typecheck isolation.\n" +
  "export const broken: number = \"this string is not a number\";\n";

interface CmdResult {
  code: number;
  output: string;
}

function run(cmd: string, cwd: string = repoRoot): CmdResult {
  try {
    const stdout = execSync(cmd, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, output: stdout };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return {
      code: typeof e.status === "number" ? e.status : 1,
      output: `${e.stdout ?? ""}${e.stderr ?? ""}`,
    };
  }
}

function removeProbe(): void {
  rmSync(PROBE_ABS, { force: true });
  // Leave no orphan directories behind from the probe write.
  const probeDir = dirname(PROBE_ABS);
  if (existsSync(probeDir) && readdirSync(probeDir).length === 0) {
    rmSync(probeDir, { recursive: true, force: true });
  }
}

afterAll(removeProbe);

describe("root vitest project does not collect agent tests", () => {
  it("pins root vitest include to the app tree", () => {
    const rootConfig = readFileSync(resolve(repoRoot, "vitest.config.ts"), "utf8");
    const includeMatch = /include\s*:\s*\[([^\]]*)\]/.exec(rootConfig);
    expect(includeMatch, "root vitest.config.ts must declare an explicit test.include").not.toBeNull();
    const patterns = includeMatch![1];
    expect(patterns, "root vitest include must be scoped to src/**").toMatch(/src\/\*\*/);
    expect(patterns, "root vitest include must not reference agent/").not.toMatch(/agent/);
  });

  it("excludes agent test files from the default (app) collection", () => {
    // `vitest list` resolves the project's collected files without executing them.
    const { code, output } = run("npx vitest list --reporter=json", repoRoot);
    expect(code, `vitest list should succeed (output:\n${output})`).toBe(0);
    expect(output, "the app's default test collection must not include agent tests").not.toMatch(
      /agent[\\/][^\s"]*\.test\.tsx?/,
    );
  });
});

describe("agent tests run in a node environment", () => {
  it("has no DOM globals while executing an agent test", () => {
    // This very file lives under agent/**; if the jsdom app project were collecting it,
    // `window`/`document` would exist here. Indexed via a loose record so the assertion
    // type-checks under the agent tsconfig (which has no DOM lib).
    const g = globalThis as Record<string, unknown>;
    expect(g.window, "agent tests must not run under jsdom").toBeUndefined();
    expect(g.document, "agent tests must not run under jsdom").toBeUndefined();
  });

  it("declares a node-environment agent vitest project scoped to agent tests", () => {
    const agentConfigPath = resolve(repoRoot, "agent/vitest.config.ts");
    expect(existsSync(agentConfigPath), "agent/vitest.config.ts must exist").toBe(true);
    const agentConfig = readFileSync(agentConfigPath, "utf8");
    expect(agentConfig, "agent vitest project must use the node environment").toMatch(/environment\s*:\s*["']node["']/);
    expect(agentConfig, "agent vitest project must collect agent/** tests").toMatch(/agent\/[\s\S]*\*\*/);
  });
});

describe("agent and app typechecking are isolated", () => {
  it("passes cleanly before the probe is introduced", () => {
    removeProbe();
    const { code: appCode, output: appOut } = run("npm run typecheck", repoRoot);
    expect(appCode, `baseline npm run typecheck should pass:\n${appOut}`).toBe(0);
    const { code: agentCode, output: agentOut } = run("npm run agent:typecheck", repoRoot);
    expect(agentCode, `baseline npm run agent:typecheck should pass:\n${agentOut}`).toBe(0);
  });

  it("fails agent:typecheck on an agent type error while app typecheck still passes", () => {
    mkdirSync(dirname(PROBE_ABS), { recursive: true });
    writeFileSync(PROBE_ABS, PROBE_SOURCE, "utf8");
    try {
      const { code: agentCode, output: agentOut } = run("npm run agent:typecheck", repoRoot);
      expect(agentCode, "agent:typecheck must fail on an agent/ type error").not.toBe(0);
      expect(agentOut, "agent:typecheck failure should point at the probe file").toMatch(/__type_error_probe__/);

      const { code: appCode, output: appOut } = run("npm run typecheck", repoRoot);
      expect(appCode, `app typecheck must stay green when agent/ has an error:\n${appOut}`).toBe(0);
    } finally {
      removeProbe();
    }
  });
});
