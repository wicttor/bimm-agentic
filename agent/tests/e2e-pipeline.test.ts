// End-to-end pipeline test (task 2026-09-04-001-T13).
//
// Demonstrates the full generation pipeline:
// 1. Scaffold creates the output directory
// 2. Plan decomposes the spec into tasks
// 3. Generate runs agent loop for each task
// 4. Output is validated and committed as a sample
//
// Uses a FakeProvider with scripted responses to simulate code generation.

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { scaffold } from "../src/scaffold.ts";
import { plan } from "../src/plan.ts";
import { generate } from "../src/generator.ts";
import { deriveRules } from "../src/prompts/exemplars.ts";
import { FakeProvider } from "../src/llm/fake.ts";

describe("End-to-end generation pipeline", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync("e2e-pipeline-test-");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("pipeline: scaffold → plan → generate produces output files", async () => {
    const repoRoot = resolve(__dirname, "..", "..");
    const outputDir = resolve(tempDir, "generated-app");

    // 1. Scaffold
    const scaffoldResult = scaffold(repoRoot, outputDir);
    expect(scaffoldResult.ok).toBe(true);
    expect(existsSync(resolve(outputDir, "src"))).toBe(true);
    expect(existsSync(resolve(outputDir, "package.json"))).toBe(true);

    // 2. Read spec
    const specPath = resolve(repoRoot, "specs/car-inventory.md");
    const spec = readFileSync(specPath, "utf8");

    // 3. Derive rules
    const rules = deriveRules({ referenceRoot: repoRoot });
    expect(rules).toBeDefined();
    expect(rules.types.length).toBeGreaterThan(0);
    expect(rules.operations.length).toBeGreaterThan(0);

    // 4. Plan with FakeProvider
    // Create a simple fake response for the planner
    const planTasks = [
      {
        file: "src/useCars.ts",
        purpose: "GraphQL hook for car data",
        dependsOn: [] as string[],
        exports: ["useCars"],
      },
      {
        file: "src/CarList.tsx",
        purpose: "Car list component using the hook",
        dependsOn: ["src/useCars.ts"],
        exports: ["CarList"],
      },
    ];

    const plannerProvider = new FakeProvider({
      responses: [
        {
          toolCalls: [
            {
              name: "write_plan",
              args: planTasks as unknown as Record<string, unknown>,
              id: "plan_1",
            },
          ],
          stopReason: "tool_use" as const,
        },
      ],
    });

    const planResult = await plan({
      spec,
      rules,
      provider: plannerProvider,
    });

    expect(planResult.ok).toBe(true);
    if (!planResult.ok) throw new Error("Plan failed");
    const tasks = planResult.tasks;
    expect(tasks.length).toBe(2);
    
    const task0 = tasks[0];
    const task1 = tasks[1];
    expect(task0).toBeDefined();
    expect(task1).toBeDefined();
    
    if (task0) {
      expect(task0.file).toBe("src/useCars.ts");
    }
    if (task1) {
      expect(task1.file).toBe("src/CarList.tsx");
      if (task1.dependsOn) {
        expect(task1.dependsOn).toContain("src/useCars.ts");
      }
    }

    // 5. Generate with FakeProvider
    // Create responses that generate simple hook and component code
    const generatorProvider = new FakeProvider({
      responses: [
        // Response 1: useCars hook
        {
          toolCalls: [
            {
              name: "write_file",
              args: {
                path: "src/useCars.ts",
                content: `import { useQuery } from "@apollo/client";
import { GET_CARS } from "@/graphql/queries";

export interface Car {
  id: string;
  make: string;
  model: string;
  year: number;
}

export function useCars() {
  const { data, loading, error } = useQuery<{ cars: Car[] }>(GET_CARS);
  return {
    cars: data?.cars ?? [],
    loading,
    error: error?.message,
  };
}
`,
              },
              id: "write_1",
            },
          ],
          stopReason: "tool_use" as const,
        },
        // Response 2: acknowledge write
        {
          text: "Hook created successfully",
          toolCalls: [],
          stopReason: "stop" as const,
        },
        // Response 3: CarList component
        {
          toolCalls: [
            {
              name: "write_file",
              args: {
                path: "src/CarList.tsx",
                content: `import { useCars } from "./useCars";
import { Card, CardContent, Typography, Box } from "@mui/material";

export function CarList() {
  const { cars, loading, error } = useCars();

  if (loading) return <Typography>Loading...</Typography>;
  if (error) return <Typography color="error">{error}</Typography>;

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 2 }}>
      {cars.map((car) => (
        <Card key={car.id}>
          <CardContent>
            <Typography variant="h6">
              {car.year} {car.make} {car.model}
            </Typography>
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}
`,
              },
              id: "write_2",
            },
          ],
          stopReason: "tool_use" as const,
        },
        // Response 4: acknowledge write
        {
          text: "Component created successfully",
          toolCalls: [],
          stopReason: "stop" as const,
        },
      ],
    });

    const genResult = await generate(spec, rules, generatorProvider, { outDir: outputDir }, tasks);

    expect(genResult.successCount).toBe(2);
    expect(genResult.failureCount).toBe(0);

    // Verify files were written
    const useCarsPath = resolve(outputDir, "src/useCars.ts");
    const carListPath = resolve(outputDir, "src/CarList.tsx");

    expect(existsSync(useCarsPath)).toBe(true);
    expect(existsSync(carListPath)).toBe(true);

    const useCarsContent = readFileSync(useCarsPath, "utf8");
    const carListContent = readFileSync(carListPath, "utf8");

    expect(useCarsContent).toContain("useCars");
    expect(useCarsContent).toContain("GET_CARS");
    expect(carListContent).toContain("CarList");
    expect(carListContent).toContain("useCars");

    console.log(`✓ End-to-end pipeline generated ${tasks.length} files successfully`);
  });
});
