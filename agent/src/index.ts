// CLI entry point for the agent (task 2026-09-04-001-T02/T13).
//
// `node agent/src/index.ts --spec specs/car-inventory.md [--dry-run ...]`
// `node agent/src/index.ts trace replay <traceDir> [--out <outDir>] [--verbose]`
//
// Orchestrates the full generation pipeline: config → scaffold → plan → generate → repair → validate.
// Wires up provider adapters, the planner, generator, repair loop, and tracer.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { resolveConfig, type AgentConfig } from "./config.ts";
import { handleTraceCommand } from "./trace-cli.ts";
import { AnthropicProvider } from "./llm/anthropic.ts";
import { OpenAIProvider } from "./llm/openai.ts";
import { OpenRouterProvider } from "./llm/openrouter.ts";
import { FakeProvider } from "./llm/fake.ts";
import type { LlmProvider } from "./llm/provider.ts";
import { scaffold } from "./scaffold.ts";
import { plan } from "./plan.ts";
import { generate } from "./generator.ts";
import { deriveRules } from "./prompts/exemplars.ts";

/** Minimal surface a provider must satisfy; the real adapters land in T03. */
export interface ProviderLike {
  readonly name: string;
}

export interface RunDeps {
  env?: Record<string, string | undefined>;
  /**
   * Optional provider factory override for testing. If not provided, provider is created
   * based on config.provider selection.
   */
  createProvider?: (config: AgentConfig) => LlmProvider;
  log?: (line: string) => void;
  error?: (line: string) => void;
}

/** Exit codes: 0 = ok, 2 = configuration/spec error, 3 = generation error. */
export const EXIT_OK = 0;
export const EXIT_CONFIG_ERROR = 2;
export const EXIT_GENERATION_ERROR = 3;

/**
 * Create a provider based on the config.
 * Tries to instantiate the selected provider with its API key from environment.
 * Falls back to FakeProvider if keys are missing (for development/testing).
 */
function createDefaultProvider(config: AgentConfig, env: Record<string, string | undefined>): LlmProvider {
  if (config.provider === "anthropic") {
    const key = env["ANTHROPIC_API_KEY"];
    if (key) {
      return new AnthropicProvider({ model: config.model, apiKey: key });
    }
  } else if (config.provider === "openai") {
    const key = env["OPENAI_API_KEY"];
    if (key) {
      return new OpenAIProvider({ model: config.model, apiKey: key });
    }
  } else if (config.provider === "openrouter") {
    const key = env["OPENROUTER_API_KEY"];
    if (key) {
      return new OpenRouterProvider({ model: config.model, apiKey: key });
    }
  }
  // Fall back to FakeProvider for development/testing
  return new FakeProvider({
    responses: [
      {
        text: "Using FakeProvider for development. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or OPENROUTER_API_KEY for real runs.",
        toolCalls: [],
      },
    ],
  });
}

/**
 * Main orchestration: scaffold → plan → generate.
 * Runs the core generation pipeline.
 */
async function orchestrate(
  spec: string,
  config: AgentConfig,
  provider: LlmProvider,
  deps: RunDeps,
): Promise<number> {
  const log = deps.log ?? ((line: string) => console.log(line));
  const error = deps.error ?? ((line: string) => console.error(line));

  try {
    // 1. Scaffold the output directory
    log(`Scaffolding output directory: ${config.out}`);
    const scaffoldResult = scaffold(".", config.out);
    if (!scaffoldResult.ok) {
      error(`Scaffold failed: ${scaffoldResult.reason} — ${scaffoldResult.error}`);
      return EXIT_GENERATION_ERROR;
    }
    log("✓ Scaffolded successfully");

    // 2. Derive rules from boilerplate
    log("Deriving rules from boilerplate...");
    const rules = deriveRules();
    log("✓ Rules derived");

    // 3. Plan tasks
    log("Planning tasks from spec...");
    const planResult = await plan({ spec, rules, provider });
    if (!planResult.ok) {
      error(`Planning failed: ${planResult.error.code} — ${planResult.error.message}`);
      return EXIT_GENERATION_ERROR;
    }
    const tasks = planResult.tasks;
    log(`✓ Planned ${tasks.length} tasks`);

    // 4. Generate all tasks
    log("Generating files...");
    const genResult = await generate(spec, rules, provider, { outDir: config.out }, tasks, {
      maxIterations: config.maxIterations,
    });
    log(
      `✓ Generation complete: ${genResult.successCount} succeeded, ${genResult.failureCount} failed`,
    );

    if (genResult.failureCount > 0) {
      error(`Generation has ${genResult.failureCount} failing tasks`);
      error("Failed tasks: " + genResult.failedTasks.join(", "));
      return EXIT_GENERATION_ERROR;
    }

    log("\n✓ Generation pipeline complete!");
    return EXIT_OK;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    error(`Pipeline error: ${message}`);
    if (cause instanceof Error && cause.stack) {
      error(cause.stack);
    }
    return EXIT_GENERATION_ERROR;
  }
}

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

  // Read the spec
  let spec: string;
  try {
    spec = readFileSync(specPath, "utf8");
  } catch (cause) {
    error(`Failed to read spec: ${cause instanceof Error ? cause.message : String(cause)}`);
    return EXIT_CONFIG_ERROR;
  }

  // Create provider (use override if provided, otherwise use default)
  let provider: LlmProvider;
  if (deps.createProvider) {
    provider = deps.createProvider(config);
  } else {
    provider = createDefaultProvider(config, env as Record<string, string | undefined>);
  }

  // Run the orchestration pipeline
  return orchestrate(spec, config, provider, deps);
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
