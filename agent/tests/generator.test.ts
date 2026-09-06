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

// AC for task 2026-09-05-001-T11: `generate()` runs `buildGeneratorPrompt` (no ad-hoc system
// string), still applies the context token budget to dependency outputs, and reports which files a
// task wrote together with the task artifact it executed.
//
// Asserted on the rendered request the loop sends — never on the source text of `generator.ts` — so
// the test survives renaming and still fails if the prompt library is bypassed.
describe("Generator — prompt library, token budget and artifact handoff (2026-09-05-001-T11)", () => {
  let outDir: string;

  beforeEach(() => {
    outDir = mkdtempSync("generator-prompt-library-test-");
  });

  afterEach(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  const rules = deriveRules({ referenceRoot: "" });

  /** The user turn of request `n` — the ask the model actually received. */
  function userTurnOf(provider: FakeProvider, n: number): string {
    const request = provider.requests[n];
    const message = request?.messages[0];
    return message && message.role === "user" ? message.text : "";
  }

  it("provenance: the task request's system turn is the library's — work skill and derived rules included", async () => {
    const plan: Task[] = [
      {
        file: "src/cards/CardList.tsx",
        purpose: "Render the card grid",
        dependsOn: [],
        exports: ["CardList"],
      },
    ];

    const provider = new FakeProvider({
      responses: [
        {
          toolCalls: [
            { name: "write_file", args: { path: "src/cards/CardList.tsx", content: "export const CardList = () => null;" }, id: "c1" },
          ],
        },
        { text: "Written.", toolCalls: [] },
      ],
    });

    await generate("SPEC TEXT", rules, provider, { outDir }, plan, { skillsDir: ".agents/skills" });

    const system = provider.requests[0]?.system ?? "";
    // The `work` skill block: only `buildGeneratorPrompt` renders this heading.
    expect(system).toContain("Workflow skill:");
    expect(system).toContain("`work`");
    // The boilerplate contract: only `renderRules` emits the compiler-options line.
    expect(system).toContain("Compiler options:");
    // Red before Green is stated to the model, in the ask.
    expect(userTurnOf(provider, 0)).toContain("src/cards/CardList.test.tsx");
  });

  it("skillsDir \"\" disables the skill block without disabling the rest of the prompt", async () => {
    const plan: Task[] = [
      { file: "src/cards/CardGrid.tsx", purpose: "Render a grid", dependsOn: [], exports: ["CardGrid"] },
    ];
    const provider = new FakeProvider({
      responses: [
        { toolCalls: [{ name: "write_file", args: { path: "src/cards/CardGrid.tsx", content: "export const CardGrid = () => null;" }, id: "g1" }] },
        { text: "Written.", toolCalls: [] },
      ],
    });

    await generate("SPEC TEXT", rules, provider, { outDir }, plan, { skillsDir: "" });

    const system = provider.requests[0]?.system ?? "";
    expect(system).not.toContain("Workflow skill:");
    expect(system).toContain("Compiler options:");
  });

  it("written files: the test path is reported before the implementation path, in tool-call order", async () => {
    const plan: Task[] = [
      { file: "src/cards/CardList.tsx", purpose: "Render the card grid", dependsOn: [], exports: ["CardList"] },
    ];
    const provider = new FakeProvider({
      responses: [
        {
          toolCalls: [
            { name: "write_file", args: { path: "src/cards/CardList.test.tsx", content: "it('renders', () => {});" }, id: "w1" },
          ],
        },
        {
          toolCalls: [
            { name: "write_file", args: { path: "src/cards/CardList.tsx", content: "export const CardList = () => null;" }, id: "w2" },
          ],
        },
        { text: "Done.", toolCalls: [] },
      ],
    });

    const result = await generate("SPEC TEXT", rules, provider, { outDir }, plan, { skillsDir: "" });

    expect(result.taskResults[0]?.writtenFiles).toEqual([
      "src/cards/CardList.test.tsx",
      "src/cards/CardList.tsx",
    ]);
  });

  it("handoff: taskResults[i].taskArtifact is the artifact path keyed by the task's file", async () => {
    const plan: Task[] = [
      { file: "src/cards/CardList.tsx", purpose: "Render the card grid", dependsOn: [], exports: ["CardList"] },
    ];
    const provider = new FakeProvider({
      responses: [
        { toolCalls: [{ name: "write_file", args: { path: "src/cards/CardList.test.tsx", content: "it('renders', () => {});" }, id: "h1" }] },
        { toolCalls: [{ name: "write_file", args: { path: "src/cards/CardList.tsx", content: "export const CardList = () => null;" }, id: "h2" }] },
        { text: "Done.", toolCalls: [] },
      ],
    });

    const result = await generate("SPEC TEXT", rules, provider, { outDir }, plan, {
      skillsDir: "",
      taskArtifacts: new Map([
        ["src/cards/CardList.tsx", { taskId: "2026-09-05-001-T08", path: "docs/tasks/2026-09-05-001/T08-card-list.md" }],
      ]),
    });

    expect(result.taskResults[0]?.taskArtifact).toBe("docs/tasks/2026-09-05-001/T08-card-list.md");
    // The executed ask names the artifact it executed, so trace and artifact point at each other.
    expect(userTurnOf(provider, 0).startsWith("Task artifact: 2026-09-05-001-T08 (")).toBe(true);
  });

  it("budget: a dependency the context builder elided never reaches the ask", async () => {
    const ELIDED = "export const ELIDED_DEPENDENCY_MARKER = '";
    const filler = "// padding to make the dependency exceed the budget\n".repeat(80);

    const plan: Task[] = [
      { file: "src/first.ts", purpose: "First file", dependsOn: [], exports: ["first"] },
      {
        file: "src/second.ts",
        purpose: "Second file that uses first",
        dependsOn: ["src/first.ts"],
        exports: ["second"],
      },
    ];

    const provider = new FakeProvider({
      responses: [
        { toolCalls: [{ name: "write_file", args: { path: "src/first.ts", content: `${ELIDED}marker\`;\n${filler}` }, id: "b1" }] },
        { text: "First done.", toolCalls: [] },
        { toolCalls: [{ name: "write_file", args: { path: "src/second.ts", content: "export const second = 2;" }, id: "b2" }] },
        { text: "Second done.", toolCalls: [] },
      ],
    });

    const result = await generate("SPEC TEXT", rules, provider, { outDir }, plan, {
      skillsDir: "",
      // Enough for spec + rules, not enough for the oversized dependency: the builder must report
      // the omission and the prompt must honour it.
      contextBudgetTokens: 700,
    });

    expect(result.successCount).toBe(2);
    const secondAsk = userTurnOf(provider, 2);
    expect(secondAsk).not.toContain(ELIDED);
    // The budget was genuinely applied, not silently satisfied by a short dependency: the ask still
    // says the dependency contents were not supplied.
    expect(secondAsk).toContain("No contents were supplied for the tasks you depend on");
    expect(result.taskResults[1]?.log.some((l) => l.includes("omitted"))).toBe(true);
  });
});
