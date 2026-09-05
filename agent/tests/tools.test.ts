// AC tests for the sandboxed tool registry (task 2026-09-04-001-T05).
//
// The acceptance criterion has two halves: (1) confinement — `read_file` / `write_file` /
// `list_files` only reach the output directory, `run_command` only runs allow-listed npm
// scripts; (2) the error contract — every rejection comes back as a structured `tool_result`
// error, never a thrown exception escaping into the loop. Rejection-path tests assert on the
// exact `ToolErrorCode`, so a stub returning a generic failure cannot pass them by accident.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ToolCall } from "../src/llm/provider.ts";
import {
  DEFAULT_ALLOWED_SCRIPTS,
  DEFAULT_MAX_FILE_BYTES,
  TOOL_DEFINITIONS,
  TOOL_NAMES,
  executeTool,
  toToolMessage,
  type ScriptRunner,
  type ToolContext,
  type ToolErrorPayload,
  type ToolResult,
} from "../src/tools/registry.ts";

let root: string; // sandbox parent — outside outDir, used for escape targets
let outDir: string; // the ONLY place tools may touch
let cleanup: string[];

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "t05-tools-"));
  outDir = join(root, "generated-app");
  mkdirSync(outDir);
  cleanup = [root];
});

afterEach(() => {
  for (const dir of cleanup) rmSync(dir, { recursive: true, force: true });
});

let callSeq = 0;
function call(name: string, args: Record<string, unknown>): ToolCall {
  callSeq += 1;
  return { id: `call-${callSeq}`, name, args };
}

/** Runner spy: records every script actually executed, returns success. */
function spyRunner(exitCode = 0) {
  const invocations: { script: string; cwd: string }[] = [];
  const runScript: ScriptRunner = async (script, opts) => {
    invocations.push({ script, cwd: opts.cwd });
    return { exitCode, stdout: `ran:${script}`, stderr: exitCode === 0 ? "" : "compile errors" };
  };
  return { invocations, runScript };
}

function ctx(overrides: Partial<ToolContext> = {}): ToolContext {
  const spy = spyRunner();
  return { outDir, runScript: spy.runScript, ...overrides };
}

/** Narrow to the rejection payload — fails at assertion level if the call succeeded. */
function rejection(result: ToolResult): ToolErrorPayload {
  if (result.ok) {
    throw new Error(`expected a structured rejection, got success: ${result.content}`);
  }
  return result.error;
}

/** Narrow to success content — fails at assertion level if the call was rejected. */
function content(result: ToolResult): string {
  if (!result.ok) {
    throw new Error(`expected success, got ${result.error.code}: ${result.error.message}`);
  }
  return result.content;
}

describe("executeTool — error-as-result contract", () => {
  it("returns a structured rejection for an unknown tool, listing the available tools", async () => {
    const result = await executeTool(call("delete_everything", {}), ctx());

    const error = rejection(result);
    expect(error.code).toBe("unknown_tool");
    for (const tool of TOOL_NAMES) expect(error.message).toContain(tool);
  });

  it("rejections carry the originating toolCallId and tool name", async () => {
    const toolCall = call("nope", { path: "x" });

    const result = await executeTool(toolCall, ctx());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.toolCallId).toBe(toolCall.id);
      expect(result.tool).toBe("nope");
    }
  });

  it("invalid arguments (missing or wrong-typed) are structured errors, never thrown", async () => {
    const cases: ToolCall[] = [
      call("read_file", {}),
      call("read_file", { path: 42 }),
      call("write_file", { path: "ok.ts" }), // no content
      call("write_file", { path: "ok.ts", content: 7 }),
      call("run_command", {}),
      call("run_command", { command: ["rm", "-rf"] }),
    ];

    for (const bad of cases) {
      const error = rejection(await executeTool(bad, ctx()));
      expect(error.code).toBe("invalid_arguments");
    }
  });

  it("never throws even when a handler's internals blow up", async () => {
    const explodingRunner: ScriptRunner = async () => {
      throw new Error("spawn ENOENT npm");
    };

    const error = rejection(await executeTool(call("run_command", { command: "typecheck" }), ctx({ runScript: explodingRunner })));

    expect(error.code).toBe("execution_failed");
  });
});

describe("read_file / write_file / list_files — confined to the output directory", () => {
  it("write_file round-trips a nested path inside the sandbox", async () => {
    const onDisk = join(outDir, "src", "components", "Card.tsx");

    const result = await executeTool(
      call("write_file", { path: "src/components/Card.tsx", content: "export const Card = 1;\n" }),
      ctx(),
    );

    expect(result.ok).toBe(true);
    expect(readFileSync(onDisk, "utf8")).toBe("export const Card = 1;\n");

    const read = await executeTool(call("read_file", { path: "src/components/Card.tsx" }), ctx());
    expect(content(read)).toBe("export const Card = 1;\n");
  });

  it("list_files shows the sandbox tree, and refuses paths that resolve outside it", async () => {
    mkdirSync(join(outDir, "src"));
    writeFileSync(join(outDir, "index.html"), "<html></html>");

    const listed = await executeTool(call("list_files", {}), ctx());
    expect(content(listed)).toContain("src");
    expect(content(listed)).toContain("index.html");

    const escape = rejection(await executeTool(call("list_files", { path: ".." }), ctx()));
    expect(escape.code).toBe("path_escape");
  });

  it("AC (a): traversal write_file('../../../etc/passwd') is rejected and nothing is written", async () => {
    const escapeTarget = join(root, "escaped.txt"); // writable stand-in for /etc/passwd

    const error = rejection(
      await executeTool(call("write_file", { path: "../../../etc/passwd", content: "pwned" }), ctx()),
    );
    expect(error.code).toBe("path_escape");

    const second = rejection(
      await executeTool(call("write_file", { path: "../escaped.txt", content: "pwned" }), ctx()),
    );
    expect(second.code).toBe("path_escape");
    expect(existsSync(escapeTarget), "nothing was written outside the output dir").toBe(false);
  });

  it("AC (b): read_file of an absolute reference-tree path is rejected without leaking contents", async () => {
    const reference = join(root, "reference-src");
    mkdirSync(reference);
    writeFileSync(join(reference, "App.tsx"), "// real boilerplate, must not leak\n");

    const error = rejection(
      await executeTool(call("read_file", { path: join(reference, "App.tsx") }), ctx()),
    );
    expect(error.code).toBe("path_escape");
    // The rejection message must not echo the file's contents back to the model.
    expect(JSON.stringify(error), "error payload leaked file contents").not.toContain("real boilerplate");
  });

  it("read_file of a missing path inside the sandbox is a structured not_found error", async () => {
    const error = rejection(await executeTool(call("read_file", { path: "src/Nope.tsx" }), ctx()));
    expect(error.code).toBe("not_found");
  });

  it("AC (e): a write above the per-file byte cap is rejected with the cap as the reason", async () => {
    const payload = "x".repeat(64 * 1024);

    const error = rejection(
      await executeTool(
        call("write_file", { path: "huge.ts", content: payload }),
        ctx({ maxFileBytes: 1024 }),
      ),
    );

    expect(error.code).toBe("file_too_large");
    expect(error.message, "message must state the cap as the reason").toContain("1024");
    expect(existsSync(join(outDir, "huge.ts")), "oversized write must not create the file").toBe(false);
  });

  it("the byte cap is configurable: same content passes under a larger cap", async () => {
    const payload = "x".repeat(64 * 1024);

    const ok = await executeTool(
      call("write_file", { path: "big.ts", content: payload }),
      ctx({ maxFileBytes: 128 * 1024 }),
    );

    expect(ok.ok).toBe(true);
    expect(readFileSync(join(outDir, "big.ts"), "utf8")).toBe(payload);
  });

  it("DEFAULT_MAX_FILE_BYTES exists as the fallback cap and is a positive number", async () => {
    expect(DEFAULT_MAX_FILE_BYTES).toBeGreaterThan(0);
    // A default-context write within the cap succeeds without the caller configuring anything.
    const ok = await executeTool(
      call("write_file", { path: "small.ts", content: "const x = 1;" }),
      { outDir },
    );
    expect(ok.ok).toBe(true);
  });
});

describe("run_command — npm-script allow-list only", () => {
  it("AC (c): 'rm -rf .' is rejected and never reaches the runner", async () => {
    const spy = spyRunner();

    const error = rejection(
      await executeTool(call("run_command", { command: "rm -rf ." }), { outDir, runScript: spy.runScript }),
    );

    expect(error.code).toBe("command_not_allowed");
    expect(spy.invocations, "rejection must not execute anything").toEqual([]);
  });

  it("AC (c): 'typecheck' is executed through the runner, inside the output directory", async () => {
    const spy = spyRunner();

    const ok = await executeTool(call("run_command", { command: "typecheck" }), {
      outDir,
      runScript: spy.runScript,
    });

    expect(spy.invocations).toEqual([{ script: "typecheck", cwd: outDir }]);
    expect(content(ok)).toContain("ran:typecheck");
  });

  it("accepts the 'npm run <script>' form and normalizes it to the allow-listed script", async () => {
    const spy = spyRunner();

    const ok = await executeTool(call("run_command", { command: "npm run build" }), {
      outDir,
      runScript: spy.runScript,
    });

    expect(spy.invocations).toEqual([{ script: "build", cwd: outDir }]);
    expect(ok.ok).toBe(true);
  });

  it("chains, arguments, and metacharacters cannot smuggle a disallowed command through", async () => {
    const spy = spyRunner();
    const smuggles = [
      "typecheck && rm -rf /",
      "typecheck; rm -rf /",
      "typecheck --force",
      "echo hi | sh",
      "npm run typecheck -- --help",
      "test:watch", // real npm script, non-terminating — deliberately not allow-listed
      "dev", // real npm script, non-terminating — deliberately not allow-listed
    ];

    for (const command of smuggles) {
      const error = rejection(
        await executeTool(call("run_command", { command }), { outDir, runScript: spy.runScript }),
      );
      expect(error.code, `${command} must not run`).toBe("command_not_allowed");
    }
    expect(spy.invocations, "no smuggled command reached the runner").toEqual([]);
  });

  it("a rejected command lists the allowed scripts so the model can self-correct", async () => {
    const error = rejection(
      await executeTool(call("run_command", { command: "sudo make me a sandwich" }), ctx()),
    );
    for (const script of DEFAULT_ALLOWED_SCRIPTS) expect(error.message).toContain(script);
  });

  it("the allow-list is configurable via the context — the override replaces the default", async () => {
    const spy = spyRunner();

    const ok = await executeTool(
      call("run_command", { command: "lint" }),
      { outDir, runScript: spy.runScript, allowedScripts: ["lint"] },
    );
    expect(ok.ok).toBe(true);
    expect(spy.invocations).toEqual([{ script: "lint", cwd: outDir }]);

    const error = rejection(
      await executeTool(
        call("run_command", { command: "typecheck" }),
        { outDir, runScript: spy.runScript, allowedScripts: ["lint"] },
      ),
    );
    expect(error.code).toBe("command_not_allowed"); // the override REPLACES, never extends
    expect(spy.invocations).toHaveLength(1);
  });

  it("non-zero exit codes come back as structured execution_failed, not throws", async () => {
    const spy = spyRunner(2);

    const error = rejection(
      await executeTool(call("run_command", { command: "typecheck" }), {
        outDir,
        runScript: spy.runScript,
      }),
    );

    expect(error.code).toBe("execution_failed");
    expect(JSON.stringify(error)).toContain("compile errors");
  });
});

describe("registry surface", () => {
  it("TOOL_DEFINITIONS advertises exactly the four tools with usable schemas", () => {
    expect(TOOL_DEFINITIONS.map((d) => d.name).sort()).toEqual([...TOOL_NAMES].sort());
    for (const def of TOOL_DEFINITIONS) {
      expect(def.description.length, `${def.name} needs a description`).toBeGreaterThan(0);
      expect(def.parameters.type).toBe("object");
      const props = def.parameters.properties;
      expect(typeof props === "object" && props !== null, `${def.name} needs properties`).toBe(true);
      if (typeof props !== "object" || props === null) continue;
      expect(Object.keys(props).length, `${def.name} needs at least one property`).toBeGreaterThan(0);
    }
  });

  it("toToolMessage maps results onto the T03 loop message shape", async () => {
    const ok = await executeTool(call("write_file", { path: "a.ts", content: "a" }), ctx());
    const okMessage = toToolMessage(ok);
    expect(okMessage.role).toBe("tool");
    if (okMessage.role !== "tool") return;
    expect(okMessage.toolCallId).toBe(ok.toolCallId);
    expect(okMessage.isError ?? false).toBe(false);

    const bad = await executeTool(call("write_file", { path: "/etc/passwd", content: "a" }), ctx());
    const errorMessage = toToolMessage(bad);
    expect(errorMessage.role).toBe("tool");
    if (errorMessage.role !== "tool") return;
    expect(errorMessage.isError).toBe(true);
    expect(errorMessage.content).toContain("path_escape");
  });
});
