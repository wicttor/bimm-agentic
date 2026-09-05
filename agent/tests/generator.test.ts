// AC tests for the generator (task 2026-09-04-001-T10).
//
// AC under test:
//   - Happy path: provider emits write_file then done -> file on disk with returned content
//   - Max-iteration failure: provider never terminates -> stops at the cap with a typed `max_iterations` failure
//   - Tool-error recovery: first write_file rejected for traversal, second accepted -> loop continues and file is written
//   - Sandbox isolation: attempts to write outside allowed dir are rejected and reported

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { FakeProvider } from "../src/llm/fake.ts";
import { agentLoop } from "../src/agent-loop.ts";
import { generate } from "../src/generator.ts";
import { deriveRules } from "../src/prompts/exemplars.ts";
import { TOOL_DEFINITIONS } from "../src/tools/registry.ts";
import type { Task } from "../src/plan.ts";

describe("Agent loop — bounded per-task tool-calling cycle", () => {
  let outDir: string;

  beforeEach(() => {
    outDir = mkdtempSync("agent-loop-test-");
  });

  afterEach(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it("happy path: provider emits write_file then done -> file on disk", async () => {
    // Provider script:
    // 1. Call write_file to create "src/hello.ts"
    // 2. Stop (no more tool calls)
    const provider = new FakeProvider({
      responses: [
        {
          toolCalls: [
            {
              name: "write_file",
              args: { path: "src/hello.ts", content: "export const hello = () => 'world';" },
              id: "call_1",
            },
          ],
        },
        {
          text: "File created successfully.",
          toolCalls: [],
        },
      ],
    });

    const result = await agentLoop(
      "You are a code generator.",
      "Create a file src/hello.ts with a hello function.",
      provider,
      TOOL_DEFINITIONS,
      { outDir },
    );

    expect(result.ok).toBe(true);
    expect(result.reason).toBe("stop");
    expect(result.iterations).toBe(2);

    // File should exist on disk
    const filePath = join(outDir, "src", "hello.ts");
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, "utf8")).toBe("export const hello = () => 'world';");
  });

  it("max-iteration failure: provider never terminates -> stops at cap", async () => {
    // Provider script: every response requests another tool call (infinite loop)
    // With maxIterations=2, should fail after 2 attempts
    const provider = new FakeProvider({
      responses: [
        {
          toolCalls: [{ name: "write_file", args: { path: "src/a.ts", content: "a" }, id: "a1" }],
        },
        {
          toolCalls: [{ name: "write_file", args: { path: "src/b.ts", content: "b" }, id: "a2" }],
        },
      ],
    });

    const result = await agentLoop(
      "You are a code generator.",
      "Create files forever.",
      provider,
      TOOL_DEFINITIONS,
      { outDir },
      { maxIterations: 2 },
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("max_iterations");
    expect(result.iterations).toBe(2);
    expect(result.log.some((l) => l.includes("Max iterations"))).toBe(true);
  });

  it("tool-error recovery: sandbox rejects path traversal, loop continues and file is written", async () => {
    // Provider script:
    // 1. Try to write outside sandbox (should be rejected)
    // 2. Write inside sandbox (should succeed)
    // 3. Stop
    const provider = new FakeProvider({
      responses: [
        {
          toolCalls: [
            {
              name: "write_file",
              args: { path: "../escape.ts", content: "should fail" },
              id: "bad1",
            },
          ],
        },
        {
          toolCalls: [
            {
              name: "write_file",
              args: { path: "safe.ts", content: "export const safe = true;" },
              id: "good1",
            },
          ],
        },
        {
          text: "Done.",
          toolCalls: [],
        },
      ],
    });

    const result = await agentLoop(
      "You are a code generator.",
      "Create files safely.",
      provider,
      TOOL_DEFINITIONS,
      { outDir },
    );

    expect(result.ok).toBe(true);
    expect(result.reason).toBe("stop");
    expect(result.iterations).toBe(3);

    // Bad file should not exist
    const badPath = join(outDir, "..", "escape.ts");
    expect(existsSync(badPath)).toBe(false);

    // Good file should exist
    const goodPath = join(outDir, "safe.ts");
    expect(existsSync(goodPath)).toBe(true);
    expect(readFileSync(goodPath, "utf8")).toBe("export const safe = true;");

    // Log should show the path escape rejection
    expect(result.log.some((l) => l.includes("path_escape"))).toBe(true);
  });

  it("unknown tool rejection: model requests unknown tool -> error message and stop", async () => {
    const provider = new FakeProvider({
      responses: [
        {
          toolCalls: [
            {
              name: "unknown_tool_xyz",
              args: { some: "args" },
              id: "unknown1",
            },
          ],
        },
        {
          text: "I see, that tool doesn't exist.",
          toolCalls: [],
        },
      ],
    });

    const result = await agentLoop(
      "You are a code generator.",
      "Create files.",
      provider,
      TOOL_DEFINITIONS,
      { outDir },
    );

    // Should complete, but with the unknown tool error in the messages
    expect(result.ok).toBe(true);
    expect(result.reason).toBe("stop");

    // The first message should be assistant requesting unknown_tool_xyz
    expect(result.messages.find((m) => m.role === "assistant" && m.toolCalls?.some((tc) => tc.name === "unknown_tool_xyz"))).toBeTruthy();

    // There should be a tool error message
    const errorMsg = result.messages.find((m) => m.role === "tool" && m.isError);
    expect(errorMsg).toBeTruthy();
    if (errorMsg && errorMsg.role === "tool") {
      const error = JSON.parse(errorMsg.content);
      expect(error.code).toBe("unknown_tool");
    }
  });

  it("provider error: LLM provider throws -> returns error result", async () => {
    const { LlmError } = await import("../src/llm/provider.ts");

    const provider = new FakeProvider({
      responses: [
        { error: new LlmError("server_error", "Server returned 500") },
      ],
    });

    const result = await agentLoop(
      "You are a code generator.",
      "Create files.",
      provider,
      TOOL_DEFINITIONS,
      { outDir },
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("error");
    expect(result.error?.code).toBe("provider_error");
    expect(result.error?.message).toContain("500");
  });
});

describe("Generator — per-task orchestration", () => {
  let outDir: string;

  beforeEach(() => {
    outDir = mkdtempSync("generator-test-");
  });

  afterEach(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it("generates all tasks in plan order, respecting dependencies", async () => {
    const spec = "Build a simple React component.";
    const rules = deriveRules({ referenceRoot: "" });

    const plan: Task[] = [
      {
        file: "src/hooks/useData.ts",
        purpose: "Hook to fetch data",
        dependsOn: [],
        exports: ["useData"],
      },
      {
        file: "src/components/DataDisplay.tsx",
        purpose: "Component to display data using the hook",
        dependsOn: ["src/hooks/useData.ts"],
        exports: ["DataDisplay"],
      },
    ];

    const provider = new FakeProvider({
      responses: [
        // Task 1: write useData hook
        {
          toolCalls: [
            {
              name: "write_file",
              args: {
                path: "src/hooks/useData.ts",
                content: "export const useData = () => ({ data: 'test' });",
              },
              id: "t1_c1",
            },
          ],
        },
        { text: "Hook created.", toolCalls: [] },

        // Task 2: write DataDisplay component
        {
          toolCalls: [
            {
              name: "write_file",
              args: {
                path: "src/components/DataDisplay.tsx",
                content: 'import { useData } from "../hooks/useData";\nexport const DataDisplay = () => {\n  const { data } = useData();\n  return <div>{data}</div>;\n};',
              },
              id: "t2_c1",
            },
          ],
        },
        { text: "Component created.", toolCalls: [] },
      ],
    });

    const result = await generate(spec, rules, provider, { outDir }, plan);

    expect(result.successCount).toBe(2);
    expect(result.failureCount).toBe(0);

    // Both files should exist
    const hook = join(outDir, "src", "hooks", "useData.ts");
    const component = join(outDir, "src", "components", "DataDisplay.tsx");
    expect(existsSync(hook)).toBe(true);
    expect(existsSync(component)).toBe(true);
  });

  it("single task failure does not block generator", async () => {
    const spec = "Build components.";
    const rules = deriveRules({ referenceRoot: "" });

    const plan: Task[] = [
      {
        file: "src/good.ts",
        purpose: "A good file",
        dependsOn: [],
        exports: ["good"],
      },
      {
        file: "src/bad.ts",
        purpose: "A bad file that times out",
        dependsOn: [],
        exports: ["bad"],
      },
    ];

    const provider = new FakeProvider({
      responses: [
        // Task 1: success
        {
          toolCalls: [
            {
              name: "write_file",
              args: { path: "src/good.ts", content: "export const good = true;" },
              id: "g1",
            },
          ],
        },
        { text: "Good.", toolCalls: [] },

        // Task 2: max iterations (infinite loop)
        {
          toolCalls: [
            { name: "write_file", args: { path: "src/bad.ts", content: "a" }, id: "b1" },
          ],
        },
        {
          toolCalls: [
            { name: "write_file", args: { path: "src/bad.ts", content: "b" }, id: "b2" },
          ],
        },
      ],
    });

    const result = await generate(spec, rules, provider, { outDir }, plan, { maxIterations: 2 });

    // Task 1 succeeded, task 2 failed
    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(1);
    expect(result.failedTasks).toContain("src/bad.ts");

    // Good file should exist
    expect(existsSync(join(outDir, "src", "good.ts"))).toBe(true);
  });

  it("dependency output flows into later task's context", async () => {
    const spec = "Build files with dependencies.";
    const rules = deriveRules({ referenceRoot: "" });

    const plan: Task[] = [
      {
        file: "src/first.ts",
        purpose: "First file",
        dependsOn: [],
        exports: ["first"],
      },
      {
        file: "src/second.ts",
        purpose: "Second file that uses first",
        dependsOn: ["src/first.ts"],
        exports: ["second"],
      },
    ];

    let secondTaskContext = "";
    const provider = new FakeProvider({
      responses: [
        // Task 1: write first file
        {
          toolCalls: [
            {
              name: "write_file",
              args: { path: "src/first.ts", content: "export const VERSION = '1.0';" },
              id: "f1",
            },
          ],
        },
        { text: "First done.", toolCalls: [] },

        // Task 2: context should include first file's content
        {
          toolCalls: [
            {
              name: "write_file",
              args: {
                path: "src/second.ts",
                content: "import { VERSION } from './first';\nexport const APP_VERSION = VERSION;",
              },
              id: "s1",
            },
          ],
        },
        { text: "Second done.", toolCalls: [] },
      ],
    });

    // Override to capture the context
    const originalComplete = provider.complete.bind(provider);
    provider.complete = async function (request) {
      // Capture context from second request
      if (provider.requests.length === 2) {
        const msg = request.messages[0];
        if (msg && msg.role === "user" && "text" in msg) {
          secondTaskContext = msg.text;
        }
      }
      return originalComplete(request);
    };

    const result = await generate(spec, rules, provider, { outDir }, plan);

    expect(result.successCount).toBe(2);

    // Second task's prompt should contain the first file's content
    // The dependency content should be included in the context (without the "Dependency:" label)
    expect(secondTaskContext).toContain("export const VERSION = '1.0';");
  });
});
