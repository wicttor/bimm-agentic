// Shell tool for the sandboxed registry (task 2026-09-04-001-T05).
//
// `run_command` executes nothing arbitrary: the model's `command` string is normalized to an
// npm script name (accepting both `typecheck` and `npm run typecheck` forms) and must match
// the allow-list EXACTLY — no arguments, no chaining, no shell metacharacters can survive
// normalization, so a rejected command never reaches the runner at all. The default
// allow-list covers only terminating boilerplate scripts; `dev`, `preview`, and `test:watch`
// are deliberately excluded because a non-terminating server would hang the loop.

import type { ResolvedToolContext, ToolErrorCode, ToolHandlerResult } from "./registry.ts";

/** The boilerplate npm scripts safe to invoke from inside the loop (terminating only). */
export const DEFAULT_ALLOWED_SCRIPTS: readonly string[] = ["typecheck", "test", "build"];

function reject(
  code: ToolErrorCode,
  message: string,
  details?: Record<string, unknown>,
): ToolHandlerResult {
  return {
    ok: false,
    error: details === undefined ? { code, message } : { code, message, details },
  };
}

/**
 * Reduce a model-supplied command to a bare script name, or `null` when it is anything else.
 * Only two shapes are recognized: `typecheck` and `npm run typecheck`. Because a bare script
 * name contains no spaces, metacharacters, or trailing arguments, a `null` here is the last
 * word — no normalization step can turn a rejected command into an executed one.
 */
function normalizeToScript(command: string): string | null {
  const trimmed = command.trim();
  if (/^[a-z0-9:_-]+$/.test(trimmed)) return trimmed;
  const match = /^npm\s+run\s+([a-z0-9:_-]+)$/.exec(trimmed);
  return match?.[1] ?? null;
}

export async function runCommandTool(
  args: Record<string, unknown>,
  ctx: ResolvedToolContext,
): Promise<ToolHandlerResult> {
  const extras = Object.keys(args).filter((key) => key !== "command");
  if (extras.length > 0) {
    return reject(
      "invalid_arguments",
      `unexpected argument(s): ${extras.join(", ")}. Expected only: command.`,
      { unexpected: extras },
    );
  }
  const raw = args["command"];
  if (typeof raw !== "string" || raw.trim() === "") {
    return reject(
      "invalid_arguments",
      'argument "command" must be a non-empty string.',
      { argument: "command", received: raw === undefined ? "missing" : typeof raw },
    );
  }

  const script = normalizeToScript(raw);
  if (script === null || !ctx.allowedScripts.includes(script)) {
    return reject(
      "command_not_allowed",
      `command "${raw}" is not allow-listed. Only these npm scripts may run: ${ctx.allowedScripts.join(", ")}.`,
      { command: raw, allowedScripts: [...ctx.allowedScripts] },
    );
  }

  try {
    const outcome = await ctx.runScript(script, { cwd: ctx.outDir });
    if (outcome.exitCode !== 0) {
      return reject(
        "execution_failed",
        `npm run ${script} exited with code ${outcome.exitCode}.`,
        { script, exitCode: outcome.exitCode, stdout: outcome.stdout, stderr: outcome.stderr },
      );
    }
    return { ok: true, content: outcome.stdout };
  } catch (cause) {
    return reject(
      "execution_failed",
      `running npm run ${script} failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      { script },
    );
  }
}
