// vitest JSON report parser for the validation gate (task 2026-09-04-001-T06).
//
// Pure: it turns `vitest run --reporter=json` output into per-file errors. The shape it consumes
// was measured against real runs rather than assumed, and three details of that shape drive the
// implementation:
//
//   * npm's `> pkg@version test` banner precedes the report, so the JSON object is located by its
//     outermost braces instead of assuming stdout is a clean document.
//   * `testResults[].name` is an ABSOLUTE path — the opposite of what tsc reports — so it has to be
//     made project-relative before a model can hand it back to a `write_file` call confined to the
//     output directory.
//   * A suite that failed to load reports the reason on the suite (`message`) with an empty
//     `assertionResults` list; a suite whose tests ran and failed reports it per assertion, with the
//     location buried in a `failureMessages` stack frame.
//
// Silence is treated as an outcome, never as success: a report that cannot be read, that lost its
// `testResults`, that collected no tests, or that claims failures it does not contain all produce an
// error, because a repair loop fed "0 errors" by accident stops before the app works.
//
// Every field is read through a type predicate rather than a cast: this output is untyped JSON from
// another process, and an `as` would turn a renamed key into a silent undefined instead of the
// missing field the guards below can see.

import type { RelativePath, ValidationError } from "./validate.ts";

/** Code for an assertion that ran and failed. */
const ASSERTION_FAILED = "ASSERTION_FAILED";

/** Code for a suite that never got as far as running its assertions. */
const SUITE_ERROR = "SUITE_ERROR";

/** Synthetic code: the run collected nothing, which is not the same as the tests passing. */
const NO_TESTS_COLLECTED = "NO_TESTS_COLLECTED";

/**
 * Synthetic code for a report that could not be read or contradicts itself.
 *
 * The same value `validate.ts` exports for the identical failure on the typecheck side; repeated
 * rather than imported so this module stays a leaf — the gate's own imports run one way.
 */
const UNPARSEABLE_REPORT = "UNPARSEABLE_REPORT";

/** How much of an unreadable report to quote back — enough to act on, short enough to re-ask with. */
const SNIPPET_LIMIT = 400;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function field(container: unknown, key: string): unknown {
  return isRecord(container) ? container[key] : undefined;
}

function text(container: unknown, key: string): string {
  const value = field(container, key);
  return isString(value) ? value : "";
}

function count(container: unknown, key: string): number | null {
  const value = field(container, key);
  return typeof value === "number" ? value : null;
}

function list(container: unknown, key: string): unknown[] | null {
  const value = field(container, key);
  return Array.isArray(value) ? value : null;
}

function failure(
  code: string,
  message: string,
  file = "",
  line: number | null = null,
): ValidationError {
  return { tool: "test", file, line, code, message };
}

/** The single JSON object embedded in a stream that may also carry banners and warnings. */
function extractJson(output: string): string | null {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  return start === -1 || end <= start ? null : output.slice(start, end + 1);
}

/** The first non-empty line of a stack: the assertion itself, before any frames. */
function firstLine(message: string): string {
  for (const line of message.split("\n")) {
    if (line.trim().length > 0) return line.trim();
  }
  return "";
}

/**
 * The failing assertion's own line, read out of its stack frames.
 *
 * `absoluteName` is the suite's own un-normalized path, because that is what the frames quote.
 * Frames in node_modules and the runner's internals are skipped — they would send the repair loop to
 * a file the model cannot edit.
 */
function assertionLine(failureMessages: readonly string[], absoluteName: string): number | null {
  if (absoluteName.length === 0) return null;
  for (const message of failureMessages) {
    for (const raw of message.split("\n").slice(1)) {
      const frame = raw.trim();
      if (!frame.startsWith("at ") || !frame.includes(absoluteName)) continue;
      const location = /:(\d+):(\d+)$/.exec(frame);
      if (location?.[1]) return Number(location[1]);
    }
  }
  return null;
}

/**
 * Parse a `vitest run --reporter=json` report into one error per failure.
 *
 * @param output     the run's stdout, npm banner included
 * @param toRelative the output directory's path policy (see `relativeTo`)
 */
export function parseVitestOutput(output: string, toRelative: RelativePath): ValidationError[] {
  const unreadable = (reason: string): ValidationError[] => [
    failure(UNPARSEABLE_REPORT, `${reason} Output: ${output.trim().slice(0, SNIPPET_LIMIT)}`),
  ];

  const json = extractJson(output);
  if (json === null) return unreadable("no JSON report found in the test output.");

  let report: unknown;
  try {
    report = JSON.parse(json);
  } catch {
    return unreadable("the test output contained an unparseable JSON report.");
  }
  if (!isRecord(report)) return unreadable("the test report was not a JSON object.");

  const suites = list(report, "testResults");
  if (suites === null) return unreadable("the test report has no testResults array.");

  const errors: ValidationError[] = [];
  for (const suite of suites) {
    if (!isRecord(suite)) continue;
    const absoluteName = text(suite, "name");
    const file = toRelative(absoluteName);
    let mapped = 0;

    for (const assertion of list(suite, "assertionResults") ?? []) {
      if (!isRecord(assertion) || text(assertion, "status") !== "failed") continue;
      const messages = (list(assertion, "failureMessages") ?? []).filter(isString);
      const headline = messages.map(firstLine).find((line) => line.length > 0);
      const name = text(assertion, "fullName") || text(assertion, "title");
      errors.push(
        failure(
          ASSERTION_FAILED,
          `${name.length > 0 ? `${name}: ` : ""}${headline ?? "test failed without a message"}`,
          file,
          assertionLine(messages, absoluteName),
        ),
      );
      mapped += 1;
    }

    // A suite that failed to load never reaches its assertions: the reason lives on the suite.
    if (mapped === 0 && text(suite, "status") === "failed") {
      errors.push(
        failure(
          SUITE_ERROR,
          firstLine(text(suite, "message")) || "test file failed without a message",
          file,
        ),
      );
    }
  }

  if (errors.length === 0 && count(report, "numTotalTests") === 0) {
    errors.push(
      failure(NO_TESTS_COLLECTED, "the test run collected no tests, so nothing was validated."),
    );
  }
  const claimed = count(report, "numFailedTests") ?? 0;
  if (claimed > errors.length) {
    errors.push(
      failure(
        UNPARSEABLE_REPORT,
        `the report claims ${claimed} failing tests but only ${errors.length} could be mapped.`,
      ),
    );
  }
  return errors;
}
