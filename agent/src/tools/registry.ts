// Sandboxed tool registry for the agent (task 2026-09-04-001-T05).
//
// The model acts on the workspace ONLY through the tools defined here, and every outcome —
// success or rejection — comes back as a structured `ToolResult` keyed to the originating
// `ToolCall.id`. Nothing a model can say can make `executeTool` throw: an escaped path, an
// oversized write, a disallowed command, or an unknown tool name all become `tool_result`
// errors that feed straight back into the loop (T03's `{ role: "tool", isError: true }`
// message shape). Rejections-as-results is the contract; exceptions are a bug.

import { execFile } from "node:child_process";

import type { ToolCall, ToolDefinition, Message } from "../llm/provider.ts";

import { DEFAULT_MAX_FILE_BYTES, listFilesTool, readFileTool, writeFileTool } from "./fs.ts";
import { DEFAULT_ALLOWED_SCRIPTS, runCommandTool } from "./shell.ts";

export { DEFAULT_MAX_FILE_BYTES, DEFAULT_ALLOWED_SCRIPTS };

/** Every way a tool call can be refused, machine-branchable by the loop and tests. */
export type ToolErrorCode =
  | "unknown_tool"
  | "invalid_arguments"
  | "path_escape"
  | "file_too_large"
  | "not_found"
  | "command_not_allowed"
  | "execution_failed"
  | "io_error";

/** The structured error payload a rejected tool call carries back to the model. */
export interface ToolErrorPayload {
  code: ToolErrorCode;
  message: string;
  /** Machine-readable context (offending path, byte cap, allowed scripts...). */
  details?: Record<string, unknown>;
}

/** What an individual tool handler returns: content, or a structured rejection. */
export type ToolHandlerResult =
  | { ok: true; content: string }
  | { ok: false; error: ToolErrorPayload };

/** A completed tool call, tied to the `ToolCall.id` that produced it. */
export type ToolResult =
  | { ok: true; toolCallId: string; tool: string; content: string }
  | { ok: false; toolCallId: string; tool: string; error: ToolErrorPayload };

/** Injectable npm-script executor — the seam that keeps tests off real processes. */
export type ScriptRunner = (
  script: string,
  options: { cwd: string },
) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

/** Caller-supplied sandbox settings, all but `outDir` defaulted by `executeTool`. */
export interface ToolContext {
  /** The output directory is the only place file tools may read or write. */
  outDir: string;
  /** Per-file write cap in bytes (default `DEFAULT_MAX_FILE_BYTES`). */
  maxFileBytes?: number;
  /** Allow-listed npm scripts for `run_command` (default `DEFAULT_ALLOWED_SCRIPTS`). */
  allowedScripts?: readonly string[];
  /** Executor override — tests record instead of running; production uses npm. */
  runScript?: ScriptRunner;
}

/** Fully-resolved context handed to handlers; no optional knobs left to default. */
export interface ResolvedToolContext {
  outDir: string;
  maxFileBytes: number;
  allowedScripts: readonly string[];
  runScript: ScriptRunner;
}

/** One handler per tool name; dispatch is a pure lookup — no dynamic execution. */
export type ToolHandler = (
  args: Record<string, unknown>,
  ctx: ResolvedToolContext,
) => Promise<ToolHandlerResult>;

export const TOOL_NAMES = ["read_file", "write_file", "list_files", "run_command"] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

const HANDLERS: ReadonlyMap<string, ToolHandler> = new Map<ToolName, ToolHandler>([
  ["read_file", readFileTool],
  ["write_file", writeFileTool],
  ["list_files", listFilesTool],
  ["run_command", runCommandTool],
]);

/** Schemas advertised to the model — the names here and in `HANDLERS` are one set. */
export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "read_file",
    description: "Read a UTF-8 text file from the output directory.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path relative to the output directory." },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description:
      "Write a UTF-8 text file inside the output directory, creating parent directories as needed.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path relative to the output directory." },
        content: { type: "string", description: "Full file contents to write." },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "list_files",
    description: "List the entries of a directory inside the output directory (non-recursive).",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: 'Directory path relative to the output directory. Defaults to ".".',
        },
      },
    },
  },
  {
    name: "run_command",
    description:
      "Run one allow-listed npm script from the output directory's package.json, returning its combined output.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description:
            "An allow-listed npm script name, or the same with an 'npm run ' prefix. Nothing else.",
        },
      },
      required: ["command"],
    },
  },
];

function resolveContext(context: ToolContext): ResolvedToolContext {
  return {
    outDir: context.outDir,
    maxFileBytes: context.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES,
    // An override REPLACES the default list — the model can never extend its own sandbox.
    allowedScripts: context.allowedScripts ?? DEFAULT_ALLOWED_SCRIPTS,
    runScript: context.runScript ?? defaultRunScript,
  };
}

/** Default executor: `npm run <script>` in the output directory, argument-array form. */
async function defaultRunScript(
  script: string,
  options: { cwd: string },
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise) => {
    execFile("npm", ["run", script], { cwd: options.cwd }, (error, stdout, stderr) => {
      const exitCode = error && typeof error.code === "number" ? error.code : error ? 1 : 0;
      resolvePromise({ exitCode, stdout, stderr });
    });
  });
}

/**
 * Dispatch one model tool call to its handler. This function NEVER throws: unknown names,
 * bad arguments, sandbox escapes, and handler bugs all leave as structured `ToolResult`
 * rejections — the loop's only feedback channel.
 */
export async function executeTool(toolCall: ToolCall, context: ToolContext): Promise<ToolResult> {
  const { id: toolCallId, name, args } = toolCall;
  const handler = HANDLERS.get(name);
  if (!handler) {
    return {
      ok: false,
      toolCallId,
      tool: name,
      error: {
        code: "unknown_tool",
        message: `unknown tool "${name}". Available tools: ${TOOL_NAMES.join(", ")}.`,
      },
    };
  }

  try {
    const result = await handler(args ?? {}, resolveContext(context));
    return result.ok
      ? { ok: true, toolCallId, tool: name, content: result.content }
      : { ok: false, toolCallId, tool: name, error: result.error };
  } catch (cause) {
    // Last-resort net: a handler bug becomes a rejection, never an exception into the loop.
    return {
      ok: false,
      toolCallId,
      tool: name,
      error: {
        code: "io_error",
        message: `tool "${name}" failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      },
    };
  }
}

/** Map a result onto the T03 loop message shape; rejections set `isError: true`. */
export function toToolMessage(result: ToolResult): Message {
  if (result.ok) {
    return { role: "tool", toolCallId: result.toolCallId, content: result.content };
  }
  return {
    role: "tool",
    toolCallId: result.toolCallId,
    content: JSON.stringify(result.error),
    isError: true,
  };
}
