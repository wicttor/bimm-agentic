// Filesystem tools for the sandboxed registry (task 2026-09-04-001-T05).
//
// `read_file`, `write_file`, and `list_files` operate ONLY inside the output directory:
// every model-supplied path is lexically resolved against `ctx.outDir` and refused with a
// structured `path_escape` rejection if it lands outside it — before any existence check, so
// the sandbox never leaks whether a path outside exists. Writes are additionally capped at
// `ctx.maxFileBytes` so the model cannot emit excessively large files. All failures are
// returned, never thrown.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import type { ResolvedToolContext, ToolErrorCode, ToolHandlerResult } from "./registry.ts";

/** Default per-file write cap: 256 KiB — generous for app source, tiny vs a runaway loop. */
export const DEFAULT_MAX_FILE_BYTES = 256 * 1024;

function reject(code: ToolErrorCode, message: string, details?: Record<string, unknown>): ToolHandlerResult {
  return { ok: false, error: details === undefined ? { code, message } : { code, message, details } };
}

function invalidArguments(message: string, details?: Record<string, unknown>): ToolHandlerResult {
  return reject("invalid_arguments", message, details);
}

/** A model-supplied path must be a non-empty string; returns it or a structured rejection. */
function stringArg(
  args: Record<string, unknown>,
  name: string,
  required: boolean,
): { value: string } | { error: ToolHandlerResult } {
  const raw = args[name];
  if (raw === undefined && !required) return { value: "" };
  if (typeof raw !== "string" || raw.length === 0) {
    return {
      error: invalidArguments(
        `argument "${name}" must be a non-empty string.`,
        { argument: name, received: raw === undefined ? "missing" : typeof raw },
      ),
    };
  }
  return { value: raw };
}

/** Extra keys signal a model misunderstanding; surface them instead of ignoring. */
function unexpectedKeys(args: Record<string, unknown>, allowed: readonly string[]): ToolHandlerResult | null {
  const extras = Object.keys(args).filter((key) => !allowed.includes(key));
  if (extras.length === 0) return null;
  return invalidArguments(
    `unexpected argument(s): ${extras.join(", ")}. Expected only: ${allowed.join(", ")}.`,
    { unexpected: extras },
  );
}

/**
 * Resolve `input` against the sandbox root and prove containment lexically. Returns the
 * resolved absolute path, or `null` when the path escapes (traversal via `..`, an absolute
 * path elsewhere, or a different-rooted path). Checked BEFORE any filesystem access.
 */
function confine(outDir: string, input: string): string | null {
  const abs = resolve(outDir, input);
  const rel = relative(outDir, abs);
  if (rel === "") return abs; // the sandbox root itself (list_files default)
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
  return abs;
}

function escapeRejected(outDir: string, input: string): ToolHandlerResult {
  return reject(
    "path_escape",
    `path "${input}" resolves outside the output directory "${outDir}"; tools are confined to it.`,
    { path: input, outDir },
  );
}

export async function readFileTool(
  args: Record<string, unknown>,
  ctx: ResolvedToolContext,
): Promise<ToolHandlerResult> {
  const extra = unexpectedKeys(args, ["path"]);
  if (extra) return extra;
  const path = stringArg(args, "path", true);
  if ("error" in path) return path.error;

  const abs = confine(ctx.outDir, path.value);
  if (abs === null) return escapeRejected(ctx.outDir, path.value);
  if (!existsSync(abs)) {
    return reject("not_found", `no file at "${path.value}" inside the output directory.`, {
      path: path.value,
    });
  }
  if (statSync(abs).isDirectory()) {
    return invalidArguments(`"${path.value}" is a directory; read_file expects a file.`, {
      path: path.value,
    });
  }

  try {
    return { ok: true, content: readFileSync(abs, "utf8") };
  } catch (cause) {
    return reject("io_error", `reading "${path.value}" failed: ${String(cause)}`, {
      path: path.value,
    });
  }
}

export async function writeFileTool(
  args: Record<string, unknown>,
  ctx: ResolvedToolContext,
): Promise<ToolHandlerResult> {
  const extra = unexpectedKeys(args, ["path", "content"]);
  if (extra) return extra;
  const path = stringArg(args, "path", true);
  if ("error" in path) return path.error;
  const contentArg = stringArg(args, "content", true);
  if ("error" in contentArg) return contentArg.error;

  const abs = confine(ctx.outDir, path.value);
  if (abs === null) return escapeRejected(ctx.outDir, path.value);

  const bytes = Buffer.byteLength(contentArg.value, "utf8");
  if (bytes > ctx.maxFileBytes) {
    return reject(
      "file_too_large",
      `refusing to write "${path.value}": ${bytes} bytes exceeds the per-file cap of ${ctx.maxFileBytes} bytes.`,
      { path: path.value, bytes, maxFileBytes: ctx.maxFileBytes },
    );
  }

  try {
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, contentArg.value, "utf8");
    return { ok: true, content: `wrote ${bytes} bytes to "${path.value}".` };
  } catch (cause) {
    return reject("io_error", `writing "${path.value}" failed: ${String(cause)}`, {
      path: path.value,
    });
  }
}

export async function listFilesTool(
  args: Record<string, unknown>,
  ctx: ResolvedToolContext,
): Promise<ToolHandlerResult> {
  const extra = unexpectedKeys(args, ["path"]);
  if (extra) return extra;
  const path = stringArg(args, "path", false);
  if ("error" in path) return path.error;

  const abs = confine(ctx.outDir, path.value);
  if (abs === null) return escapeRejected(ctx.outDir, path.value);
  if (!existsSync(abs)) {
    return reject("not_found", `no directory at "${path.value}" inside the output directory.`, {
      path: path.value,
    });
  }
  if (!statSync(abs).isDirectory()) {
    return invalidArguments(`"${path.value}" is a file; list_files expects a directory.`, {
      path: path.value,
    });
  }

  try {
    const entries = readdirSync(abs, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
    const lines = entries.map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name));
    return { ok: true, content: lines.join("\n") };
  } catch (cause) {
    return reject("io_error", `listing "${path.value}" failed: ${String(cause)}`, {
      path: path.value,
    });
  }
}
