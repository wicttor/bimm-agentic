// Offline proof for the CLI pipeline (task 2026-09-05-001-T14).
//
// AC under test: one `run()` invocation with a scripted provider scaffolds, plans through the
// `plan` skill, writes the plan and task artifacts, executes every task through the `work` skill,
// and records outcomes — proven by an offline test that asserts the artifacts and their final
// statuses on disk.
//
// Three things this file exists to pin down, and how it proves them:
//
//   1. **Provenance.** The planner request's system turn must carry the *plan* skill and a later
//      (executor) request's system turn must carry the *work* skill. Asserted on the rendered
//      request, not on source text, so a prompt that stops injecting the skill fails here.
//   2. **Zero network.** `globalThis.fetch` is swapped for a counting spy that throws. The run uses
//      `FakeProvider`, so any fetch call is a wiring bug — it surfaces as a thrown error AND as a
//      non-zero count, never as a silently-passing test.
//   3. **No phase dumps.** `.work/`, `.scope/`, `.research/` and `.design/` must not appear anywhere
//      under the artifacts directory, while the three durable outputs (plan document, task files,
//      one work report in the task index) must.
//
// Scripted-response count: `1 (plan) + tasks × iterations` (per
// `docs/learn/gotcha/scripted-fake-exhaustion-mimics-adapter-bug.md`) — the fakes here are sized
// exactly, so an unplanned extra model call throws instead of looping.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

import { EXIT_CONFIG_ERROR, EXIT_GENERATION_ERROR, EXIT_OK, run } from "../src/index.ts";
import { FakeProvider, type FakeReply } from "../src/llm/fake.ts";
import type { CompleteRequest, LlmProvider } from "../src/llm/provider.ts";

/** The two files one task owns: its test first, then the implementation its test proves. */
const RED_FILE = "src/cards/CardGrid.test.tsx";
const GREEN_FILE = "src/cards/CardGrid.tsx";
const SECOND_RED_FILE = "src/cards/useCards.test.ts";
const SECOND_GREEN_FILE = "src/cards/useCards.ts";

const SPEC = [
  "# Card Wall",
  "",
  "A page that shows one card per item in a small local list, with a loading state.",
  "",
  "## Behaviour",
  "",
  "- Cards render in the order given.",
  "- An empty list renders an empty-state line.",
].join("\n");

/** One planned task, in the shape the planner's `write_plan` call delivers. */
interface PlannedTask {
  file: string;
  purpose: string;
  dependsOn: string[];
  exports: string[];
  title: string;
  unit: string;
  acceptanceCriterion: string;
  testFile: string;
  steps: string[];
  priority: string;
  effort: string;
}

/** `write_plan` accepts a bare task array or `{ tasks: [...] }`; this fixture uses the bare shape. */
function plannedTask(over: {
  file: string;
  purpose: string;
  testFile: string;
  acceptanceCriterion: string;
  dependsOn: string[];
  exports: string[];
}): PlannedTask {
  return {
    file: over.file,
    purpose: over.purpose,
    dependsOn: over.dependsOn,
    exports: over.exports,
    title: `Implement ${over.file.split("/").pop()}`,
    unit: "U1",
    acceptanceCriterion: over.acceptanceCriterion,
    testFile: over.testFile,
    steps: [
      `**Red — Write the failing test:** add \`${over.testFile}\` asserting: ${over.acceptanceCriterion}.`,
      `**Green — Implement:** write \`${over.file}\` so that test passes.`,
      `**Refactor:** tighten \`${over.file}\`; keep its declared exports stable.`,
    ],
    priority: "P1",
    effort: "15 minutes",
  };
}

/** The plan the scripted provider answers with — two tasks, second depends on the first. */
function planArgs(): PlannedTask[] {
  return [
    plannedTask({
      file: SECOND_GREEN_FILE,
      purpose: "Hook returning the card list",
      testFile: SECOND_RED_FILE,
      acceptanceCriterion: "`src/cards/useCards.ts` exports `useCards` returning an array of cards",
      dependsOn: [],
      exports: ["useCards"],
    }),
    plannedTask({
      file: GREEN_FILE,
      purpose: "Grid component rendering the cards",
      testFile: RED_FILE,
      acceptanceCriterion: "`src/cards/CardGrid.tsx` exports `CardGrid` rendering one card per item",
      dependsOn: [SECOND_GREEN_FILE],
      exports: ["CardGrid"],
    }),
  ];
}

/** The same array as a `write_plan` argument object. */
function planToolArgs(tasks: PlannedTask[]): Record<string, unknown> {
  return tasks as unknown as Record<string, unknown>;
}

function write(path: string, content: string): { name: string; args: Record<string, unknown> } {
  return { name: "write_file", args: { path, content } };
}

/** `write_plan` → per task `write_file(test)`, `write_file(impl)`, stop. Exactly sized, no slack. */
function scriptedHappyPath(): FakeReply[] {
  return [
    { toolCalls: [{ name: "write_plan", args: planToolArgs(planArgs()), id: "plan_1" }], stopReason: "tool_use" },
    // Task 1 — useCards (dependency-free, planned first by topological order).
    { toolCalls: [write(SECOND_RED_FILE, "import { useCards } from './useCards';\n\nit('returns an array', () => { expect(Array.isArray(useCards())).toBe(true); });\n")], stopReason: "tool_use" },
    { toolCalls: [write(SECOND_GREEN_FILE, "export interface Card { id: string; label: string }\n\nexport function useCards(): Card[] { return []; }\n")], stopReason: "tool_use" },
    { text: "Task 1 written.", toolCalls: [], stopReason: "stop" },
    // Task 2 — CardGrid (depends on task 1).
    { toolCalls: [write(RED_FILE, "import { CardGrid } from './CardGrid';\n\nit('renders one card per item', () => { expect(CardGrid).toBeTypeOf('function'); });\n")], stopReason: "tool_use" },
    { toolCalls: [write(GREEN_FILE, "import { useCards } from './useCards';\n\nexport function CardGrid() { return useCards().map((card) => card.label).join(''); }\n")], stopReason: "tool_use" },
    { text: "Task 2 written.", toolCalls: [], stopReason: "stop" },
  ];
}

/** Every directory name found anywhere under `dir`, so a stray phase dump is catchable. */
function directoryNames(dir: string): string[] {
  const found: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      found.push(entry.name);
      walk(join(current, entry.name));
    }
  };
  if (existsSync(dir)) walk(dir);
  return found;
}

describe("CLI pipeline — one run() through the plan and work skills, offline", () => {
  let tempDir: string;
  let specPath: string;
  let outDir: string;
  let artifactsDir: string;
  let logs: string[];
  let errors: string[];
  let fetchSpy: { calls: number };
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    tempDir = mkdtempSync("pipeline-skills-test-");
    specPath = join(tempDir, "card-wall.md");
    outDir = resolve(tempDir, "generated-app");
    artifactsDir = resolve(tempDir, "artifacts");
    writeFileSync(specPath, SPEC, "utf8");

    logs = [];
    errors = [];

    // Zero-network proof: any HTTP attempt through fetch throws AND is counted.
    originalFetch = globalThis.fetch;
    fetchSpy = { calls: 0 };
    globalThis.fetch = ((input: unknown) => {
      fetchSpy.calls += 1;
      throw new Error(`offline test attempted a network call: ${String(input)}`);
    }) as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    rmSync(tempDir, { recursive: true, force: true });
  });

  /** argv shared by every scenario in this file. */
  function argv(extra: string[] = []): string[] {
    return [
      "--spec",
      specPath,
      "--out",
      outDir,
      "--artifacts-dir",
      artifactsDir,
      "--provider",
      "anthropic",
      ...extra,
    ];
  }

  const env = { ANTHROPIC_API_KEY: "offline-test-key-never-used" };

  /** The single task directory the run created, plus its plan-id. */
  function taskDir(): { dir: string; planId: string } {
    const tasksRoot = join(artifactsDir, "tasks");
    const planId = readdirSync(tasksRoot).filter((name) => !name.startsWith("."))[0];
    expect(planId, "one task folder per run").toBeTruthy();
    return { dir: join(tasksRoot, planId ?? ""), planId: planId ?? "" };
  }

  function planDocument(): string {
    const plansRoot = join(artifactsDir, "plans");
    const file = readdirSync(plansRoot).find((name) => name.endsWith(".md") && name !== "index.md");
    expect(file, "one plan document per run").toBeTruthy();
    return readFileSync(join(plansRoot, file ?? ""), "utf8");
  }

  function taskFiles(): Map<string, string> {
    const { dir } = taskDir();
    const map = new Map<string, string>();
    for (const name of readdirSync(dir)) {
      if (name.endsWith(".md") && name !== "index.md") map.set(name, readFileSync(join(dir, name), "utf8"));
    }
    return map;
  }

  function taskIndex(): string {
    const { dir } = taskDir();
    return readFileSync(join(dir, "index.md"), "utf8");
  }

  function taskIndexFor(planId: string): string {
    return readFileSync(join(artifactsDir, "tasks", planId, "index.md"), "utf8");
  }

  it("happy path: scaffold -> plan skill -> artifacts -> work skill per task -> recorded statuses", async () => {
    const provider = new FakeProvider({ responses: scriptedHappyPath() });

    const code = await run(argv(), {
      env,
      createProvider: () => provider,
      log: (line) => logs.push(line),
      error: (line) => errors.push(line),
    });

    expect(errors.join("\n")).toBe("");
    expect(code).toBe(EXIT_OK);

    // --- 1. the app was scaffolded, and the planned files were written by the executor ---
    expect(existsSync(join(outDir, "package.json"))).toBe(true);
    expect(existsSync(join(outDir, "src"))).toBe(true);
    for (const file of [SECOND_RED_FILE, SECOND_GREEN_FILE, RED_FILE, GREEN_FILE]) {
      expect(existsSync(join(outDir, file)), `${file} written`).toBe(true);
    }

    // --- 2. the plan skill produced the plan document, in autopilot ---
    const plan = planDocument();
    expect(plan).toContain("interactionMode: autopilot");
    expect(plan).toContain("status: complete");
    expect(plan).toContain("## Implementation Units (Phased)");
    expect(plan).toContain("```mermaid");

    // --- 3. one task artifact per planned file, each closed out ---
    const artifacts = taskFiles();
    expect([...artifacts.keys()].sort()).toEqual([
      "T01-implement-usecards-ts.md",
      "T02-implement-cardgrid-tsx.md",
    ]);
    expect([...artifacts.values()].join("\n")).toContain(SECOND_GREEN_FILE);
    expect([...artifacts.values()].join("\n")).toContain(GREEN_FILE);
    for (const [name, text] of artifacts) {
      expect(text, `${name} status`).toContain("status: completed");
      expect(text, `${name} AC ticked`).toMatch(/## Acceptance Criteria\n\n- \[x\] /);
      expect(text, `${name} one AC only`).not.toMatch(/- \[ \] /);
    }

    // --- 4. the task index checklist is ticked and carries exactly one work report ---
    const index = taskIndex();
    expect(index).toContain("- [x] T01");
    expect(index).toContain("- [x] T02");
    const reportHeading = /^## Work Report — /gm;
    expect(index.match(reportHeading)?.length).toBe(1);
    expect(index).toContain("2/2 completed, 0 blocked, 0 skipped");
    expect(index).toContain("**Status:** complete");

    // --- 5. provenance: the plan skill drove request 1, the work skill drives the executor calls ---
    const plannerSystem = provider.requests[0]?.system ?? "";
    expect(plannerSystem).toContain("Workflow skill: `plan`");
    expect(plannerSystem).toContain("Compiler options:");
    const executorSystems = provider.requests.slice(1).map((r) => r.system ?? "");
    expect(executorSystems.length).toBe(6);
    for (const system of executorSystems) {
      expect(system).toContain("Workflow skill: `work`");
      expect(system).not.toContain("Workflow skill: `plan`");
    }
    // The executor was told which artifact it was executing, on the first ask of each task.
    const asks = provider.requests.slice(1).map((r) => (r.messages[0]?.role === "user" ? r.messages[0].text : ""));
    expect(asks[0]).toContain("Task artifact: ");
    expect(asks[3]).toContain("Task artifact: ");

    // --- 6. only the durable outputs were written: no phase dumps anywhere under the artifacts dir ---
    const dirs = directoryNames(artifactsDir);
    for (const forbidden of [".work", ".scope", ".research", ".design", ".triage", ".prepare", ".execute", ".review"]) {
      expect(dirs, `${forbidden} must not be written`).not.toContain(forbidden);
    }

    // --- 7. zero network, by injection spy rather than by assertion of intent ---
    expect(fetchSpy.calls).toBe(0);
    expect(provider.requests.length).toBe(7); // 1 plan + 2 tasks x 3 turns
  });

  it("re-running the pipeline refuses a dirty --out, and a fresh --out allocates the next plan-id", async () => {
    const first = new FakeProvider({ responses: scriptedHappyPath() });
    expect(
      await run(argv(), { env, createProvider: () => first, log: (l) => logs.push(l), error: (l) => errors.push(l) }),
    ).toBe(EXIT_OK);
    const planIdBefore = taskDir().planId;
    const indexBefore = taskIndex();

    // The scaffold is the run's own safety rail: it never overwrites a non-empty output, so a
    // re-run into the same --out fails loudly instead of clobbering the generated app.
    const dirty = new FakeProvider({ responses: scriptedHappyPath() });
    errors = [];
    expect(
      await run(argv(), { env, createProvider: () => dirty, log: (l) => logs.push(l), error: (l) => errors.push(l) }),
    ).toBe(EXIT_GENERATION_ERROR);
    expect(errors.join("\n")).toContain("is not empty");
    expect(dirty.requests.length).toBe(0);

    // A fresh --out runs the pipeline again; the first plan's records are left exactly as they were
    // (one report block, both tasks still ticked) and the new run takes the next plan-id.
    const secondOut = resolve(tempDir, "generated-app-2");
    const second = new FakeProvider({ responses: scriptedHappyPath() });
    expect(
      await run(argv(["--out", secondOut]), {
        env,
        createProvider: () => second,
        log: (l) => logs.push(l),
        error: (l) => errors.push(l),
      }),
    ).toBe(EXIT_OK);

    expect(taskIndexFor(planIdBefore)).toBe(indexBefore);
    const allocated = readdirSync(join(artifactsDir, "tasks")).filter((name) => !name.startsWith(".")).sort();
    expect(allocated.length).toBe(2);
    expect(allocated[0]).toBe(planIdBefore);
    expect(allocated[1]).not.toBe(planIdBefore);
    // Each plan keeps exactly one closing work report — reports are replaced in place, never stacked.
    for (const planId of allocated) {
      expect(taskIndexFor(planId).match(/^## Work Report — /gm)?.length).toBe(1);
      expect(taskIndexFor(planId)).toContain("2/2 completed, 0 blocked, 0 skipped");
    }
    expect(fetchSpy.calls).toBe(0);
  });

  it("failure path: a task that hits max-iterations ends blocked and the run exits 3", async () => {
    // The model keeps calling write_file and never stops: 2 iterations, then the loop caps.
    const provider = new FakeProvider({
      responses: [
        { toolCalls: [{ name: "write_plan", args: planToolArgs(planArgs().slice(0, 1)), id: "plan_1" }], stopReason: "tool_use" },
        { toolCalls: [write(SECOND_RED_FILE, "// unfinished\n")], stopReason: "tool_use" },
        { toolCalls: [write(SECOND_RED_FILE, "// still unfinished\n")], stopReason: "tool_use" },
      ],
    });

    const code = await run(argv(["--max-iterations", "2"]), {
      env,
      createProvider: () => provider,
      log: (line) => logs.push(line),
      error: (line) => errors.push(line),
    });

    expect(code).toBe(EXIT_GENERATION_ERROR);

    const artifacts = [...taskFiles().values()];
    expect(artifacts.length).toBe(1);
    const text = artifacts[0] ?? "";
    expect(text).toContain("status: blocked");
    expect(text).toMatch(/## Acceptance Criteria\n\n- \[ \] /);
    expect(text).toContain("## Blocked");
    expect(text).toContain("max_iterations");

    const index = taskIndex();
    expect(index).toContain("- [ ] T01");
    expect(index).toContain("0/1 completed, 1 blocked, 0 skipped");
    expect(index).toContain("**Status:** incomplete");
    expect(fetchSpy.calls).toBe(0);
  });

  it("dry run: no provider is instantiated, and the run reports the autopilot mode it would use", async () => {
    let instantiated = 0;
    const code = await run(argv(["--dry-run"]), {
      env,
      createProvider: () => {
        instantiated += 1;
        return new FakeProvider({ responses: [] }) as unknown as LlmProvider;
      },
      log: (line) => logs.push(line),
      error: (line) => errors.push(line),
    });

    expect(code).toBe(EXIT_OK);
    expect(instantiated).toBe(0);
    expect(errors.join("\n")).toBe("");
    expect(logs.join("\n")).toContain("mode=autopilot");
    expect(logs.join("\n")).toContain("tasks-always-generated=true");
    expect(logs.join("\n")).toContain(`skills=${".agents/skills"}`);
    expect(existsSync(artifactsDir)).toBe(false);
    expect(fetchSpy.calls).toBe(0);
  });

  it("configuration failure is loud and writes nothing", async () => {
    let instantiated = 0;
    const code = await run(["--spec", join(tempDir, "does-not-exist.md"), "--out", outDir], {
      env,
      createProvider: () => {
        instantiated += 1;
        return new FakeProvider({ responses: [] }) as unknown as LlmProvider;
      },
      log: (line) => logs.push(line),
      error: (line) => errors.push(line),
    });

    expect(code).toBe(EXIT_CONFIG_ERROR);
    expect(instantiated).toBe(0);
    expect(errors.join("\n")).toContain("spec file not found");
    expect(existsSync(artifactsDir)).toBe(false);
  });

  it("--skills-dir is plumbed through: an empty skill directory removes both skill blocks", async () => {
    // Proves the CLI passes `config.skillsDir` into BOTH the planner and the executor call. If
    // either call dropped the argument, that call's prompt would silently fall back to the
    // `.agents/skills` default and still render a skill block, and this test would fail.
    const provider = new FakeProvider({ responses: scriptedHappyPath() });

    const code = await run(argv(["--skills-dir", "agent/tests/__no_such_skills__"]), {
      env,
      createProvider: () => provider,
      log: (line) => logs.push(line),
      error: (line) => errors.push(line),
    });

    expect(code).toBe(EXIT_OK);
    expect(errors.join("\n")).toBe("");
    expect(provider.requests.length).toBe(7);
    for (const [i, request] of provider.requests.entries()) {
      expect(request.system ?? "", `request ${i}`).not.toContain("Workflow skill:");
    }
    // The run is still a complete plan-and-work run: degrading the skill text must not skip the
    // artifacts, the execution or the bookkeeping.
    expect(taskIndex()).toContain("2/2 completed, 0 blocked, 0 skipped");
    for (const text of taskFiles().values()) expect(text).toContain("status: completed");
    expect(fetchSpy.calls).toBe(0);
  });

  it("unwritable artifacts dir: one logged error naming the reason, the app still generated", async () => {
    // `blocker` is a regular file, so `<blocker>/artifacts` can never be created (ENOTDIR).
    const blocker = join(tempDir, "blocker");
    writeFileSync(blocker, "not a directory\n", "utf8");
    const provider = new FakeProvider({ responses: scriptedHappyPath() });

    const code = await run(
      ["--spec", specPath, "--out", outDir, "--artifacts-dir", join(blocker, "artifacts"), "--provider", "anthropic"],
      { env, createProvider: () => provider, log: (line) => logs.push(line), error: (line) => errors.push(line) },
    );

    // The failure is reported once, with its reason, and does not abort the run: the generated app
    // is the pipeline's product.
    expect(code).toBe(EXIT_OK);
    const artifactErrors = errors.filter((line) => line.includes("Plan artifacts not written"));
    expect(artifactErrors.length).toBe(1);
    expect(artifactErrors[0]).toContain("continuing with generation");
    expect(errors.filter((line) => line.includes("Pipeline error")).length).toBe(0);
    expect(existsSync(join(outDir, SECOND_GREEN_FILE))).toBe(true);
    expect(existsSync(join(blocker, "artifacts"))).toBe(false);
    // No bookkeeping was attempted against a record that does not exist.
    expect(errors.join("\n")).not.toContain("task artifact not found");
    expect(fetchSpy.calls).toBe(0);
  });

  it("the planner's answer is accepted in both write_plan shapes: {tasks:[...]} and a bare array", async () => {
    // The planner prompt asks for the declared `{ tasks: [...] }` argument; older fixtures and
    // other models send a bare array. Both must plan, execute and record identically.
    const provider = new FakeProvider({
      responses: [
        { toolCalls: [{ name: "write_plan", args: { tasks: planArgs() }, id: "plan_1" }], stopReason: "tool_use" },
        ...scriptedHappyPath().slice(1),
      ],
    });

    expect(
      await run(argv(), { env, createProvider: () => provider, log: (l) => logs.push(l), error: (l) => errors.push(l) }),
    ).toBe(EXIT_OK);

    expect(errors.join("\n")).toBe("");
    expect(taskIndex()).toContain("2/2 completed, 0 blocked, 0 skipped");
    expect([...taskFiles().values()].every((text) => text.includes("status: completed"))).toBe(true);
    expect(fetchSpy.calls).toBe(0);
  });

  it("provenance is per-request: a captured executor request carries the task's criterion before its implementation", async () => {
    const captured: CompleteRequest[] = [];
    const provider = new FakeProvider({ responses: scriptedHappyPath() });
    const original = provider.complete.bind(provider);
    provider.complete = async (request: CompleteRequest) => {
      captured.push(request);
      return original(request);
    };

    expect(
      await run(argv(), { env, createProvider: () => provider, log: (l) => logs.push(l), error: (l) => errors.push(l) }),
    ).toBe(EXIT_OK);

    const firstAsk = (captured[1]?.messages[0]?.role === "user" ? captured[1].messages[0].text : "") as string;
    // Red before Green: the test file is named before the last mention of the implementation file,
    // and the criterion is stated in the ask (matching the convention prompts.test.ts pins).
    expect(firstAsk).toContain("Acceptance Criterion");
    expect(firstAsk.indexOf(SECOND_RED_FILE)).toBeLessThan(firstAsk.lastIndexOf(SECOND_GREEN_FILE));
    expect(firstAsk).toContain("Test file for this criterion:");
    expect(firstAsk).toContain("Steps, in this order:");
  });
});
