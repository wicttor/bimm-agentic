// AC tests for the prompt library (task 2026-09-04-001-T07).
//
// AC under test:
//   Each prompt builder renders the boilerplate's non-negotiable rules — import the query/mutation
//   exports from `@/graphql/queries`, the shared type from `@/types`, use the `@/` alias, the
//   `__typename` fixture convention, the responsive breakpoint table, and the strict-compiler flags —
//   by reading them from the reference files rather than duplicating them as prose.
//
// The suite has two halves, each catching a different failure:
//
//   1. A **hermetic synthetic reference tree** in `os.tmpdir()`. Every claim the prompt makes has a
//      knob in that tree, so a test can turn the knob off and watch the rendered line follow. This
//      is the drift guard: a rule that survives turning its source off is prose, not derivation.
//   2. The **real repository tree**, read-only. A parser validated only against a fixture written to
//      match it proves nothing about the boilerplate the generator is actually pointed at, so the
//      AC's concrete payloads (operation exports, field list, breakpoint numbers, strict flags) are
//      asserted against the real files as well.
//
// Assertions are scoped to the rendered rule *line* rather than the whole prompt wherever an
// exemplar file could also contain the token — the exemplars are quoted verbatim, so
// "the prompt mentions GET_CARS" is not evidence the rule was derived. The one exception is the
// last suite, which asserts the inverse: that no rule payload appears anywhere in the text of the
// prompt modules themselves.

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

import {
  DEFAULT_REFERENCE_ROOT,
  deriveRules,
  renderRules,
  type DerivedRules,
  type Prompt,
} from "../src/prompts/exemplars.ts";
import { TASK_PLAN_JSON_SCHEMA, buildPlannerPrompt } from "../src/prompts/planner.ts";
import { validateTaskPlan } from "../src/plan-schema.ts";
import { buildGeneratorPrompt, type GenerationTask } from "../src/prompts/generator.ts";
import { buildRepairPrompt, type RepairPromptInput } from "../src/prompts/repair.ts";
import type { ValidationError } from "../src/validate.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

// ---------------------------------------------------------------------------
// The synthetic reference tree
// ---------------------------------------------------------------------------
// The same *shapes* as the real boilerplate (so the readers meet realistic input) with values the
// tests own: image widths, field list and tsconfig flags are all knobs.

const REFERENCE_TS_CONFIG = `${JSON.stringify(
  {
    compilerOptions: {
      target: "ES2020",
      jsx: "react-jsx",
      moduleResolution: "bundler",
      noEmit: true,
      strict: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      noUncheckedIndexedAccess: true,
      baseUrl: ".",
      paths: { "@/*": ["src/*"] },
    },
    include: ["src"],
  },
  null,
  2,
)}\n`;

const REFERENCE_PACKAGE_JSON = `${JSON.stringify(
  {
    name: "fixture-app",
    scripts: { dev: "vite", typecheck: "tsc --noEmit", test: "vitest run" },
  },
  null,
  2,
)}\n`;

const REFERENCE_TYPES = `export interface Car {
  id: string;
  make: string;
  model: string;
  year: number;
  color: string;
  mobile: string;
  tablet: string;
  desktop: string;
}
`;

const REFERENCE_QUERIES = `import { gql } from "@apollo/client";

export const GET_CARS = gql\`
  query GetCars {
    cars {
      id
      make
      model
      year
      color
      mobile
      tablet
      desktop
    }
  }
\`;

export const ADD_CAR = gql\`
  mutation AddCar(
    $make: String!
    $model: String!
    $year: Int!
    $color: String!
  ) {
    addCar(make: $make, model: $model, year: $year, color: $color) {
      id
    }
  }
\`;
`;

// The fixture image dimensions are the breakpoint source: `640` wide mobile, `1023` wide tablet.
const REFERENCE_DATA = `import type { Car } from "@/types";

export const seedCars: Car[] = [
  {
    id: "1",
    make: "Toyota",
    model: "Camry",
    year: 2024,
    color: "Silver",
    mobile: "https://placehold.co/640x360?text=Fixture+Mobile",
    tablet: "https://placehold.co/1023x576?text=Fixture+Tablet",
    desktop: "https://placehold.co/1440x810?text=Fixture+Desktop",
  },
];
`;

const REFERENCE_HANDLERS = `import { graphql, HttpResponse } from "msw";
import { seedCars } from "@/mocks/data";
import type { Car } from "@/types";

let cars: Car[] = [...seedCars];

export const handlers = [
  graphql.query("GetCars", () => {
    return HttpResponse.json({ data: { cars } });
  }),

  graphql.mutation("AddCar", () => {
    return HttpResponse.json({ data: { addCar: cars[0] } });
  }),
];
`;

// Carries no `color`, so `color` remains a field only the types file can be answering for.
const REFERENCE_COMPONENT_EXEMPLAR = `import { useQuery } from "@apollo/client";
import { Card, CardContent, Typography } from "@mui/material";
import { GET_CARS } from "@/graphql/queries";
import type { Car } from "@/types";

// SENTINEL_COMPONENT_EXEMPLAR
export default function Example() {
  const { data, loading } = useQuery<{ cars: Car[] }>(GET_CARS);
  if (loading) return null;
  return (
    <>
      {data?.cars.map((vehicle) => (
        <Card key={vehicle.id}>
          <CardContent>
            <Typography>{vehicle.year} {vehicle.make}</Typography>
          </CardContent>
        </Card>
      ))}
    </>
  );
}
`;

const REFERENCE_TEST_EXEMPLAR = `import { MockedProvider } from "@apollo/client/testing";
import { render, screen } from "@testing-library/react";
import { GET_CARS } from "@/graphql/queries";
import Example from "@/components/Example";

// SENTINEL_TEST_EXEMPLAR
const mockRows = [
  {
    id: "1",
    make: "Toyota",
    model: "Camry",
    year: 2024,
    __typename: "Car" as const,
  },
];

const mocks = [{ request: { query: GET_CARS }, result: { data: { cars: mockRows } } }];

describe("Example", () => {
  it("renders", async () => {
    render(
      <MockedProvider mocks={mocks}>
        <Example />
      </MockedProvider>,
    );
    expect(await screen.findByText("2024 Toyota")).toBeInTheDocument();
  });
});
`;

const BASE_REFERENCE_FILES: Record<string, string> = {
  "tsconfig.json": REFERENCE_TS_CONFIG,
  "package.json": REFERENCE_PACKAGE_JSON,
  "src/types.ts": REFERENCE_TYPES,
  "src/graphql/queries.ts": REFERENCE_QUERIES,
  "src/mocks/data.ts": REFERENCE_DATA,
  "src/mocks/handlers.ts": REFERENCE_HANDLERS,
  "src/components/Example.tsx": REFERENCE_COMPONENT_EXEMPLAR,
  "src/__tests__/Example.test.tsx": REFERENCE_TEST_EXEMPLAR,
};

const tempDirs: string[] = [];

function makeReferenceTree(overrides: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), "t07-prompts-"));
  tempDirs.push(root);
  const files = { ...BASE_REFERENCE_FILES, ...overrides };
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, "utf8");
  }
  return root;
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

/**
 * Overwrite one file of an existing tree, then prove the edit landed.
 *
 * A drift guard whose mutation silently no-ops reports "the prompt ignored the file" as if it were
 * a test gap, so the read-back is part of the evidence, not decoration.
 */
function mutateReferenceFile(root: string, rel: string, content: string): void {
  writeFileSync(join(root, rel), content, "utf8");
  expect(readFileSync(join(root, rel), "utf8")).toBe(content);
}

// ---------------------------------------------------------------------------
// Prompt helpers
// ---------------------------------------------------------------------------

const CARD_TASK: GenerationTask = {
  file: "src/components/CarCard.tsx",
  purpose: "Render one vehicle as a Material UI card with its responsive image.",
  dependsOn: ["src/hooks/useCars.ts"],
  exports: ["CarCard"],
};

const HOOK_TASK: GenerationTask = {
  file: "src/__tests__/CarCard.test.tsx",
  purpose: "Cover the three viewport breakpoints.",
  exports: [],
};

function fixtureRules(overrides: Record<string, string> = {}): DerivedRules {
  return deriveRules({ referenceRoot: makeReferenceTree(overrides) });
}

function generatorText(rules: DerivedRules, task: GenerationTask = CARD_TASK): string {
  return promptText(buildGeneratorPrompt({ task, spec: "SPEC TEXT", rules }));
}

/** Every prompt is the `{ system, messages }` subset of `CompleteRequest` the builders own. */
function promptText(prompt: Prompt): string {
  const parts = [prompt.system];
  for (const message of prompt.messages) {
    parts.push(message.role === "tool" ? message.content : (message.text ?? ""));
  }
  return parts.join("\n");
}

/** The single rendered line carrying a rule; throws the test if the rule is absent or doubled. */
function ruleLine(prompt: Prompt, marker: string): string {
  const lines = promptText(prompt)
    .split("\n")
    .filter((line) => line.includes(marker));
  expect(lines, `expected exactly one line containing "${marker}"`).toHaveLength(1);
  return lines[0] as string;
}

// Markers that identify each rendered rule line. One source, so a renamed rule line breaks the
// tests that care about it instead of silently weakening them.
const RULE = {
  alias: "Path alias:",
  types: "fields:",
  operations: "already exports",
  mutationInputs: "Operation variables:",
  handlers: "already answers",
  fixtures: "must carry",
  breakpoints: "viewport",
  compiler: "Compiler options:",
} as const;

// ---------------------------------------------------------------------------
// 1. Derivation: every rule is read out of a named reference file
// ---------------------------------------------------------------------------

describe("deriveRules — reads the contract out of the reference files", () => {
  it("defaults to the repository's own boilerplate as the reference root", () => {
    // The reference tree is the read-only exemplar source, never the `--out` directory.
    expect(resolve(DEFAULT_REFERENCE_ROOT)).toBe(repoRoot);
  });

  it("derives the import alias from the app tsconfig paths", () => {
    expect(fixtureRules().alias).toEqual({ prefix: "@/", target: "src/" });
  });

  it("derives exported operations with kind and operation name", () => {
    const operations = fixtureRules().operations;
    expect(operations).toHaveLength(2);
    expect(operations[0]).toMatchObject({
      exportName: "GET_CARS",
      kind: "query",
      operationName: "GetCars",
      module: "@/graphql/queries",
    });
    expect(operations[1]).toMatchObject({
      exportName: "ADD_CAR",
      kind: "mutation",
      operationName: "AddCar",
    });
  });

  it("derives the variables a mutation form has to submit", () => {
    expect(fixtureRules().operations[1]?.variables).toEqual([
      { name: "make", type: "String!" },
      { name: "model", type: "String!" },
      { name: "year", type: "Int!" },
      { name: "color", type: "String!" },
    ]);
  });

  it("derives the shared type field list from the types file", () => {
    const rules = fixtureRules();
    expect(rules.types).toHaveLength(1);
    expect(rules.types[0]?.name).toBe("Car");
    expect(rules.types[0]?.module).toBe("@/types");
    expect(rules.types[0]?.fields.map((field) => field.name)).toEqual([
      "id",
      "make",
      "model",
      "year",
      "color",
      "mobile",
      "tablet",
      "desktop",
    ]);
  });

  it("derives the handler operations that already exist", () => {
    expect(fixtureRules().handlers).toEqual([
      { kind: "query", operationName: "GetCars" },
      { kind: "mutation", operationName: "AddCar" },
    ]);
  });

  it("derives the fixture discriminator from the test exemplar", () => {
    expect(fixtureRules().typenames).toEqual(["Car"]);
  });

  it("derives the breakpoint tiers from the fixture image widths", () => {
    const tiers = fixtureRules().breakpoints?.tiers;
    expect(tiers).toEqual([
      { field: "mobile", width: 640, height: 360, minPx: null, maxPx: 640 },
      { field: "tablet", width: 1023, height: 576, minPx: 641, maxPx: 1023 },
      { field: "desktop", width: 1440, height: 810, minPx: 1024, maxPx: null },
    ]);
  });

  it("derives the strict-compiler flags from tsconfig, keeping only the enabled ones", () => {
    expect(fixtureRules().strictFlags).toEqual([
      "strict",
      "noUnusedLocals",
      "noUnusedParameters",
      "noUncheckedIndexedAccess",
    ]);
  });

  it("derives the validation scripts from the app package.json", () => {
    expect(fixtureRules().scripts).toEqual({ typecheck: true, test: true });
  });

  it("reads exemplar files verbatim, keyed by path and `@/` module", () => {
    const exemplars = fixtureRules().exemplars;
    expect(exemplars.map((exemplar) => exemplar.module)).toEqual([
      "@/__tests__/Example.test",
      "@/components/Example",
    ]);
    expect(exemplars.map((exemplar) => exemplar.path)).toEqual([
      "src/__tests__/Example.test.tsx",
      "src/components/Example.tsx",
    ]);
    expect(exemplars[1]?.contents).toBe(REFERENCE_COMPONENT_EXEMPLAR);
  });

  it("derives tiers from whatever slot names the fixture happens to use", () => {
    // The generalization claim (T14): nothing in the derivation knows the words for the responsive
    // slots, so a boilerplate that names them differently still gets a correct table.
    const rules = fixtureRules({
      "src/mocks/data.ts":
        "export const seedRows = [\n  {\n    thumb: \"https://cdn.example.com/320x240?x=a\",\n    hero: \"https://cdn.example.com/1200x600?x=b\",\n  },\n];\n",
    });
    expect(rules.breakpoints?.tiers.map((tier) => tier.field)).toEqual(["thumb", "hero"]);
    const line = ruleLine(
      buildGeneratorPrompt({ task: CARD_TASK, spec: "SPEC TEXT", rules }),
      RULE.breakpoints,
    );
    expect(line).toContain("<= 320px");
    expect(line).toContain(">= 321px");
    expect(line).not.toContain("640");
  });

  it("records which files it read, so a run trace can show provenance", () => {
    expect(fixtureRules().sources).toEqual([
      "tsconfig.json",
      "package.json",
      "src/types.ts",
      "src/graphql/queries.ts",
      "src/mocks/data.ts",
      "src/mocks/handlers.ts",
      "src/__tests__/Example.test.tsx",
      "src/components/Example.tsx",
    ]);
  });

  it("fails loudly, naming the reference file it could not read", () => {
    const root = makeReferenceTree();
    rmSync(join(root, "src/graphql/queries.ts"), { force: true });
    expect(() => deriveRules({ referenceRoot: root })).toThrowError(/src[/\\]graphql[/\\]queries\.ts/);
  });

  it("warns instead of inventing a rule whose source has nothing in it", () => {
    const rules = fixtureRules({ "src/mocks/data.ts": "export const seedCars = [];\n" });
    expect(rules.breakpoints).toBeNull();
    expect(rules.warnings.join("\n")).toMatch(/breakpoint/i);
    expect(generatorText(rules)).toMatch(/could not be derived/i);
  });

  it("truncates an exemplar that would crowd out the rules, and says so", () => {
    const rules = fixtureRules({
      "src/components/Example.tsx": `// SENTINEL_LONG_EXEMPLAR\n${"x".repeat(7_000)}\n`,
    });
    const exemplar = rules.exemplars.find((candidate) => candidate.path.endsWith("Example.tsx"));
    expect(exemplar?.truncated).toBe(true);
    expect(exemplar?.contents.length).toBeLessThan(REFERENCE_COMPONENT_EXEMPLAR.length + 7_000);
    expect(exemplar?.contents).toContain("truncated");
    expect(exemplar?.contents).toContain("SENTINEL_LONG_EXEMPLAR");
  });

  it("warns when the tree has no exemplars to quote at all", () => {
    const root = makeReferenceTree();
    rmSync(join(root, "src/components"), { recursive: true, force: true });
    rmSync(join(root, "src/__tests__"), { recursive: true, force: true });
    const rules = deriveRules({ referenceRoot: root });
    expect(rules.exemplars).toEqual([]);
    expect(rules.warnings.join("\n")).toMatch(/exemplar/i);
  });
});

// ---------------------------------------------------------------------------
// 2. Generator prompt — AC scenario (a)
// ---------------------------------------------------------------------------

describe("buildGeneratorPrompt", () => {
  it("renders the import rule for the queries module and the component exemplar", () => {
    const prompt = buildGeneratorPrompt({ task: CARD_TASK, spec: "SPEC TEXT", rules: fixtureRules() });
    const line = ruleLine(prompt, RULE.operations);
    expect(line).toContain("@/graphql/queries");
    expect(line).toContain("GET_CARS");
    expect(promptText(prompt)).toContain("SENTINEL_COMPONENT_EXEMPLAR");
  });

  it("renders the shared-type rule with the derived module and field list", () => {
    const prompt = buildGeneratorPrompt({ task: CARD_TASK, spec: "SPEC TEXT", rules: fixtureRules() });
    const line = ruleLine(prompt, RULE.types);
    expect(line).toContain("@/types");
    expect(line).toContain("color");
    expect(line).toContain("desktop");
  });

  it("renders the alias, fixture-discriminator and breakpoint rules", () => {
    const prompt = buildGeneratorPrompt({ task: CARD_TASK, spec: "SPEC TEXT", rules: fixtureRules() });
    expect(ruleLine(prompt, RULE.alias)).toContain("@/");
    expect(ruleLine(prompt, RULE.fixtures)).toContain("__typename");
    const breakpoints = ruleLine(prompt, RULE.breakpoints);
    expect(breakpoints).toContain("640");
    expect(breakpoints).toContain("1023");
    expect(breakpoints).toContain("1024");
  });

  it("names every strict-compiler flag the reference tsconfig enables", () => {
    const line = ruleLine(
      buildGeneratorPrompt({ task: CARD_TASK, spec: "SPEC TEXT", rules: fixtureRules() }),
      RULE.compiler,
    );
    for (const flag of ["strict", "noUnusedLocals", "noUnusedParameters", "noUncheckedIndexedAccess"]) {
      expect(line).toContain(flag);
    }
    expect(line).toContain("npm run typecheck");
    expect(line).toContain("npm run test");
  });

  it("renders the variable list an operation takes, read from its own signature", () => {
    const line = ruleLine(
      buildGeneratorPrompt({ task: CARD_TASK, spec: "SPEC TEXT", rules: fixtureRules() }),
      RULE.mutationInputs,
    );
    expect(line).toContain("ADD_CAR");
    expect(line).toContain("$year: Int!");
    // The wording follows the operation's kind, which the file states.
    expect(line).toContain("mutation AddCar");
    expect(line).toContain("A form has to supply");
  });

  it("states the output contract: the task file, its purpose, and write_file with no placeholders", () => {
    const prompt = buildGeneratorPrompt({ task: CARD_TASK, spec: "SPEC TEXT", rules: fixtureRules() });
    const text = promptText(prompt);
    expect(text).toContain(CARD_TASK.file);
    expect(text).toContain(CARD_TASK.purpose);
    expect(text).toContain("write_file");
    expect(text).toMatch(/no placeholders/i);
  });

  it("includes the spec and the outputs of the tasks this one depends on", () => {
    const text = promptText(
      buildGeneratorPrompt({
        task: CARD_TASK,
        spec: "SPEC TEXT — the requirement the card has to satisfy",
        rules: fixtureRules(),
        dependencyOutputs: [
          { file: "src/hooks/useCars.ts", contents: "export function useCars() {}\n" },
        ],
      }),
    );
    expect(text).toContain("SPEC TEXT");
    expect(text).toContain("src/hooks/useCars.ts");
    expect(text).toContain("export function useCars()");
  });

  it("quotes the test exemplar for a test task and the component exemplar for a component task", () => {
    const rules = fixtureRules();
    expect(generatorText(rules, HOOK_TASK)).toContain("SENTINEL_TEST_EXEMPLAR");
    const componentText = generatorText(rules);
    expect(componentText).toContain("SENTINEL_COMPONENT_EXEMPLAR");
    expect(componentText).not.toContain("SENTINEL_TEST_EXEMPLAR");
  });

  it("keeps rules and exemplars in the system prompt and the ask in the user turn", () => {
    const prompt = buildGeneratorPrompt({ task: CARD_TASK, spec: "SPEC TEXT", rules: fixtureRules() });
    expect(prompt.system).toContain(RULE.types);
    expect(prompt.system).toContain("SENTINEL_COMPONENT_EXEMPLAR");
    expect(prompt.messages[0]?.role).toBe("user");
    const userTurn = prompt.messages[0];
    expect(userTurn?.role === "user" ? userTurn.text : "").toContain(CARD_TASK.file);
  });

  it("runs the work skill in autopilot for this one task, and never writes its phase dumps", () => {
    const prompt = buildGeneratorPrompt({ task: CARD_TASK, spec: "SPEC TEXT", rules: fixtureRules() });
    const text = promptText(prompt);

    expect(prompt.system).toContain("Workflow skill:");
    expect(prompt.system).toContain("`work`");
    expect(prompt.system).toContain("Interaction mode: **autopilot**");
    expect(prompt.system).toContain("docs/plans/.work/.triage/");
    expect(prompt.system).toContain("docs/plans/.work/.review/");
    expect(prompt.system).toContain("Phase module: execute");
    // Scoped to one task: no re-planning, no sibling tasks.
    expect(text).toContain("scoped to exactly one task");
  });

  it("is test-first: the task's test file is written before its implementation file", () => {
    const prompt = buildGeneratorPrompt({ task: CARD_TASK, spec: "SPEC TEXT", rules: fixtureRules() });
    const userTurn = prompt.messages[0];
    const text = userTurn?.role === "user" ? userTurn.text : "";

    expect(text).toContain("src/components/CarCard.test.tsx");
    expect(text).toContain("Red \u2014 Write the failing test");
    expect(text).toContain("Green \u2014 Implement");
    expect(text).toContain("3. **Refactor:**");
    expect(text).toContain("Acceptance Criterion");
    // Order is the point: the test path appears before the implementation path in the ask.
    expect(text.indexOf("CarCard.test.tsx")).toBeLessThan(text.lastIndexOf("CarCard.tsx"));
  });

  it("uses a test task's own file as its test instead of inventing a sibling", () => {
    const prompt = buildGeneratorPrompt({ task: HOOK_TASK, spec: "SPEC TEXT", rules: fixtureRules() });
    const text = promptText(prompt);
    expect(text).toContain("this task's file is its test");
    expect(text).not.toContain("CarCard.test.test.tsx");
  });

  it("honours the planner's own acceptance criterion and steps when it supplies them", () => {
    const task: GenerationTask = {
      ...CARD_TASK,
      acceptanceCriterion: "The card picks the desktop image at 1200px",
      testFile: "src/components/CarCard.pick.test.tsx",
      steps: ["RED: assert the picked src", "GREEN: implement the picker", "REFACTOR: extract the media query"],
    };
    const text = promptText(buildGeneratorPrompt({ task, spec: "SPEC TEXT", rules: fixtureRules() }));

    expect(text).toContain("The card picks the desktop image at 1200px");
    expect(text).toContain("src/components/CarCard.pick.test.tsx");
    expect(text).toContain("RED: assert the picked src");
    expect(text).toContain("REFACTOR: extract the media query");
  });

  it("can be built without skill injection, for callers that pass an empty skills dir", () => {
    const prompt = buildGeneratorPrompt({ task: CARD_TASK, spec: "SPEC TEXT", rules: fixtureRules(), skillsDir: "" });
    expect(prompt.system).not.toContain("Workflow skill:");
    expect(prompt.system).toContain(RULE.compiler);
  });
});

// ---------------------------------------------------------------------------
// 3. Planner prompt — AC scenario (b)
// ---------------------------------------------------------------------------

describe("buildPlannerPrompt", () => {
  it("instructs the model to answer with the task JSON schema", () => {
    const text = promptText(buildPlannerPrompt({ spec: "SPEC TEXT", rules: fixtureRules() }));
    expect(text).toContain("JSON");
    for (const key of ["file", "purpose", "dependsOn", "exports"]) {
      expect(text).toContain(key);
    }
  });

  it("renders the do-not-redefine rule for existing queries and handlers", () => {
    const prompt = buildPlannerPrompt({ spec: "SPEC TEXT", rules: fixtureRules() });
    expect(ruleLine(prompt, RULE.operations).toLowerCase()).toContain("do not redefine");
    expect(ruleLine(prompt, RULE.handlers)).toContain("@/mocks/handlers");
  });

  it("carries the spec it is planning against and the real operation names", () => {
    const text = promptText(
      buildPlannerPrompt({ spec: "Build an inventory manager.", rules: fixtureRules() }),
    );
    expect(text).toContain("Build an inventory manager.");
    expect(text).toContain("GetCars");
    expect(text).toContain("AddCar");
  });

  it("advertises exactly the schema it exports, so planner and validator cannot diverge", () => {
    expect(TASK_PLAN_JSON_SCHEMA.required).toEqual(["file", "purpose", "dependsOn", "exports"]);
    // The four generation keys stay the whole required set; the Tasks-phase keys are additive and
    // optional, so an answer with only the four is still a valid plan.
    expect(Object.keys(TASK_PLAN_JSON_SCHEMA.properties).sort()).toEqual([
      "acceptanceCriterion",
      "dependsOn",
      "effort",
      "exports",
      "file",
      "priority",
      "purpose",
      "steps",
      "testFile",
      "title",
      "unit",
    ]);
    // The validator is driven by this same object, so it accepts the schema's own optional keys.
    expect(
      validateTaskPlan({
        file: "src/App.tsx",
        purpose: "App shell",
        dependsOn: [],
        exports: ["App"],
        title: "Wire the app shell",
        unit: "U3",
        acceptanceCriterion: "App renders the list and the form",
        testFile: "src/App.test.tsx",
        steps: ["red", "green", "refactor"],
        priority: "P0",
        effort: "2 hours",
      }),
    ).toEqual({ ok: true });
    expect(
      validateTaskPlan({
        file: "src/App.tsx",
        purpose: "App shell",
        dependsOn: [],
        exports: ["App"],
        unknownFutureKey: { anything: true },
      }),
    ).toEqual({ ok: true });
    expect(
      validateTaskPlan({ file: "src/A.ts", purpose: "A", dependsOn: [], exports: [], steps: "red" }),
    ).not.toEqual({ ok: true });
  });

  it("runs the plan skill in autopilot: task slicing always on, no phase dumps, no questions", () => {
    const system = buildPlannerPrompt({ spec: "SPEC TEXT", rules: fixtureRules() }).system;

    expect(system).toContain("Workflow skill:");
    expect(system).toContain("`plan`");
    expect(system).toContain("Interaction mode: **autopilot**");
    expect(system).toContain("never ask a question");
    expect(system).toContain("Phase 5 (Tasks) is never skipped");
    // The one-AC / one-test invariants the Tasks phase produces.
    expect(system).toContain("One Acceptance Criterion per task");
    expect(system).toContain("One test per task");
    // Intermediate artifacts are skipped, and the skip is stated rather than assumed.
    expect(system).toContain("docs/plans/.scope/");
    expect(system).toContain("docs/plans/.research/");
    expect(system).toContain("docs/plans/.design/");
    expect(system).toContain("Do NOT write these intermediate phase artifacts");
  });

  it("carries the skill's own words, so editing the skill edits the agent", () => {
    const system = buildPlannerPrompt({ spec: "SPEC TEXT", rules: fixtureRules() }).system;
    // Phrases that exist only in .agents/skills/plan, not in this repository's prompt modules.
    expect(system).toContain("Scope -> Research -> Design -> Generate -> Tasks");
    expect(system).toContain("Phase module: generate");
    expect(system).toContain("Phase module: tasks");
  });

  it("closes with the output contract restated after the skill body", () => {
    const system = buildPlannerPrompt({ spec: "SPEC TEXT", rules: fixtureRules() }).system;
    const reminder = "Final note on output format";
    expect(system.indexOf(reminder)).toBeGreaterThan(system.indexOf("Workflow skill:"));
  });

  it("can be built without skill injection, for callers that pass an empty skills dir", () => {
    const system = buildPlannerPrompt({ spec: "SPEC TEXT", rules: fixtureRules(), skillsDir: "" }).system;
    expect(system).not.toContain("Workflow skill:");
    expect(system).toContain("Planning constraints:");
  });

  it("sends the spec as the user turn and the rules as the system prompt", () => {
    const prompt = buildPlannerPrompt({ spec: "SPEC TEXT", rules: fixtureRules() });
    expect(prompt.system).toContain(renderRules(fixtureRules()));
    const userTurn = prompt.messages[0];
    expect(userTurn?.role === "user" ? userTurn.text : "").toContain("SPEC TEXT");
  });
});

// ---------------------------------------------------------------------------
// 4. Repair prompt
// ---------------------------------------------------------------------------

describe("buildRepairPrompt", () => {
  const errors: ValidationError[] = [
    {
      tool: "typecheck",
      file: "src/components/CarCard.tsx",
      line: 12,
      code: "TS2322",
      message: "Type 'string' is not assignable to type 'number'.",
    },
    { tool: "test", file: "", line: null, code: "UNPARSEABLE_REPORT", message: "no report" },
  ];

  function repairPrompt(rules: DerivedRules, extra: Pick<RepairPromptInput, "attempt" | "maxAttempts"> = {}) {
    return buildRepairPrompt({
      task: CARD_TASK,
      spec: "SPEC TEXT",
      rules,
      errors,
      offendingFiles: [{ file: "src/components/CarCard.tsx", contents: 'const n: number = "x";\n' }],
      ...extra,
    });
  }

  it("sends the structured errors and the offending file contents", () => {
    const text = promptText(repairPrompt(fixtureRules()));
    expect(text).toContain("TS2322");
    expect(text).toContain("src/components/CarCard.tsx:12");
    expect(text).toContain("Type 'string' is not assignable to type 'number'.");
    expect(text).toContain('const n: number = "x";');
  });

  it("keeps the boilerplate contract in force during repair", () => {
    const rules = fixtureRules();
    const prompt = repairPrompt(rules);
    // Same rendered rules as generation: repair must not be the prompt that forgets the contract.
    expect(prompt.system).toContain(renderRules(rules));
    expect(ruleLine(prompt, RULE.operations)).toContain("@/graphql/queries");
  });

  it("reports an error that names no file or line without dropping it", () => {
    const text = promptText(repairPrompt(fixtureRules()));
    expect(text).toContain("UNPARSEABLE_REPORT");
    expect(text).toContain("no report");
  });

  it("asks for the smallest change and says which attempt this is", () => {
    const text = promptText(repairPrompt(fixtureRules(), { attempt: 2, maxAttempts: 3 }));
    expect(text).toMatch(/attempt 2 of 3/i);
    expect(text.toLowerCase()).toContain("smallest change");
  });

  it("falls back to the CLI's documented retry budget when the caller names no ceiling", () => {
    const text = promptText(repairPrompt(fixtureRules(), { attempt: 1 }));
    expect(text).toMatch(/attempt 1 of 3/i);
  });

  it("honours a ceiling the caller supplies explicitly", () => {
    const text = promptText(repairPrompt(fixtureRules(), { attempt: 5, maxAttempts: 7 }));
    expect(text).toMatch(/attempt 5 of 7/i);
  });

  it("marks an empty error list as a clean gate rather than rendering a phantom failure", () => {
    const text = promptText(
      buildRepairPrompt({ task: CARD_TASK, spec: "SPEC TEXT", rules: fixtureRules(), errors: [], offendingFiles: [] }),
    );
    expect(text.toLowerCase()).toContain("no validation errors");
  });
});

// ---------------------------------------------------------------------------
// 5. Drift guard — AC scenario (c): change the file, the rendered rule follows
// ---------------------------------------------------------------------------

describe("drift guard — rendered rules follow the reference files", () => {
  it("drops a type field removed from the types file, and only that field", () => {
    const root = makeReferenceTree();
    const before = buildGeneratorPrompt({
      task: CARD_TASK,
      spec: "SPEC TEXT",
      rules: deriveRules({ referenceRoot: root }),
    });
    expect(ruleLine(before, RULE.types)).toContain("color");

    mutateReferenceFile(root, "src/types.ts", REFERENCE_TYPES.replace("  color: string;\n", ""));

    const after = buildGeneratorPrompt({
      task: CARD_TASK,
      spec: "SPEC TEXT",
      rules: deriveRules({ referenceRoot: root }),
    });
    const line = ruleLine(after, RULE.types);
    expect(line).not.toContain("color");
    expect(line).toContain("make");
    expect(line).toContain("desktop");
    expect(after.system).toContain("SENTINEL_COMPONENT_EXEMPLAR");
  });

  it("drops a removed operation export from the rule that advertises it", () => {
    const rules = fixtureRules({
      "src/graphql/queries.ts": REFERENCE_QUERIES.replace(/export const GET_CARS[\s\S]*?`;/, ""),
    });
    expect(rules.operations.map((operation) => operation.exportName)).toEqual(["ADD_CAR"]);
    const prompt = buildGeneratorPrompt({ task: CARD_TASK, spec: "SPEC TEXT", rules });
    const line = ruleLine(prompt, RULE.operations);
    expect(line).not.toContain("GET_CARS");
    expect(line).toContain("ADD_CAR");
  });

  it("follows the fixture image widths when the breakpoint table moves", () => {
    const rules = fixtureRules({
      "src/mocks/data.ts": REFERENCE_DATA.replace("1023x576", "900x506").replace("640x360", "500x281"),
    });
    expect(rules.breakpoints?.tiers.map((tier) => tier.minPx)).toEqual([null, 501, 901]);
    const line = ruleLine(
      buildGeneratorPrompt({ task: CARD_TASK, spec: "SPEC TEXT", rules }),
      RULE.breakpoints,
    );
    expect(line).toContain("500");
    expect(line).toContain("501");
    expect(line).toContain("900");
    expect(line).toContain("901");
    expect(line).not.toContain("1023");
    expect(line).not.toContain("1024");
  });

  it("renumbers the table when a tier is removed from the fixtures", () => {
    const rules = fixtureRules({
      "src/mocks/data.ts": REFERENCE_DATA.replace(
        '    tablet: "https://placehold.co/1023x576?text=Fixture+Tablet",\n',
        "",
      ),
    });
    const tiers = rules.breakpoints?.tiers ?? [];
    expect(tiers.map((tier) => tier.field)).toEqual(["mobile", "desktop"]);
    expect(tiers[1]?.minPx).toBe(641);
  });

  it("stops requiring a strict flag the reference tsconfig turned off", () => {
    const rules = fixtureRules({
      "tsconfig.json": REFERENCE_TS_CONFIG.replace(
        '"noUnusedLocals": true',
        '"noUnusedLocals": false',
      ),
    });
    expect(rules.strictFlags).not.toContain("noUnusedLocals");
    const line = ruleLine(buildGeneratorPrompt({ task: CARD_TASK, spec: "SPEC TEXT", rules }), RULE.compiler);
    expect(line).not.toContain("noUnusedLocals");
    expect(line).toContain("noUnusedParameters");
  });

  it("drops the fixture-discriminator rule when the exemplar stops using one", () => {
    const rules = fixtureRules({
      "src/__tests__/Example.test.tsx": REFERENCE_TEST_EXEMPLAR.replace(
        '    __typename: "Car" as const,\n',
        "",
      ),
    });
    expect(rules.typenames).toEqual([]);
    const prompt = buildGeneratorPrompt({ task: CARD_TASK, spec: "SPEC TEXT", rules });
    expect(promptText(prompt)).not.toContain(RULE.fixtures);
    expect(promptText(prompt)).toContain(RULE.types);
  });

  it("drops the mutation-input rule when no mutation is exported", () => {
    const rules = fixtureRules({
      "src/graphql/queries.ts": REFERENCE_QUERIES.replace(/export const ADD_CAR[\s\S]*?`;/, ""),
    });
    expect(promptText(buildGeneratorPrompt({ task: CARD_TASK, spec: "SPEC TEXT", rules }))).not.toContain(
      RULE.mutationInputs,
    );
  });

  it("drops the handler rule rather than leaving stale prose when the handlers list is emptied", () => {
    const root = makeReferenceTree();
    mutateReferenceFile(root, "src/mocks/handlers.ts", "export const handlers = [];\n");
    const rules = deriveRules({ referenceRoot: root });
    expect(rules.handlers).toEqual([]);
    const text = promptText(buildPlannerPrompt({ spec: "SPEC TEXT", rules }));
    expect(text).not.toContain(RULE.handlers);
    expect(text).toMatch(/could not be derived/i);
  });

  it("drops the validation-script clause when the app defines neither script", () => {
    const rules = fixtureRules({
      "package.json": '{"name":"fixture-app","scripts":{"dev":"vite"}}\n',
    });
    const line = ruleLine(buildGeneratorPrompt({ task: CARD_TASK, spec: "SPEC TEXT", rules }), RULE.compiler);
    expect(line).not.toContain("npm run");
  });
});

// ---------------------------------------------------------------------------
// 6. The repository's own boilerplate — derivation must work on the real tree
// ---------------------------------------------------------------------------

describe("the repository's own boilerplate", () => {
  const rules = deriveRules();

  it("yields the concrete contract the AC names, read out of the real files", () => {
    expect(rules.alias).toEqual({ prefix: "@/", target: "src/" });
    expect(rules.operations.map((operation) => operation.exportName)).toEqual([
      "GET_CARS",
      "GET_CAR",
      "ADD_CAR",
    ]);
    expect(rules.types[0]?.fields.map((field) => field.name)).toEqual([
      "id",
      "make",
      "model",
      "year",
      "color",
      "mobile",
      "tablet",
      "desktop",
    ]);
    expect(rules.typenames).toEqual(["Car"]);
    expect(rules.breakpoints?.tiers).toMatchObject([
      { field: "mobile", maxPx: 640 },
      { field: "tablet", minPx: 641, maxPx: 1023 },
      { field: "desktop", minPx: 1024 },
    ]);
    for (const flag of ["strict", "noUnusedLocals", "noUnusedParameters", "noUncheckedIndexedAccess"]) {
      expect(rules.strictFlags).toContain(flag);
    }
    expect(rules.warnings).toEqual([]);
  });

  it("renders a generator prompt whose rule lines carry the real payloads", () => {
    const prompt = buildGeneratorPrompt({
      task: { file: "src/components/CarCard.tsx", purpose: "Show one vehicle as a card.", exports: [] },
      // `SPEC TEXT` rather than the real spec here: the line-scoped assertions below need exactly
      // one line per marker, and the spec prose mentions viewports and fields too. The spec's own
      // passage through the prompt is asserted in the next test.
      spec: "SPEC TEXT",
      rules,
    });
    expect(ruleLine(prompt, RULE.operations)).toContain("GET_CARS");
    expect(ruleLine(prompt, RULE.types)).toContain("import type { Car } from \"@/types\"");
    expect(ruleLine(prompt, RULE.breakpoints)).toContain("640");
    expect(ruleLine(prompt, RULE.breakpoints)).toContain("1024");
    expect(ruleLine(prompt, RULE.compiler)).toContain("noUncheckedIndexedAccess");
    expect(prompt.system).toContain("export default function Example()");
  });

  it("carries the real spec verbatim into the generator's user turn", () => {
    const spec = readFileSync(join(repoRoot, "specs/car-inventory.md"), "utf8");
    const prompt = buildGeneratorPrompt({ task: CARD_TASK, spec, rules });
    const userTurn = prompt.messages[0];
    expect(userTurn?.role === "user" ? userTurn.text.includes(spec.trim()) : false).toBe(true);
    // The reference files the rules cite are the ones in this repository, not a fixture's idea of them.
    expect(rules.sources).toContain("src/graphql/queries.ts");
    expect(prompt.system).toContain("GET_CARS (query GetCars)");
  });

  it("words the variable rule by the operation's kind, not by a template", () => {
    // The real boilerplate has a query that takes a variable, so kind-aware rendering is observable
    // here and not in the two-operation fixture.
    const prompt = buildGeneratorPrompt({ task: CARD_TASK, spec: "SPEC TEXT", rules });
    const queryLine = ruleLine(prompt, "(query GetCar) takes");
    expect(queryLine).toContain("Call it with exactly those variables");
    expect(queryLine).not.toContain("A form has to supply");
    expect(ruleLine(prompt, "(mutation AddCar) takes")).toContain("A form has to supply");
  });

  it("moves the breakpoint line when the real fixture widths are copied into a tree and edited", () => {
    const root = makeReferenceTree({
      "src/mocks/data.ts": readFileSync(join(repoRoot, "src/mocks/data.ts"), "utf8").replace(
        /1023x576/g,
        "800x450",
      ),
    });
    const prompt = buildGeneratorPrompt({
      task: CARD_TASK,
      spec: "SPEC TEXT",
      rules: deriveRules({ referenceRoot: root }),
    });
    const line = ruleLine(prompt, RULE.breakpoints);
    expect(line).toContain("800");
    expect(line).toContain("801");
    expect(line).not.toContain("1023");
  });

  it("keeps every rule payload out of the prompt modules' own text", () => {
    // The drift guard proves the prompt follows the files; this proves the converse — that no copy
    // of a payload is sitting in a builder where a stale duplicate could hide.
    const moduleFiles = [
      "agent/src/prompts/exemplars.ts",
      "agent/src/prompts/planner.ts",
      "agent/src/prompts/generator.ts",
      "agent/src/prompts/repair.ts",
    ];
    const payloads = [
      "GET_CARS",
      "ADD_CAR",
      "seedCars",
      "placehold.co",
      "noUnusedLocals",
      "noUncheckedIndexedAccess",
      "640",
      "1023",
      "1024",
    ];
    // Slot names too: the breakpoint tiers are discovered from the fixture, so a prompt module that
    // knew the words would be a prompt module that could not follow a variant spec (T14).
    const slotNames = ["mobile", "tablet", "desktop"];
    for (const file of moduleFiles) {
      const source = readFileSync(join(repoRoot, file), "utf8");
      for (const payload of payloads) {
        expect(source.includes(payload), `${file} leaks the rule payload ${payload}`).toBe(false);
      }
      for (const slot of slotNames) {
        expect(source.includes(slot), `${file} names the responsive slot ${slot}`).toBe(false);
      }
      expect(source).not.toMatch(/\bCar\b/);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Composability
// ---------------------------------------------------------------------------

describe("prompt builders compose", () => {
  it("shares one rendered rule block across planner, generator and repair", () => {
    const root = makeReferenceTree();
    expect(existsSync(join(root, "tsconfig.json"))).toBe(true);
    const rules = deriveRules({ referenceRoot: root });
    const block = renderRules(rules);
    const prompts = [
      buildPlannerPrompt({ spec: "SPEC TEXT", rules }),
      buildGeneratorPrompt({ task: CARD_TASK, spec: "SPEC TEXT", rules }),
      buildRepairPrompt({ task: CARD_TASK, spec: "SPEC TEXT", rules, errors: [], offendingFiles: [] }),
    ];
    expect(block.length).toBeGreaterThan(200);
    for (const prompt of prompts) {
      expect(prompt.system).toContain(block);
      expect(prompt.messages.length).toBeGreaterThan(0);
    }
  });

  it("returns the request subset the provider interface already accepts", () => {
    const prompt = buildPlannerPrompt({ spec: "SPEC TEXT", rules: fixtureRules() });
    // T03's adapters take `system` + `messages` verbatim, so prompts need no further shaping.
    expect(prompt.messages.length).toBeGreaterThan(0);
    expect(typeof prompt.system).toBe("string");
    expect(prompt.messages.every((message) => "role" in message)).toBe(true);
  });

  it("is loadable by the runtime that actually runs the agent", () => {
    // vitest transpiles with esbuild and `tsc` only typechecks, so both accept TypeScript that
    // Node's native type-stripping rejects — a constructor parameter property is the classic case,
    // and it parses into a *syntax* error at load time. The agent is run as `node agent/src/…`, so
    // the only meaningful check is to load these modules with the same runtime the CLI uses.
    const modules = [
      "agent/src/prompts/exemplars.ts",
      "agent/src/prompts/planner.ts",
      "agent/src/prompts/generator.ts",
      "agent/src/prompts/repair.ts",
    ];
    const probe = [
      ...modules.map((rel) => `await import(${JSON.stringify(`${repoRoot}/${rel}`)});`),
      `console.log("loaded " + ${String(modules.length)});`,
    ].join("\n");
    const stdout = execFileSync("node", ["--input-type=module", "-e", probe], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    expect(stdout.trim()).toBe(`loaded ${modules.length}`);
  });

  it("is stable: the same tree renders byte-identical rules", () => {
    const root = makeReferenceTree();
    expect(renderRules(deriveRules({ referenceRoot: root }))).toBe(
      renderRules(deriveRules({ referenceRoot: root })),
    );
  });
});
