// Trace CLI commands (task 2026-09-04-001-T12).
//
// Wires the replayTrace function to the CLI:
// `agent-cli trace replay <traceDir> [--out <outDir>] [--verbose]`

import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { replayTrace } from "./tracer.ts";
import type { ReplayOptions } from "./tracer.ts";

export interface TraceCliDeps {
  log?: (line: string) => void;
  error?: (line: string) => void;
}

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_CONFIG_ERROR = 2;

/**
 * Handle trace CLI commands:
 * - `trace replay <traceDir> [--out <outDir>] [--verbose]`
 *
 * @param argv - CLI arguments after the subcommand
 * @param deps - Dependencies (log, error functions)
 * @returns Exit code
 */
export async function handleTraceCommand(argv: string[], deps: TraceCliDeps = {}): Promise<number> {
  const log = deps.log ?? ((line: string) => console.log(line));
  const error = deps.error ?? ((line: string) => console.error(line));

  if (argv.length < 2) {
    error("trace: missing subcommand. Usage: trace replay <traceDir> [--out <outDir>] [--verbose]");
    return EXIT_CONFIG_ERROR;
  }

  const subcommand = argv[0];

  if (subcommand === "replay") {
    return handleTraceReplay(argv.slice(1), { log, error });
  }

  error(`trace: unknown subcommand "${subcommand}"`);
  return EXIT_CONFIG_ERROR;
}

async function handleTraceReplay(argv: string[], deps: TraceCliDeps): Promise<number> {
  const log = deps.log ?? console.log;
  const error = deps.error ?? console.error;

  if (argv.length < 1) {
    error("trace replay: missing traceDir argument. Usage: trace replay <traceDir> [--out <outDir>] [--verbose]");
    return EXIT_CONFIG_ERROR;
  }

  const traceDirArg = argv[0];
  if (!traceDirArg) {
    error("trace replay: empty traceDir argument");
    return EXIT_CONFIG_ERROR;
  }

  const traceDir = resolve(process.cwd(), traceDirArg);

  if (!existsSync(traceDir)) {
    error(`trace replay: trace directory not found: ${traceDirArg}`);
    return EXIT_CONFIG_ERROR;
  }

  // Parse optional flags
  const flags = new Map<string, string | true>();
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) continue;

    if (arg === "--verbose") {
      flags.set("--verbose", true);
    } else if (arg === "--out" && i + 1 < argv.length) {
      const nextArg = argv[i + 1];
      if (nextArg && !nextArg.startsWith("--")) {
        flags.set("--out", nextArg);
        i += 1;
      }
    } else if (!arg.startsWith("--")) {
      // Skip positional arguments
      continue;
    }
  }

  const options: ReplayOptions = {
    verbose: flags.get("--verbose") === true,
  };

  const outDir = flags.get("--out");
  if (typeof outDir === "string") {
    options.outDir = resolve(process.cwd(), outDir);
  }

  log(`Replaying trace from: ${traceDir}`);
  if (options.outDir) {
    log(`Output directory: ${options.outDir}`);
  }

  try {
    const result = await replayTrace(traceDir, {}, undefined, options);

    if (result.ok) {
      log(`Trace replay succeeded: ${result.message}`);
      return EXIT_OK;
    } else {
      error(`Trace replay failed: ${result.message}`);
      return EXIT_ERROR;
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    error(`Trace replay error: ${message}`);
    return EXIT_ERROR;
  }
}
