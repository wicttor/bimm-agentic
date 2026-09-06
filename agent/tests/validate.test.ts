// AC tests for the validation gate (task 2026-09-04-001-T06).
//
// AC under test: the validator runs `typecheck` and `test` inside the output directory and
// returns `{ tool, file, line, code, message }[]` covering the `noUncheckedIndexedAccess`,
// `noUnusedLocals`, and `noUnusedParameters` failure classes, and reports zero errors for the
// untouched scaffold.
//
// Two of the scenarios are deliberate real-process probes — the clean scaffold, the strict-flag
// fixture and the failing-suite probe below all run the toolchain that actually lives in
// `node_modules`, because a parser validated only against hand-written fixtures proves nothing about
// the seam the repair loop depends on. Everything else injects the `ScriptRunner` seam from the T05
// registry, so the suite otherwise spawns no processes.

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { parseTscOutput } from "../src/parse-tsc.ts";
import { parseVitestOutput } from "../src/parse-vitest.ts";
import { scaffold } from "../src/scaffold.ts";
import { relativeTo, validate, type ValidationError, type ValidationResult } from "../src/validate.ts";
import type { ScriptRunner } from "../src/tools/registry.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const repoNodeModules = join(repoRoot, "node_modules");

const tempDirs: string[] = [];

function makeTempParent(): string {
  const dir = mkdtempSync(join(tmpdir(), "t06-validate-"));
  tempDirs.push(dir);
  return dir;
}

function writeFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

/**
 * Make the directory install-resolvable without an `npm install`.
 *
 * The scaffold deliberately excludes `node_modules`, so a copy is only runnable once the
 * dependencies are reachable from it; a symlink of the repo's own install is the cheapest way to
 * get a real `tsc`/`vitest` run without touching the network.
 */
function linkNodeModules(dir: string): string {
  mkdirSync(dir, { recursive: true });
  symlinkSync(repoNodeModules, join(dir, "node_modules"), "dir");
  return dir;
}

/** A package.json exposing the two script names the validator is allowed to invoke. */
const APP_PACKAGE_JSON =
  '{"name":"generated-app","version":"1.0.0","private":true,"type":"module",' +
  '"scripts":{"typecheck":"tsc --noEmit","test":"vitest run"}}\n';

/** The boilerplate's strictness, spelled out so the emitted codes are the fixtures' own contract. */
const STRICT_TSCONFIG = JSON.stringify({
  compilerOptions: {
    target: "ES2022",
    module: "ESNext",
    moduleResolution: "bundler",
    types: ["node"],
    skipLibCheck: true,
    noEmit: true,
    strict: true,
    noUnusedLocals: true,
    noUnusedParameters: true,
    noUncheckedIndexedAccess: true,
  },
  include: ["src"],
});

/**
 * One file, three strict-flag failures, at known lines:
 * line 2 `noUnusedLocals`, line 3 `noUncheckedIndexedAccess`, line 5 `noUnusedParameters`.
 */
const STRICT_SOURCE = [
  "export function pick(arr: string[], i: number): string {",
  "  const unused = 1;",
  "  return arr[i];",
  "}",
  "export function alwaysZero(value: number): number {",
  "  return 0;",
  "}",
  "",
].join("\n");

/** Runner double: records every script and cwd, replays canned output per script. */
function fakeRunner(
  outcomes: Partial<Record<string, Partial<{ exitCode: number; stdout: string; stderr: string }>>>,
): { runScript: ScriptRunner; invocations: { script: string; cwd: string }[] } {
  const invocations: { script: string; cwd: string }[] = [];
  const runScript: ScriptRunner = async (script, opts) => {
    invocations.push({ script, cwd: opts.cwd });
    const outcome = outcomes[script] ?? {};
    return {
      exitCode: outcome.exitCode ?? 0,
      stdout: outcome.stdout ?? "",
      stderr: outcome.stderr ?? "",
    };
  };
  return { runScript, invocations };
}

// --- fixtures recorded from real tool runs (vitest 3 / typescript 5.7, 2026-09-05) -----------

const VITEST_JSON_BANNER =
  "\n> generated-app@1.0.0 test\n> vitest run --reporter=json\n\n";

const VITEST_FAILURE_JSON = `${VITEST_JSON_BANNER}${JSON.stringify({
  numTotalTestSuites: 1,
  numPassedTestSuites: 0,
  numFailedTestSuites: 1,
  numPendingTestSuites: 0,
  numTotalTests: 1,
  numPassedTests: 0,
  numFailedTests: 1,
  numPendingTests: 0,
  numTodoTests: 0,
  startTime: 1789000000000,
  success: false,
  testResults: [
    {
      name: "/generated-app/src/__tests__/pick.test.ts",
      status: "failed",
      message: "",
      startTime: 1789000000100,
      endTime: 1789000000600,
      assertionResults: [
        {
          ancestorTitles: ["pick"],
          fullName: "pick returns the first element",
          title: "returns the first element",
          status: "failed",
          duration: 4.2,
          failureMessages: [
            "AssertionError: expected 1 to be 2 // Object.is equality\n" +
              "    at /generated-app/src/__tests__/pick.test.ts:6:24\n" +
              "    at file:///generated-app/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11\n" +
              "    at processTicksAndRejections (node:internal/process/task_queues:105:5)",
          ],
        },
      ],
    },
  ],
})}`;

/** A suite that never collected: the failure lives on the suite, not on an assertion. */
const VITEST_SUITE_ERROR_JSON = `${VITEST_JSON_BANNER}${JSON.stringify({
  numTotalTestSuites: 1,
  numFailedTestSuites: 1,
  numTotalTests: 0,
  numFailedTests: 0,
  startTime: 1789000000000,
  success: false,
  testResults: [
    {
      name: "/generated-app/src/__tests__/broken.test.ts",
      status: "failed",
      message:
        "Cannot find module './nope-module.ts' imported from '/generated-app/src/__tests__/broken.test.ts'",
      assertionResults: [],
    },
  ],
})}`;

const VITEST_CLEAN_JSON = `${VITEST_JSON_BANNER}${JSON.stringify({
  numTotalTestSuites: 1,
  numFailedTestSuites: 0,
  numTotalTests: 2,
  numPassedTests: 2,
  numFailedTests: 0,
  startTime: 1789000000000,
  success: true,
  testResults: [],
})}`;

/**
 * A report for a real assertion failure, with the suite and stack frame under `root`.
 *
 * `validate()` normalizes against the output directory it was given, so anything driven through
 * the validator has to quote paths under that directory — as a real vitest run does — rather than
 * the fixed `/generated-app` used by the parser's own unit tests.
 */
function vitestFailureReport(root: string): string {
  const suite = join(root, "src", "__tests__", "pick.test.ts");
  return `${VITEST_JSON_BANNER}${JSON.stringify({
    numTotalTestSuites: 1,
    numFailedTestSuites: 1,
    numTotalTests: 1,
    numPassedTests: 0,
    numFailedTests: 1,
    success: false,
    testResults: [
      {
        name: suite,
        status: "failed",
        message: "",
        assertionResults: [
          {
            ancestorTitles: ["pick"],
            fullName: "pick returns the first element",
            title: "returns the first element",
            status: "failed",
            duration: 4.2,
            failureMessages: [
              `AssertionError: expected 1 to be 2 // Object.is equality\n` +
                `    at ${suite}:6:24\n` +
                `    at file://${join(root, "node_modules", "@vitest/runner/dist/chunk-hooks.js")}:155:11\n` +
                `    at processTicksAndRejections (node:internal/process/task_queues:105:5)`,
            ],
          },
        ],
      },
    ],
  })}`;
}

/** A report for a suite that failed to load, under `root`. */
function vitestSuiteErrorReport(root: string): string {
  const suite = join(root, "src", "__tests__", "broken.test.ts");
  return `${VITEST_JSON_BANNER}${JSON.stringify({
    numTotalTestSuites: 1,
    numFailedTestSuites: 1,
    numTotalTests: 0,
    numFailedTests: 0,
    success: false,
    testResults: [
      {
        name: suite,
        status: "failed",
        message: `Cannot find module './nope-module.ts' imported from '${suite}'`,
        assertionResults: [],
      },
    ],
  })}`;
}

/** What `tsc --pretty false` emits: an npm banner, one line per diagnostic, indented continuations. */
const TSC_DIAGNOSTICS = [
  "",
  "> generated-app@1.0.0 typecheck",
  "> tsc --noEmit --pretty false",
  "",
  "src/bad.ts(2,9): error TS6133: 'unused' is declared but its value is never read.",
  "src/bad.ts(3,3): error TS2322: Type 'string | undefined' is not assignable to type 'string'.",
  "  Type 'undefined' is not assignable to type 'string'.",
  "src/bad.ts(5,41): error TS6133: 'value' is declared but its value is never read.",
  "",
].join("\n");

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("validate(): the untouched scaffold is clean", () => {
  it(
    "runs typecheck and test in a real scaffolded copy and reports zero errors",
    async () => {
      const out = join(makeTempParent(), "generated-app");
      const scaffolded = scaffold(repoRoot, out);
      if (!scaffolded.ok) {
        throw new Error(`scaffold() refused to build the clean fixture: ${scaffolded.error}`);
      }
      linkNodeModules(out);

      const result = await validate({ outDir: out });

      // `error` first: a validator that could not run reports clean output too, so this is the
      // assertion that distinguishes "no errors" from "no measurement".
      expect(result.error, `validator could not run: ${result.error}`).toBeNull();
      expect(result.errors, JSON.stringify(result.errors, null, 2)).toEqual([]);
      expect(result.ok).toBe(true);
    },
    180_000,
  );
});

describe("validate(): real compiler output for the three strict-flag classes", () => {
  it(
    "maps noUncheckedIndexedAccess, noUnusedLocals and noUnusedParameters to per-file errors",
    async () => {
      const out = linkNodeModules(join(makeTempParent(), "generated-app"));
      writeFile(join(out, "package.json"), APP_PACKAGE_JSON);
      writeFile(join(out, "tsconfig.json"), STRICT_TSCONFIG);
      writeFile(join(out, "src/bad.ts"), STRICT_SOURCE);

      const result = await validate({ outDir: out });

      expect(result.ok).toBe(false);
      expect(result.error).toBeNull();
      const typecheck = result.errors.filter((error) => error.tool === "typecheck");
      expect(
        typecheck.map((error) => [error.file, error.line, error.code]).sort(),
        JSON.stringify(typecheck, null, 2),
      ).toEqual([
        ["src/bad.ts", 2, "TS6133"],
        ["src/bad.ts", 3, "TS2322"],
        ["src/bad.ts", 5, "TS6133"],
      ]);
      expect(typecheck.every((error) => error.message.length > 0)).toBe(true);
      const messages = typecheck.map((error) => error.message).join("\n");
      expect(messages).toContain("string | undefined");
      expect(messages.match(/is declared but its value is never read/g)).toHaveLength(2);
    },
    180_000,
  );

  it(
    "reports project-relative files, never paths that leak the output directory",
    async () => {
      const out = linkNodeModules(join(makeTempParent(), "generated-app"));
      writeFile(join(out, "package.json"), APP_PACKAGE_JSON);
      writeFile(join(out, "tsconfig.json"), STRICT_TSCONFIG);
      writeFile(join(out, "src/nested/deep.ts"), STRICT_SOURCE);

      const result = await validate({ outDir: out });
      const files = result.errors
        .filter((error) => error.tool === "typecheck")
        .map((error) => error.file);

      // The untouched scaffold carries no tests, so the only test-tool error allowed here is the
      // one that says so — and nothing may leak the absolute output path.
      const testErrors = result.errors.filter((error) => error.tool === "test");
      expect(testErrors.map((error) => error.code)).toEqual(["NO_TESTS_COLLECTED"]);
      // Three diagnostics, all attributed to exactly one project-relative file.
      expect(files).toHaveLength(3);
      expect([...new Set(files)]).toEqual(["src/nested/deep.ts"]);
      for (const error of result.errors) {
        expect(error.file.startsWith("/")).toBe(false);
        expect(`${error.file} ${error.message}`, "no absolute output path in an error").not.toContain(out);
      }
      for (const file of files) {
        expect(file.startsWith("/")).toBe(false);
        expect(file).not.toContain(out);
      }
    },
    180_000,
  );
});

describe("validate(): test failures reach the repair loop", () => {
  it("maps a failing assertion to its test file and assertion message", async () => {
    const out = linkNodeModules(join(makeTempParent(), "generated-app"));
    const { runScript } = fakeRunner({
      test: { exitCode: 1, stdout: vitestFailureReport(out) },
    });

    const result = await validate({ outDir: out, runScript });

    const failures = result.errors.filter((error) => error.tool === "test");
    expect(failures).toHaveLength(1);
    const [failure] = failures;
    if (!failure) throw new Error("unreachable");
    expect(failure.file).toBe("src/__tests__/pick.test.ts");
    expect(failure.line).toBe(6);
    expect(failure.code).toBe("ASSERTION_FAILED");
    expect(failure.message).toContain("expected 1 to be 2");
    expect(failure.message).not.toContain("chunk-hooks.js");
    expect(result.ok).toBe(false);
  });

  it("maps a suite that failed to collect to its file and load error", async () => {
    const out = linkNodeModules(join(makeTempParent(), "generated-app"));
    const { runScript } = fakeRunner({
      test: { exitCode: 1, stdout: vitestSuiteErrorReport(out) },
    });

    const result = await validate({ outDir: out, runScript });

    const failures = result.errors.filter((error) => error.tool === "test");
    expect(failures).toHaveLength(1);
    const [failure] = failures;
    if (!failure) throw new Error("unreachable");
    expect(failure.file).toBe("src/__tests__/broken.test.ts");
    expect(failure.code).toBe("SUITE_ERROR");
    expect(failure.message).toContain("Cannot find module");
    expect(failure.line).toBeNull();
  });

  it(
    "maps a genuinely failing vitest run in a scaffolded copy, not just a captured report",
    async () => {
      // The fixture-driven cases above pin the parser against a recorded report; this one proves
      // the report was recorded truthfully — same command, same flags, same real process. A
      // fixture that drifted from vitest's actual output would pass the parser tests and still
      // starve the repair loop.
      const out = join(makeTempParent(), "generated-app");
      const scaffolded = scaffold(repoRoot, out);
      if (!scaffolded.ok) {
        throw new Error(`scaffold() refused to build the failing fixture: ${scaffolded.error}`);
      }
      linkNodeModules(out);
      writeFile(
        join(out, "src/__tests__/DeliberatelyBroken.test.tsx"),
        'import { describe, expect, it } from "vitest";\n' +
          'describe("broken", () => {\n' +
          '  it("fails on purpose", () => {\n' +
          "    expect(1).toBe(2);\n" +
          "  });\n" +
          "});\n",
      );

      const result = await validate({ outDir: out });

      expect(result.error).toBeNull();
      expect(result.ok).toBe(false);
      // The added file is type-clean, so the app's own two tests still pass and the only errors
      // are the one real assertion failure.
      expect(
        result.errors,
        JSON.stringify(result.errors, null, 2),
      ).toEqual([
        {
          tool: "test",
          file: "src/__tests__/DeliberatelyBroken.test.tsx",
          line: 4,
          code: "ASSERTION_FAILED",
          message: "broken fails on purpose: AssertionError: expected 1 to be 2 // Object.is equality",
        },
      ]);
    },
    180_000,
  );
});

describe("validate(): the gate runs the two allow-listed scripts in the output directory", () => {
  it("invokes typecheck then test with cwd set to the output directory", async () => {
    const out = linkNodeModules(join(makeTempParent(), "generated-app"));
    const { runScript, invocations } = fakeRunner({
      test: { stdout: VITEST_CLEAN_JSON },
    });

    const result = await validate({ outDir: out, runScript });

    expect(invocations).toEqual([
      { script: "typecheck", cwd: out },
      { script: "test", cwd: out },
    ]);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("refuses to run anything the tool registry does not allow-list", async () => {
    const out = linkNodeModules(join(makeTempParent(), "generated-app"));
    const { runScript, invocations } = fakeRunner({});

    const result = await validate({ outDir: out, runScript, allowedScripts: ["build"] });

    // Rejected by `run_command` before the executor was ever reached — the sandbox still owns
    // what runs, and a validator that could not measure says so instead of reporting success.
    expect(invocations).toEqual([]);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("command_not_allowed");
    expect(result.error).toContain("typecheck");
  });

  it("surfaces typecheck diagnostics and test failures together, typecheck first", async () => {
    const out = linkNodeModules(join(makeTempParent(), "generated-app"));
    const { runScript } = fakeRunner({
      typecheck: { exitCode: 2, stdout: TSC_DIAGNOSTICS },
      test: { exitCode: 1, stdout: vitestFailureReport(out) },
    });

    const result = await validate({ outDir: out, runScript });

    expect(result.errors.map((error) => error.tool)).toEqual([
      "typecheck",
      "typecheck",
      "typecheck",
      "test",
    ]);
    expect(result.ok).toBe(false);
  });
});

describe("validate(): a broken measurement is never a false green", () => {
  it("reports an actionable dependency error instead of a stack trace", async () => {
    const out = join(makeTempParent(), "generated-app");
    writeFile(join(out, "package.json"), APP_PACKAGE_JSON);
    writeFile(join(out, "src/bad.ts"), STRICT_SOURCE);
    const { runScript, invocations } = fakeRunner({});

    const result = await validate({ outDir: out, runScript });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([]);
    expect(result.error).toContain("npm install");
    expect(result.error).toContain(out);
    expect(result.error).not.toMatch(/^\s+at\s/m);
    expect(invocations).toEqual([]);
  });

  it("reports unparseable test output rather than zero errors", async () => {
    const out = linkNodeModules(join(makeTempParent(), "generated-app"));
    const { runScript } = fakeRunner({
      test: { exitCode: 1, stdout: `${VITEST_JSON_BANNER}not json at all`, stderr: "boom" },
    });

    const result = await validate({ outDir: out, runScript });

    const [failure] = result.errors;
    if (!failure) throw new Error("unparseable vitest output must produce an error");
    expect(failure.tool).toBe("test");
    expect(failure.code).toBe("UNPARSEABLE_REPORT");
    expect(failure.message).toContain("not json at all");
    expect(result.ok).toBe(false);
  });

  it("reports a test run that collected no tests", async () => {
    const out = linkNodeModules(join(makeTempParent(), "generated-app"));
    const { runScript } = fakeRunner({
      test: {
        stdout: VITEST_JSON_BANNER + JSON.stringify({ numTotalTests: 0, testResults: [] }),
      },
    });

    const result = await validate({ outDir: out, runScript });

    const [failure] = result.errors;
    if (!failure) throw new Error("a run with zero tests must not read as clean");
    expect(failure.code).toBe("NO_TESTS_COLLECTED");
    expect(failure.tool).toBe("test");
    expect(result.ok).toBe(false);
  });

  it("reports a script that failed without parseable diagnostics", async () => {
    const out = linkNodeModules(join(makeTempParent(), "generated-app"));
    const { runScript } = fakeRunner({
      typecheck: {
        exitCode: 1,
        stderr: "error TS5083: Cannot read file '/generated-app/tsconfig.json'.",
      },
    });

    const result = await validate({ outDir: out, runScript });

    const [failure] = result.errors;
    if (!failure) throw new Error("a nonzero exit with no parsed errors must not read as clean");
    expect(failure.tool).toBe("typecheck");
    expect(failure.code).toBe("UNPARSEABLE_REPORT");
    expect(failure.message).toContain("TS5083");
    expect(result.ok).toBe(false);
  });
});

describe("parseTscOutput()", () => {
  it("parses diagnostics and drops banners, continuation lines and summaries", () => {
    const errors = parseTscOutput(TSC_DIAGNOSTICS, relativeTo("/generated-app"));
    expect(errors.map((error) => [error.file, error.line, error.code])).toEqual([
      ["src/bad.ts", 2, "TS6133"],
      ["src/bad.ts", 3, "TS2322"],
      ["src/bad.ts", 5, "TS6133"],
    ]);
    expect(errors.every((error) => error.tool === "typecheck")).toBe(true);
  });

  it("keeps the message of a multi-line diagnostic to its first line", () => {
    const errors = parseTscOutput(TSC_DIAGNOSTICS, relativeTo("/generated-app"));
    const typeError = errors.find((error) => error.code === "TS2322");
    if (!typeError) throw new Error("expected a TS2322 diagnostic");
    expect(typeError.message).toBe(
      "Type 'string | undefined' is not assignable to type 'string'.",
    );
  });

  it("returns no errors for empty and noise-only output", () => {
    expect(parseTscOutput("", relativeTo("/generated-app"))).toEqual([]);
    expect(parseTscOutput("   \n\n", relativeTo())).toEqual([]);
    expect(
      parseTscOutput("> generated-app@1.0.0 typecheck\n> tsc --noEmit\n\n", relativeTo()),
    ).toEqual([]);
  });

  it("normalizes absolute and ./ prefixed paths to project-relative", () => {
    expect(
      parseTscOutput("/generated-app/src/App.tsx(1,7): error TS6133: 'a' is never read.", relativeTo("/generated-app"))
        .map((error) => error.file),
    ).toEqual(["src/App.tsx"]);
    expect(
      parseTscOutput("./src/App.tsx(1,7): error TS6133: 'a' is never read.", relativeTo("/generated-app"))
        .map((error) => error.file),
    ).toEqual(["src/App.tsx"]);
  });

  it("survives malformed lines without coordinates or codes", () => {
    const errors = parseTscOutput(
      [
        "src/bad.ts: error TS6133: no coordinates here.",
        "src/bad.ts(9,1): error not-a-code.",
        "src/bad.ts(9,1): warning TS6133: not an error.",
        "src/ok.ts(9,1): error TS2304: Cannot find name 'x'.",
      ].join("\n"),
      relativeTo(),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]?.line).toBe(9);
  });
});

describe("parseVitestOutput()", () => {
  it("parses a failing assertion out of banner-prefixed JSON", () => {
    const errors = parseVitestOutput(VITEST_FAILURE_JSON, relativeTo("/generated-app"));
    expect(errors).toEqual<ValidationError[]>([
      {
        tool: "test",
        file: "src/__tests__/pick.test.ts",
        line: 6,
        code: "ASSERTION_FAILED",
        message: "pick returns the first element: AssertionError: expected 1 to be 2 // Object.is equality",
      },
    ]);
  });

  it("reports a suite-level failure with no assertion results", () => {
    const errors = parseVitestOutput(VITEST_SUITE_ERROR_JSON, relativeTo("/generated-app"));
    expect(errors).toHaveLength(1);
    expect(errors[0]?.file).toBe("src/__tests__/broken.test.ts");
    expect(errors[0]?.code).toBe("SUITE_ERROR");
    expect(errors[0]?.line).toBeNull();
  });

  it("reports no errors for a green report", () => {
    expect(parseVitestOutput(VITEST_CLEAN_JSON, relativeTo("/generated-app"))).toEqual([]);
  });

  it("reports unparseable, empty and non-object output as one error", () => {
    for (const output of ["", "   ", "not json at all", "[1,2,3]", "null"]) {
      const errors = parseVitestOutput(output, relativeTo("/generated-app"));
      expect(errors, `output: ${JSON.stringify(output)}`).toHaveLength(1);
      expect(errors[0]?.code).toBe("UNPARSEABLE_REPORT");
    }
  });

  it("reports a report that lost its testResults array", () => {
    const errors = parseVitestOutput('{"numTotalTests":3,"numFailedTests":1}', relativeTo("/generated-app"));
    expect(errors).toHaveLength(1);
    expect(errors[0]?.code).toBe("UNPARSEABLE_REPORT");
  });

  it("ignores skipped and passing assertions and missing fields", () => {
    const errors = parseVitestOutput(
      JSON.stringify({
        numTotalTests: 3,
        numFailedTests: 0,
        testResults: [
          {
            name: "/generated-app/src/a.test.ts",
            assertionResults: [
              { fullName: "a passes", status: "passed" },
              { fullName: "a skipped", status: "pending" },
              { fullName: "a todo" },
              "garbage entry",
            ],
          },
          null,
          { name: "/generated-app/src/b.test.ts" },
        ],
      }),
      relativeTo("/generated-app"),
    );
    expect(errors).toEqual([]);
  });

  it("reports failures the summary claims but the report does not contain", () => {
    const errors = parseVitestOutput(
      JSON.stringify({ numTotalTests: 2, numFailedTests: 2, testResults: [] }),
      relativeTo("/generated-app"),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]?.code).toBe("UNPARSEABLE_REPORT");
  });

  it("normalizes an absolute suite name to a project-relative file", () => {
    const errors = parseVitestOutput(VITEST_FAILURE_JSON, relativeTo());
    expect(errors[0]?.file).toBe("/generated-app/src/__tests__/pick.test.ts");
  });
});

describe("ValidationResult shape", () => {
  it("carries exactly the AC's error fields", async () => {
    const out = linkNodeModules(join(makeTempParent(), "generated-app"));
    const { runScript } = fakeRunner({ typecheck: { exitCode: 2, stdout: TSC_DIAGNOSTICS } });

    const result: ValidationResult = await validate({ outDir: out, runScript });

    const [error] = result.errors;
    if (!error) throw new Error("expected diagnostics");
    expect(Object.keys(error).sort()).toEqual([
      "code",
      "file",
      "line",
      "message",
      "tool",
    ]);
    expect(typeof error.message).toBe("string");
    expect(["typecheck", "test"]).toContain(error.tool);
  });
});
