// tsc diagnostic parser for the validation gate (task 2026-09-04-001-T06).
//
// Pure: it turns the text `tsc --pretty false` printed into per-file errors and touches nothing.
// The strict flags this gate must cover — `noUncheckedIndexedAccess`, `noUnusedLocals`,
// `noUnusedParameters`, `strict` — are never named here on purpose. They come from the output
// directory's own `tsconfig.json`, which `tsc` reads; restating them here would let the agent's
// config and the validator's idea of the config drift apart.
//
// Path normalization is injected rather than recomputed here so the project-relative contract on
// `ValidationError.file` has exactly one implementation, shared with the vitest parser.

import type { RelativePath, ValidationError } from "./validate.ts";

/**
 * One diagnostic, as `tsc --pretty false` prints it:
 * `src/bad.ts(2,9): error TS6133: 'unused' is declared but its value is never read.`
 *
 * Anchored, and requiring the `error` keyword plus a `TS` code, so continuation lines (`  Type
 * 'undefined' is not assignable…`), npm's `> pkg@version script` banner, warnings, and the
 * trailing `Found 3 errors.` summary all fail to match and are dropped rather than half-parsed.
 */
const DIAGNOSTIC_LINE = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/;

/**
 * Parse `tsc` output into one error per diagnostic line.
 *
 * @param output     combined stdout/stderr from a `typecheck` run
 * @param toRelative the output directory's path policy (see `relativeTo`)
 */
export function parseTscOutput(output: string, toRelative: RelativePath): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const raw of output.split("\n")) {
    const match = DIAGNOSTIC_LINE.exec(raw.trimEnd());
    if (!match) continue;
    const [, file, line, , code, message] = match;
    if (!file || !line || !code || !message) continue;
    errors.push({
      tool: "typecheck",
      file: toRelative(file),
      line: Number(line),
      code,
      // First line only: it carries the actionable sentence, while the indented continuations are
      // the tool expanding on it for a human reader.
      message: message.trim(),
    });
  }
  return errors;
}
