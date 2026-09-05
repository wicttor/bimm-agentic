// CLI entry point for the agent (task 2026-09-04-001-T02).
//
// `node agent/src/index.ts --spec specs/car-inventory.md [--dry-run ...]`
// `node agent/src/index.ts trace replay <traceDir> [--out <outDir>] [--verbose]`
//
// Responsibilities of this slice: parse flags, resolve config (agent/src/config.ts),
// verify the spec exists, and fail loudly with a specific error **before** any provider
// is instantiated or any network call is attempted. The generation pipeline itself is
// wired by later tasks (T03 provider, T10/T11 loop) and is reached via `deps` here.

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { resolveConfig, type AgentConfig } from "./config.ts";
import { handleTraceCommand } from "./trace-cli.ts";

/** Minimal surface a provider must satisfy; the real adapters land in T03. */
export interface ProviderLike {
  readonly name: string;
}

export interface RunDeps {
  env?: Record<string, string | undefined>;
  /**
   * Provider factory — called ONLY on the non-dry-run path after config resolution
   * succeeds. `--dry-run` must short-circuit before this, so tests can assert that a
   * missing/invalid configuration (or a dry run) instantiates no provider and issues
   * zero HTTP calls.
   */
  createProvider?: (config: AgentConfig) => ProviderLike;
  log?: (line: string) => void;
  error?: (line: string) => void;
}

/** Exit codes: 0 = ok, 2 = configuration/spec error, 3 = pipeline not yet wired. */
export const EXIT_OK = 0;
export const EXIT_CONFIG_ERROR = 2;
export const EXIT_PIPELINE_UNAVAILABLE = 3;

export async function run(argv: string[], deps: RunDeps = {}): Promise<number> {
  const env = deps.env ?? process.env;
  const log = deps.log ?? ((line: string) => console.log(line));
  const error = deps.error ?? ((line: string) => console.error(line));

  // Handle subcommands
  if (argv.length > 0 && argv[0] === "trace") {
    return handleTraceCommand(argv.slice(1), { log, error });
  }

  const resolved = resolveConfig(argv, env);
  if (!resolved.ok) {
    error(`config error: ${resolved.error}`);
    return EXIT_CONFIG_ERROR;
  }
  const config = resolved.config;

  const specPath = resolve(process.cwd(), config.spec);
  if (!existsSync(specPath)) {
    error(`config error: spec file not found: ${config.spec}`);
    return EXIT_CONFIG_ERROR;
  }

  if (config.dryRun) {
    // Short-circuit BEFORE any provider instantiation: zero HTTP calls by construction.
    log("dry-run: configuration resolved; planning path complete with 0 HTTP calls (no provider instantiated).");
    log(`dry-run: spec=${config.spec} out=${config.out} provider=${config.provider} model=${config.model} max-retries=${config.maxRetries} max-iterations=${config.maxIterations}`);
    return EXIT_OK;
  }

  if (!deps.createProvider) {
    error(
      "error: no provider factory available — the generation pipeline is wired by later " +
        "tasks (T03 adapters, T10/T11 loop). Configuration itself resolved cleanly; " +
        "use --dry-run to exercise this path offline.",
    );
    return EXIT_PIPELINE_UNAVAILABLE;
  }

  deps.createProvider(config);
  error(
    "error: provider instantiated, but the generation pipeline is not implemented yet " +
      "(T10/T11). Nothing was sent to the network.",
  );
  return EXIT_PIPELINE_UNAVAILABLE;
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(resolve(entry)).href;
}

if (isDirectExecution()) {
  run(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
