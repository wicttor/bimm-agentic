// Config resolution for the agent CLI (task 2026-09-04-001-T02).
//
// Pure, side-effect-free: `resolveConfig(argv, env)` turns CLI flags + environment into a
// typed `AgentConfig`, or a specific error — so the CLI can fail loudly **before** any
// network call when configuration is missing or invalid.

export const SUPPORTED_PROVIDERS = ["anthropic", "openai"] as const;

export type ProviderName = (typeof SUPPORTED_PROVIDERS)[number];

export interface AgentConfig {
  /** Path to the natural-language spec file (repo-relative or absolute). */
  spec: string;
  /** Output directory for the generated app. */
  out: string;
  /** Resolved LLM provider. */
  provider: ProviderName;
  /** Model id for the resolved provider. */
  model: string;
  /** Outer repair-loop cap (0 = validate once, never repair). */
  maxRetries: number;
  /** Inner per-task tool-loop cap. */
  maxIterations: number;
  /** Resolve everything and stop; never instantiates a provider or touches the network. */
  dryRun: boolean;
}

export type ConfigResult = { ok: true; config: AgentConfig } | { ok: false; error: string };

/** Documented defaults — referenced by the AC test. */
export const DEFAULTS = {
  out: "generated-app",
  maxRetries: 3,
  maxIterations: 8,
} as const;

/** Default model per provider (overridable with `--model`). */
export const DEFAULT_MODEL: Record<ProviderName, string> = {
  anthropic: "claude-sonnet-4-5",
  openai: "gpt-4o",
};

/** The exact env var each provider needs. */
export const API_KEY_ENV: Record<ProviderName, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
};

const FLAG_NAMES = [
  "--spec",
  "--out",
  "--provider",
  "--model",
  "--max-retries",
  "--max-iterations",
  "--dry-run",
] as const;

type Env = Record<string, string | undefined>;

function fail(error: string): ConfigResult {
  return { ok: false, error };
}

function isKnownFlag(name: string): name is (typeof FLAG_NAMES)[number] {
  return (FLAG_NAMES as readonly string[]).includes(name);
}

function parseFlags(argv: string[]): Map<string, string | true> {
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    if (!isKnownFlag(arg)) {
      throw new ConfigError(
        `Unknown argument "${arg}". Supported flags: ${FLAG_NAMES.join(", ")}.`,
      );
    }
    if (arg === "--dry-run") {
      flags.set(arg, true);
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined || isKnownFlag(value)) {
      throw new ConfigError(`${arg} requires a value.`);
    }
    flags.set(arg, value);
    i += 1;
  }
  return flags;
}

class ConfigError extends Error {}

function parseIntegerFlag(
  flags: Map<string, string | true>,
  flag: (typeof FLAG_NAMES)[number],
  fallback: number,
  min: number,
): number {
  const raw = flags.get(flag);
  if (raw === undefined) return fallback;
  const text = String(raw);
  const value = Number(text);
  if (!Number.isInteger(value) || value < min) {
    throw new ConfigError(`${flag} must be an integer >= ${min}, got "${text}".`);
  }
  return value;
}

function resolveProvider(
  flags: Map<string, string | true>,
  env: Env,
): { provider: ProviderName } | { error: string } {
  const explicit = flags.get("--provider") ?? env["LLM_PROVIDER"];
  if (explicit !== undefined) {
    const name = String(explicit);
    if (!(SUPPORTED_PROVIDERS as readonly string[]).includes(name)) {
      return {
        error: `Unknown provider "${name}". Supported providers: ${SUPPORTED_PROVIDERS.join(", ")}.`,
      };
    }
    return { provider: name as ProviderName };
  }
  // Auto-detect from whichever API key is present (Anthropic first).
  if (env["ANTHROPIC_API_KEY"]) return { provider: "anthropic" };
  if (env["OPENAI_API_KEY"]) return { provider: "openai" };
  // No key anywhere: default so the error below can name the exact missing variable.
  return { provider: "anthropic" };
}

/**
 * Turn argv + env into a typed `AgentConfig`, or a specific error naming what is wrong
 * (the exact flag, or the exact missing env variable). Never performs I/O.
 */
export function resolveConfig(argv: string[], env: Env = process.env): ConfigResult {
  let flags: Map<string, string | true>;
  try {
    flags = parseFlags(argv);
  } catch (err) {
    if (err instanceof ConfigError) return fail(err.message);
    throw err;
  }

  const spec = flags.get("--spec");
  if (typeof spec !== "string" || spec.length === 0) {
    return fail('Missing required flag --spec <path> (natural-language spec file, e.g. --spec specs/car-inventory.md).');
  }

  let maxRetries: number;
  let maxIterations: number;
  try {
    maxRetries = parseIntegerFlag(flags, "--max-retries", DEFAULTS.maxRetries, 0);
    maxIterations = parseIntegerFlag(flags, "--max-iterations", DEFAULTS.maxIterations, 1);
  } catch (err) {
    if (err instanceof ConfigError) return fail(err.message);
    throw err;
  }

  const provider = resolveProvider(flags, env);
  if ("error" in provider) return fail(provider.error);

  const dryRun = flags.get("--dry-run") === true;
  const keyVar = API_KEY_ENV[provider.provider];
  if (!dryRun && !env[keyVar]) {
    return fail(
      `Missing environment variable ${keyVar} (required by provider ` +
        `"${provider.provider}"). Set ${keyVar} (see .env.example) or choose a provider whose key ` +
        `is present. Nothing was sent to the network.`,
    );
  }

  const modelRaw = flags.get("--model");
  const model =
    typeof modelRaw === "string" && modelRaw.length > 0
      ? modelRaw
      : DEFAULT_MODEL[provider.provider];

  const outRaw = flags.get("--out");
  const out = typeof outRaw === "string" && outRaw.length > 0 ? outRaw : DEFAULTS.out;

  return {
    ok: true,
    config: {
      spec,
      out,
      provider: provider.provider,
      model,
      maxRetries,
      maxIterations,
      dryRun,
    },
  };
}
