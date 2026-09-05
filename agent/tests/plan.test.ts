// AC tests for the planner (task 2026-09-04-001-T08).
//
// AC under test:
//   Given a spec and stubbed provider response, the planner returns a validated task list
//   in topological order, rejects invalid response with exactly one corrective re-ask, and
//   fails on dependency cycles.

import { describe, expect, it } from "vitest";

import { deriveRules } from "../src/prompts/exemplars.ts";
import { plan, type PlanError } from "../src/plan.ts";
import { FakeProvider } from "../src/llm/fake.ts";

const SPEC = `
Display a list of cars from the GraphQL API.
Users can filter by make and model.
Users can click a car to see its details in a modal.
`;

describe("Planner — spec to dependency-ordered task plan", () => {
  it("returns a topologically-sorted task list for valid input", async () => {
    // A valid 5-task plan where hook comes before consumers.
    const validPlan = [
      { file: "src/hooks/useCars.ts", purpose: "Fetch cars from API", dependsOn: [], exports: ["useCars"] },
      { file: "src/components/CarCard.tsx", purpose: "Display one car", dependsOn: ["src/hooks/useCars.ts"], exports: ["CarCard"] },
      { file: "src/components/CarList.tsx", purpose: "List all cars with filter", dependsOn: ["src/hooks/useCars.ts", "src/components/CarCard.tsx"], exports: ["CarList"] },
      { file: "src/components/CarModal.tsx", purpose: "Car detail modal", dependsOn: ["src/components/CarCard.tsx"], exports: ["CarModal"] },
      { file: "src/App.tsx", purpose: "App shell", dependsOn: ["src/components/CarList.tsx", "src/components/CarModal.tsx"], exports: [] },
    ];

    const provider = new FakeProvider({
      responses: [
        { toolCalls: [{ name: "write_plan", args: validPlan as any }] },
      ],
    });

    const rules = deriveRules({ referenceRoot: "" });
    const result = await plan({ spec: SPEC, rules, provider });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok result");
    expect(result.tasks).toHaveLength(5);
    // Verify topological order: hook before consumers
    const hookIndex = result.tasks.findIndex((t: any) => t.file === "src/hooks/useCars.ts");
    const cardIndex = result.tasks.findIndex((t: any) => t.file === "src/components/CarCard.tsx");
    const listIndex = result.tasks.findIndex((t: any) => t.file === "src/components/CarList.tsx");
    expect(hookIndex).toBeLessThan(cardIndex);
    expect(hookIndex).toBeLessThan(listIndex);
    expect(cardIndex).toBeLessThan(listIndex);
  });

  it("rejects invalid JSON with a single re-ask error", async () => {
    // First response: prose instead of JSON (invalid)
    // Second response: valid JSON after correction
    const validPlan = [
      { file: "src/hooks/useCars.ts", purpose: "Fetch cars", dependsOn: [], exports: ["useCars"] },
      { file: "src/App.tsx", purpose: "App shell", dependsOn: ["src/hooks/useCars.ts"], exports: [] },
    ];

    const provider = new FakeProvider({
      responses: [
        { text: "I will create a hook and an app component." }, // Invalid: prose, not JSON
        { toolCalls: [{ name: "write_plan", args: validPlan as any }] }, // Valid: re-ask succeeds
      ],
    });

    const rules = deriveRules({ referenceRoot: "" });
    const result = await plan({ spec: SPEC, rules, provider });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok result");
    expect(result.tasks).toHaveLength(2);
    // Verify it made exactly 2 requests (initial + 1 re-ask)
    expect(provider.requests).toHaveLength(2);
  });

  it("detects cycles and fails with named cycle members", async () => {
    // Cycle: A -> B -> C -> A
    const cyclicPlan = [
      { file: "src/A.ts", purpose: "A", dependsOn: ["src/C.ts"], exports: ["A"] },
      { file: "src/B.ts", purpose: "B", dependsOn: ["src/A.ts"], exports: ["B"] },
      { file: "src/C.ts", purpose: "C", dependsOn: ["src/B.ts"], exports: ["C"] },
    ];

    const provider = new FakeProvider({
      responses: [
        { toolCalls: [{ name: "write_plan", args: cyclicPlan as any }] },
      ],
    });

    const rules = deriveRules({ referenceRoot: "" });
    const result = await plan({ spec: SPEC, rules, provider });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected error result");
    const error = result.error as PlanError;
    expect(error.code).toBe("cycle_detected");
    expect(error.message).toContain("src/A.ts");
    expect(error.message).toContain("src/B.ts");
    expect(error.message).toContain("src/C.ts");
  });

  it("forces write_plan tool call (not free text)", async () => {
    const validPlan = [
      { file: "src/hooks/useCars.ts", purpose: "Fetch cars", dependsOn: [], exports: ["useCars"] },
      { file: "src/App.tsx", purpose: "App shell", dependsOn: ["src/hooks/useCars.ts"], exports: [] },
    ];

    const provider = new FakeProvider({
      responses: [
        { toolCalls: [{ name: "write_plan", args: validPlan as any }] },
      ],
    });

    const rules = deriveRules({ referenceRoot: "" });
    await plan({ spec: SPEC, rules, provider });

    // Check that the request includes write_plan in tools and forces it
    const request = provider.requests[0];
    if (!request) throw new Error("Expected at least one request");
    expect(request.tools).toBeDefined();
    const writePlanTool = request.tools?.find((t) => t.name === "write_plan");
    expect(writePlanTool).toBeDefined();
  });

  it("handles missing dependsOn field (treats as empty) with re-ask", async () => {
    const planWithoutDependsOn = [
      { file: "src/A.ts", purpose: "A", exports: ["A"] },
      { file: "src/B.ts", purpose: "B", dependsOn: ["src/A.ts"], exports: ["B"] },
    ];

    const correctedPlan = [
      { file: "src/A.ts", purpose: "A", dependsOn: [], exports: ["A"] },
      { file: "src/B.ts", purpose: "B", dependsOn: ["src/A.ts"], exports: ["B"] },
    ];

    const provider = new FakeProvider({
      responses: [
        { toolCalls: [{ name: "write_plan", args: planWithoutDependsOn as any }] }, // Invalid: missing dependsOn in first task
        { toolCalls: [{ name: "write_plan", args: correctedPlan as any }] }, // Valid: corrected with dependsOn
      ],
    });

    const rules = deriveRules({ referenceRoot: "" });
    const result = await plan({ spec: SPEC, rules, provider });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok result");
    expect(result.tasks).toHaveLength(2);
  });

  it("rejects schema-invalid task objects with re-ask", async () => {
    // First response: missing required field (file)
    // Second response: valid
    const validPlan = [
      { file: "src/A.ts", purpose: "A", dependsOn: [], exports: ["A"] },
    ];

    const provider = new FakeProvider({
      responses: [
        { toolCalls: [{ name: "write_plan", args: [{ purpose: "Missing file", dependsOn: [], exports: [] }] as any }] }, // Invalid: no file
        { toolCalls: [{ name: "write_plan", args: validPlan as any }] },
      ],
    });

    const rules = deriveRules({ referenceRoot: "" });
    const result = await plan({ spec: SPEC, rules, provider });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok result");
    expect(result.tasks).toHaveLength(1);
  });

  it("rejects non-array response with re-ask", async () => {
    const validPlan = [
      { file: "src/A.ts", purpose: "A", dependsOn: [], exports: ["A"] },
    ];

    const provider = new FakeProvider({
      responses: [
        { toolCalls: [{ name: "write_plan", args: { file: "src/A.ts" } as any }] }, // Invalid: not an array
        { toolCalls: [{ name: "write_plan", args: validPlan as any }] },
      ],
    });

    const rules = deriveRules({ referenceRoot: "" });
    const result = await plan({ spec: SPEC, rules, provider });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok result");
    expect(result.tasks).toHaveLength(1);
  });
});
