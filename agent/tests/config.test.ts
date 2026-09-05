import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { LlmProvider } from "../src/llm/provider.ts";

// Acceptance-Criterion test for task 2026-09-04-001-T02 (CLI entry and config resolution).
//
// AC under test:
//   The CLI parses `--spec`, `--out`, `--provider`, `--model`, `--max-retries`,
//   `--max-iterations`, `--dry-run`, and exits with an error naming the exact missing
//   variable (e.g. `ANTHROPIC_API_KEY`) instead of an ambiguous network failure when no
//   key is present.
//
// Test-local fake provider only — the real `FakeProvider` is T03's (`agent/src/llm/fake.ts`).
// The CLI must short-circuit `--dry-run` **before** any provider instantiation, so the
// provider factory below doubles as a "was a provider ever created?" spy, and the fetch
// stub proves zero HTTP calls.

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const SPEC_REL = "specs/car-inventory.md";

type Env = Record<string, string | undefined>;

let httpCalls = 0;
let originalFetch: typeof globalThis.fetch | undefined;

/** Test-local fake provider (the real `FakeProvider` is T03's file). */
function makeFakeProviderSpy(): {
  creations: { value: number };
  factory: (config: { provider: string }) => LlmProvider;
} {
  const creations = { value: 0 };
  return {
    creations,
    factory: () => {
      creations.value += 1;
      // A minimal LlmProvider stub — never used for I/O in these tests.
      return {
        name: "fake" as const,
        model: "test-model",
        complete: async () => ({
          text: "",
          toolCalls: [],
          stopReason: "stop" as const,
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
        }),
      };
    },
  };
}

function armFetchSpy(): void {
  originalFetch = globalThis.fetch;
  httpCalls = 0;
  globalThis.fetch = (async () => {
    httpCalls += 1;
    throw new Error("config resolution must never issue network requests");
  }) as unknown as typeof globalThis.fetch;
}

afterEach(() => {
  if (originalFetch !== undefined) {
    globalThis.fetch = originalFetch;
    originalFetch = undefined;
  }
  httpCalls = 0;
});

async function loadModule() {
  // Imported dynamically so a missing implementation fails at require-time inside the
  // Red run (the expected first failure), not at collection of unrelated suites.
  const config = await import("../src/config.ts");
  const index = await import("../src/index.ts");
  return { resolveConfig: config.resolveConfig, run: index.run };
}

describe("full flags -> typed config with documented defaults", () => {
  it("parses --spec + --max-retries and fills documented defaults for the rest", async () => {
    const { resolveConfig } = await loadModule();
    const result = resolveConfig(["--spec", SPEC_REL, "--max-retries", "2"], {
      ANTHROPIC_API_KEY: "test-key",
    });
    if (!result.ok) throw new Error(`expected ok, got error: ${result.error}`);
    const cfg = result.config;
    expect(cfg.spec).toBe(SPEC_REL);
    expect(cfg.out).toBe("generated-app"); // default
    expect(cfg.provider).toBe("anthropic"); // auto-detected from ANTHROPIC_API_KEY
    expect(cfg.model.length).toBeGreaterThan(0); // documented per-provider default
    expect(cfg.maxRetries).toBe(2);
    expect(cfg.maxIterations).toBe(8); // default
    expect(cfg.dryRun).toBe(false);
  });

  it("parses every documented flag", async () => {
    const { resolveConfig } = await loadModule();
    const result = resolveConfig(
      [
        "--spec", SPEC_REL,
        "--out", "other-dir",
        "--provider", "openai",
        "--model", "some-model",
        "--max-retries", "0",
        "--max-iterations", "3",
        "--dry-run",
      ],
      {},
    );
    if (!result.ok) throw new Error(`expected ok, got error: ${result.error}`);
    const cfg = result.config;
    expect(cfg).toMatchObject({
      spec: SPEC_REL,
      out: "other-dir",
      provider: "openai",
      model: "some-model",
      maxRetries: 0, // 0 is legal: validation runs once, no repair
      maxIterations: 3,
      dryRun: true,
    });
  });

  it("honours LLM_PROVIDER and auto-detects from OPENAI_API_KEY", async () => {
    const { resolveConfig } = await loadModule();
    // Explicit LLM_PROVIDER wins over auto-detection's Anthropic-first order.
    const fromEnv = resolveConfig(["--spec", SPEC_REL], {
      LLM_PROVIDER: "openai",
      ANTHROPIC_API_KEY: "a-key",
      OPENAI_API_KEY: "o-key",
    });
    if (!fromEnv.ok) throw new Error(`expected ok, got: ${fromEnv.error}`);
    expect(fromEnv.config.provider).toBe("openai");

    const autoOpenAI = resolveConfig(["--spec", SPEC_REL], { OPENAI_API_KEY: "test-key" });
    if (!autoOpenAI.ok) throw new Error(`expected ok, got: ${autoOpenAI.error}`);
    expect(autoOpenAI.config.provider).toBe("openai");

    // A forced provider still fails loudly naming ITS missing key — no silent fallback.
    const forcedMissingKey = resolveConfig(["--spec", SPEC_REL], {
      LLM_PROVIDER: "anthropic",
      OPENAI_API_KEY: "test-key",
    });
    expect(forcedMissingKey.ok).toBe(false);
    if (forcedMissingKey.ok) throw new Error("expected failure");
    expect(forcedMissingKey.error).toContain("ANTHROPIC_API_KEY");
  });
});

describe("missing key -> non-zero exit naming the exact variable, zero requests", () => {
  it("names ANTHROPIC_API_KEY when no key is present", async () => {
    const { resolveConfig } = await loadModule();
    const result = resolveConfig(["--spec", SPEC_REL], {});
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error).toContain("ANTHROPIC_API_KEY");
  });

  it("exits non-zero without creating a provider or hitting the network", async () => {
    const { run } = await loadModule();
    armFetchSpy();
    const spy = makeFakeProviderSpy();
    const errs: string[] = [];
    const code = await run(["--spec", SPEC_REL], {
      env: {},
      createProvider: spy.factory,
      error: (line) => errs.push(line),
    });
    expect(code).not.toBe(0);
    expect(errs.join("\n")).toContain("ANTHROPIC_API_KEY");
    expect(spy.creations.value, "no provider may be instantiated when config is invalid").toBe(0);
    expect(httpCalls, "no HTTP request may be attempted").toBe(0);
  });
});

describe("unknown provider -> rejected, listing supported providers", () => {
  it("rejects --provider gemini and names the supported ones", async () => {
    const { resolveConfig } = await loadModule();
    const result = resolveConfig(["--spec", SPEC_REL, "--provider", "gemini"], {
      ANTHROPIC_API_KEY: "test-key",
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    const err = result.error;
    expect(err).toContain("gemini");
    expect(err).toContain("anthropic");
    expect(err).toContain("openai");
  });

  it("rejects an unknown LLM_PROVIDER value too", async () => {
    const { resolveConfig } = await loadModule();
    const result = resolveConfig(["--spec", SPEC_REL], {
      LLM_PROVIDER: "gemini",
      ANTHROPIC_API_KEY: "test-key",
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error).toMatch(/anthropic.*openai|openai.*anthropic/);
  });
});

describe("--dry-run -> planning path completes with zero HTTP calls", () => {
  it("completes exit 0 without instantiating a provider or calling fetch", async () => {
    const { run } = await loadModule();
    armFetchSpy();
    const spy = makeFakeProviderSpy();
    const logs: string[] = [];
    const code = await run(["--spec", SPEC_REL, "--dry-run"], {
      env: {}, // dry-run must not even require an API key
      createProvider: spy.factory,
      log: (line) => logs.push(line),
    });
    expect(code).toBe(0);
    expect(spy.creations.value, "--dry-run short-circuits before any provider instantiation").toBe(0);
    expect(httpCalls).toBe(0);
    expect(logs.join("\n")).toMatch(/dry-run/i);
  });
});

describe("flag validation errors are specific", () => {
  it("names the offending flag for missing --spec and bad numeric values", async () => {
    const { resolveConfig } = await loadModule();
    const noSpec = resolveConfig([], {});
    expect(noSpec.ok).toBe(false);
    if (noSpec.ok) throw new Error("expected failure");
    expect(noSpec.error).toContain("--spec");

    const badRetries = resolveConfig(["--spec", SPEC_REL, "--max-retries", "abc"], {
      ANTHROPIC_API_KEY: "test-key",
    });
    expect(badRetries.ok).toBe(false);
    if (badRetries.ok) throw new Error("expected failure");
    expect(badRetries.error).toContain("--max-retries");

    const negative = resolveConfig(["--spec", SPEC_REL, "--max-iterations", "-1"], {
      ANTHROPIC_API_KEY: "test-key",
    });
    expect(negative.ok).toBe(false);
    if (negative.ok) throw new Error("expected failure");
    expect(negative.error).toContain("--max-iterations");
  });
});

describe(".env.example names the required env vars and carries no secret", () => {
  it("lists ANTHROPIC_API_KEY, OPENAI_API_KEY, LLM_PROVIDER with empty values", () => {
    const envExample = readFileSync(join(repoRoot, ".env.example"), "utf8");
    expect(envExample).toContain("ANTHROPIC_API_KEY");
    expect(envExample).toContain("OPENAI_API_KEY");
    expect(envExample).toContain("LLM_PROVIDER");
    // Every assignment must be empty — a committed value would be a secret.
    for (const line of envExample.split(/\r?\n/)) {
      const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line);
      if (m) expect(m[2], `secret committed in .env.example: ${line}`).toBe("");
    }
    expect(envExample).not.toMatch(/sk-[A-Za-z0-9_-]{8,}/);
  });
});

describe("the real CLI entry point is runnable (node agent/src/index.ts)", () => {
  const cliPath = join(repoRoot, "agent", "src", "index.ts");

  function spawnCli(args: string[], env: Env): { status: number; stdout: string; stderr: string } {
    try {
      const stdout = execFileSync("node", [cliPath, ...args], {
        cwd: repoRoot,
        encoding: "utf8",
        env: { PATH: process.env.PATH, ...env },
        stdio: ["ignore", "pipe", "pipe"],
      });
      return { status: 0, stdout, stderr: "" };
    } catch (err) {
      const e = err as { status?: number; stdout?: string; stderr?: string };
      return {
        status: typeof e.status === "number" ? e.status : 1,
        stdout: e.stdout ?? "",
        stderr: e.stderr ?? "",
      };
    }
  }

  it("exits 0 on --dry-run with no keys and no network", () => {
    expect(existsSync(SPEC_REL), `${SPEC_REL} must exist`).toBe(true);
    const r = spawnCli(["--spec", SPEC_REL, "--dry-run"], {});
    expect(r.status, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`).toBe(0);
    expect(`${r.stdout}${r.stderr}`).toMatch(/dry-run/i);
  });

  it("exits non-zero naming ANTHROPIC_API_KEY when no key is present", () => {
    const r = spawnCli(["--spec", SPEC_REL], {});
    expect(r.status).not.toBe(0);
    expect(`${r.stdout}${r.stderr}`).toContain("ANTHROPIC_API_KEY");
  });
});
