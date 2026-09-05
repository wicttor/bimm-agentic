// Validation gate for the agent (task 2026-09-04-001-T06).
//
// The repair loop acts on exactly what this module returns, so its contract is stronger than
// "collect the errors": every way a measurement can silently fail to happen has to come back as a
// visible error. Four rules shape the design:
//
//   1. Commands run through the T05 `run_command` tool, never through `child_process` directly, so
//      the allow-list keeps owning what executes inside the output directory. The machine-readable
//      flags (`--pretty false`, `--reporter=json`) are appended by the executor seam, not by the
//      model: `run_command` normalizes to a bare npm script name and rejects arguments by design.
//   2. A non-zero exit that yields nothing parseable is itself an error. Otherwise a crashing `tsc`
//      or a vitest run that printed nothing reads as a clean bill of health and the loop stops
//      before the app works.
//   3. Every error carries a project-relative path, because the repair loop hands it back to a
//      model whose file tools are confined to the output directory. That normalization lives here,
//      once, and is injected into both parsers — the two tools disagree about path shapes (tsc
//      reports paths relative to its own root, vitest reports absolute ones), but the contract on
//      `ValidationError.file` must not.
//   4. The strict flags are never named here. `tsc` reads the output directory's own
//      `tsconfig.json`; the parsers report whatever it emits.
//
// The tool names and the npm script names are deliberately the same strings, so there is no
// mapping table between them to drift.

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { parseTscOutput } from "./parse-tsc.ts";
import { parseVitestOutput } from "./parse-vitest.ts";
import { executeTool, type ScriptRunner, type ToolErrorPayload } from "./tools/registry.ts";

/** Which validation command produced an error. Doubles as the npm script name it runs. */
export type ValidationTool = "typecheck" | "test";

/** One machine-actionable failure: where it is, and what the tool said. */
export interface ValidationError {
  tool: ValidationTool;
  /** Project-relative path inside the output directory, or "" when the tool named no file. */
  file: string;
  /** 1-based line, or null when the tool reported none. */
  line: number | null;
  /** The tool's own code (`TS2322`), or a synthetic one for a broken measurement. */
  code: string;
  message: string;
}

export interface ValidationResult {
  /** True only when both tools ran and reported nothing. */
  ok: boolean;
  errors: ValidationError[];
  /** Why validation could not be measured at all; null when both tools ran. */
  error: string | null;
}

export interface ValidateOptions {
  /** The scaffolded app: validation happens inside it, against its own configs. */
  outDir: string;
  /** Executor seam (the T05 registry's own); defaults to real `npm run` with machine flags. */
  runScript?: ScriptRunner;
  /** Override the scripts `run_command` will accept; exists so the sandbox can be probed. */
  allowedScripts?: readonly string[];
}

/** The two npm scripts this gate needs, in the order they are run. */
const VALIDATION_SCRIPTS = ["typecheck", "test"] as const;

/**
 * Flags that make each script machine-readable, appended after `npm run <script> --`.
 *
 * Keyed by script name, so an un-listed script can never gain an argument here.
 */
const MACHINE_READABLE_FLAGS: Readonly<Record<string, readonly string[]>> = {
  // `--pretty false` drops colors and the code-frame gutter, leaving one line per diagnostic.
  typecheck: ["--pretty", "false"],
  // The JSON report is the only vitest output with stable per-assertion fields.
  test: ["--reporter=json"],
};

/** Synthetic code: a tool said it failed, or ran at all, but left nothing parseable behind. */
const UNPARSEABLE_REPORT = "UNPARSEABLE_REPORT";

/** How much of an unreadable report to quote back — enough to act on, short enough to re-ask with. */
const SNIPPET_LIMIT = 600;

/** Turn a tool-reported path into the project-relative form `ValidationError.file` promises. */
export type RelativePath = (file: string) => string;

/**
 * The path policy both parsers run through.
 *
 * `rootDir` is the directory the tools were told to work in; a tool that quotes an absolute path
 * under it gets the prefix stripped, a tool that quotes `./src/x.ts` gets the `./` stripped, and
 * anything else is passed through with slashes normalized rather than guessed at.
 */
export function relativeTo(rootDir?: string): RelativePath {
  const prefix = rootDir ? `${rootDir.replace(/\\/g, "/").replace(/\/+$/, "")}/` : "";
  return (file: string): string => {
    const posix = file.replace(/\\/g, "/");
    if (prefix && posix.startsWith(prefix)) return posix.slice(prefix.length);
    return posix.startsWith("./") ? posix.slice(2) : posix;
  };
}

function failure(
  tool: ValidationTool,
  code: string,
  message: string,
  file = "",
  line: number | null = null,
): ValidationError {
  return { tool, file, line, code, message };
}

/** The message a caller can act on: install dependencies, then validate again. */
function missingDependenciesError(outDir: string): string {
  return (
    `cannot validate "${outDir}": no node_modules directory there, so neither typecheck nor test ` +
    `can run. Install the scaffolded app's dependencies first — \`npm install\` in "${outDir}" — ` +
    `and re-run validation.`
  );
}

/**
 * The production executor: a bare allow-listed script name becomes
 * `npm run <script> -- <machine flag…>` in the output directory.
 *
 * This is the only place the flags are added, and it runs strictly downstream of `run_command`'s
 * allow-list check — the sandbox still decides whether the script runs at all.
 */
const defaultRunScript: ScriptRunner = (script, { cwd }) => {
  const flags = MACHINE_READABLE_FLAGS[script] ?? [];
  const args = flags.length > 0 ? ["run", script, "--", ...flags] : ["run", script];
  return new Promise((resolvePromise) => {
    execFile("npm", args, { cwd }, (error, stdout, stderr) => {
      const exitCode = error && typeof error.code === "number" ? error.code : error ? 1 : 0;
      resolvePromise({ exitCode, stdout, stderr });
    });
  });
};

function numberField(details: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = details === undefined ? undefined : details[key];
  return typeof value === "number" ? value : undefined;
}

function stringField(details: Record<string, unknown> | undefined, key: string): string {
  const value = details === undefined ? undefined : details[key];
  return typeof value === "string" ? value : "";
}

/** One script's raw outcome, or the registry's structured rejection for it. */
type ScriptOutcome =
  | { ok: true; exitCode: number; stdout: string; stderr: string }
  | { ok: false; rejection: ToolErrorPayload };

/**
 * Run one script through `run_command`.
 *
 * `execution_failed` is the ordinary "the app has errors" path: the registry carries the tool's own
 * stdout/stderr in `details`, which is what the parsers need. Any other rejection code means the
 * harness asked for something the sandbox will not run, so it surfaces as the result's top-level
 * `error` rather than as a failure of the generated app.
 */
async function runValidationScript(
  tool: ValidationTool,
  options: ValidateOptions,
): Promise<ScriptOutcome> {
  const result = await executeTool(
    { id: `validate-${tool}`, name: "run_command", args: { command: tool } },
    {
      outDir: options.outDir,
      runScript: options.runScript ?? defaultRunScript,
      allowedScripts: options.allowedScripts ?? VALIDATION_SCRIPTS,
    },
  );
  if (result.ok) {
    // The registry reports success only on exit 0, and hands back stdout as the content.
    return { ok: true, exitCode: 0, stdout: result.content, stderr: "" };
  }
  if (result.error.code !== "execution_failed") {
    return { ok: false, rejection: result.error };
  }
  return {
    ok: true,
    exitCode: numberField(result.error.details, "exitCode") ?? 1,
    stdout: stringField(result.error.details, "stdout"),
    stderr: stringField(result.error.details, "stderr"),
  };
}

/** Last lines of whatever the tool printed. */
function outputTail(stdout: string, stderr: string): string {
  const combined = `${stdout}\n${stderr}`.trim();
  return combined.length <= SNIPPET_LIMIT ? combined : `…${combined.slice(-SNIPPET_LIMIT)}`;
}

/**
 * Run one validation tool and parse its output.
 *
 * @param readOutput picks the stream the machine-readable payload lives on
 * @param parse      turns that payload into per-file errors
 */
async function runGate(
  tool: ValidationTool,
  options: ValidateOptions,
  readOutput: (stdout: string, stderr: string) => string,
  parse: (output: string) => ValidationError[],
): Promise<{ errors: ValidationError[]; blocked: string | null }> {
  const outcome = await runValidationScript(tool, options);
  if (!outcome.ok) {
    return { errors: [], blocked: `${tool}: ${outcome.rejection.code}: ${outcome.rejection.message}` };
  }
  const parsed = parse(readOutput(outcome.stdout, outcome.stderr));
  if (outcome.exitCode === 0 || parsed.length > 0) {
    return { errors: parsed, blocked: null };
  }
  return {
    errors: [
      failure(
        tool,
        UNPARSEABLE_REPORT,
        `npm run ${tool} exited with code ${outcome.exitCode} without a parseable report. ` +
          `Output: ${outputTail(outcome.stdout, outcome.stderr)}`,
      ),
    ],
    blocked: null,
  };
}

/**
 * Run `typecheck` then `test` inside `options.outDir` and parse their real output.
 *
 * Never throws: a missing install, a rejected command, and a crashing tool all come back as a
 * `ValidationResult` the repair loop can read.
 */
export async function validate(options: ValidateOptions): Promise<ValidationResult> {
  const { outDir } = options;
  if (!existsSync(join(outDir, "node_modules"))) {
    return { ok: false, errors: [], error: missingDependenciesError(outDir) };
  }
  const toRelative = relativeTo(outDir);

  // Sequential on purpose: a typecheck crash usually explains the test failure behind it.
  const typecheck = await runGate(
    "typecheck",
    options,
    (stdout, stderr) => `${stdout}\n${stderr}`,
    (output) => parseTscOutput(output, toRelative),
  );
  const test = await runGate(
    "test",
    options,
    // vitest writes its JSON report to stdout; stderr only when a wrapper swallowed it.
    (stdout, stderr) => (stdout.trim().length > 0 ? stdout : stderr),
    (output) => parseVitestOutput(output, toRelative),
  );

  const errors = [...typecheck.errors, ...test.errors];
  const blocked = [typecheck.blocked, test.blocked].filter((entry): entry is string => entry !== null);
  const error = blocked.length === 0 ? null : blocked.join("; ");
  return { ok: error === null && errors.length === 0, errors, error };
}
