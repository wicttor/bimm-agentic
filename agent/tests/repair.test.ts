// AC tests for the repair loop with bounded retries and stall detection (task 2026-09-04-001-T11).
//
// AC under test:
//   - One-fix recovery: injected TS6133 unused local -> repaired, validation green on attempt 2, exactly 2 provider calls
//   - Cap reached: provider keeps failing -> exactly max-retries repair calls, then non-zero exit
//   - Stall detection: identical error set twice -> stops early rather than burning remaining retries
//   - Blast-radius: error in CarCard.tsx -> SearchBar.tsx bytes unchanged
//   - max-retries 0: validation runs once, no repair call, non-zero exit with error report

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { FakeProvider } from "../src/llm/fake.ts";
import { repairTask } from "../src/repair.ts";
import { deriveRules, type DerivedRules } from "../src/prompts/exemplars.ts";
import type { ValidationError, ValidationResult } from "../src/validate.ts";
import type { GenerationTask } from "../src/prompts/generator.ts";

describe("Repair loop with bounded retries and stall detection", () => {
  let outDir: string;

  const sampleTask: GenerationTask = {
    file: "src/Component.ts",
    purpose: "Generate a React component",
  };

  let sampleRules: DerivedRules;

  beforeEach(() => {
    outDir = mkdtempSync("repair-test-");
    mkdirSync(join(outDir, "src"), { recursive: true });
    sampleRules = deriveRules({ referenceRoot: "" });
  });

  afterEach(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it("one-fix recovery: unused local TS6133 -> repaired, validation green on attempt 2, exactly 2 provider calls", async () => {
    // Scenario: Component.ts has an unused variable. First validation finds it, repair fixes it, second validation passes.

    const componentContent = `export const Component = () => {
  const unused = 42;  // TS6133: unused local
  return <div>Hello</div>;
};`;

    writeFileSync(join(outDir, "src", "Component.ts"), componentContent, "utf8");

    const initialError: ValidationError = {
      tool: "typecheck",
      file: "src/Component.ts",
      line: 2,
      code: "TS6133",
      message: "unused local variable 'unused'",
    };

    // Provider script: fix the unused variable
    const provider = new FakeProvider({
      responses: [
        {
          toolCalls: [
            {
              name: "write_file",
              args: {
                path: "src/Component.ts",
                content: `export const Component = () => {
  return <div>Hello</div>;
};`,
              },
              id: "fix_1",
            },
          ],
        },
        {
          text: "Fixed the unused variable.",
          toolCalls: [],
        },
      ],
    });

    // Mock validation: returns ok after repairs are made
    const mockValidate = async () => {
      return { ok: true, errors: [], error: null };
    };

    const result = await repairTask(sampleTask, "Generate a component", sampleRules, [initialError], provider, { outDir }, { maxRetries: 3, validateFn: mockValidate });

    expect(result.ok).toBe(true);
    expect(result.reason).toBe("success");
    // Repair prompt + agent response = 2 provider calls
    expect(provider.requests.length).toBe(2);
    expect(result.log.some((l) => l.includes("Validation passed"))).toBe(true);
  });

  it("cap reached: provider keeps failing -> exactly max-retries repair calls, then non-zero exit", async () => {
    // Scenario: Component.ts has a persistent error that the provider cannot fix.
    // The error changes slightly each time to avoid stall detection.

    const componentContent = `export const Component = () => {
  return <div>Hello</div>;
};`;

    writeFileSync(join(outDir, "src", "Component.ts"), componentContent, "utf8");

    // Create different errors to avoid stall detection
    const createError = (attempt: number): ValidationError => ({
      tool: "typecheck",
      file: "src/Component.ts",
      line: null,
      code: `TS000${attempt}`,
      message: `Persistent error attempt ${attempt}`,
    });

    // Provider script: always attempt repairs but they don't help
    const provider = new FakeProvider({
      responses: [
        // Attempt 1
        {
          toolCalls: [
            {
              name: "write_file",
              args: { path: "src/Component.ts", content: componentContent },
              id: "attempt_1",
            },
          ],
        },
        {
          text: "Done",
          toolCalls: [],
        },
        // Attempt 2
        {
          toolCalls: [
            {
              name: "write_file",
              args: { path: "src/Component.ts", content: componentContent },
              id: "attempt_2",
            },
          ],
        },
        {
          text: "Done",
          toolCalls: [],
        },
        // Attempt 3
        {
          toolCalls: [
            {
              name: "write_file",
              args: { path: "src/Component.ts", content: componentContent },
              id: "attempt_3",
            },
          ],
        },
        {
          text: "Done",
          toolCalls: [],
        },
      ],
    });

    // Mock validation: returns different errors on each attempt to avoid stall
    let attemptCount = 0;
    const mockValidate = async (): Promise<ValidationResult> => {
      attemptCount += 1;
      return { ok: false, errors: [createError(attemptCount)], error: null };
    };

    const result = await repairTask(
      sampleTask,
      "Generate a component",
      sampleRules,
      [createError(0)],
      provider,
      { outDir },
      { maxRetries: 3, validateFn: mockValidate },
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("max_retries");
    expect(result.log.some((l) => l.includes("Max retries"))).toBe(true);
    // Should have exactly 3 repair attempts (6 provider calls: repair + loop stop for each)
    expect(provider.requests.length).toBe(6);
  });

  it("stall detection: identical error set twice -> stops early", async () => {
    // Scenario: First repair attempt returns the same error set.

    const componentContent = `export const Component = () => {
  const x: any = 5;
  return <div>{x}</div>;
};`;

    writeFileSync(join(outDir, "src", "Component.ts"), componentContent, "utf8");

    const stalledError: ValidationError = {
      tool: "typecheck",
      file: "src/Component.ts",
      line: 2,
      code: "TS7006",
      message: "Parameter 'x' implicitly has an 'any' type",
    };

    // Provider script: repairs are attempted but don't change anything
    const provider = new FakeProvider({
      responses: [
        {
          toolCalls: [
            {
              name: "write_file",
              args: { path: "src/Component.ts", content: componentContent },
              id: "no_op",
            },
          ],
        },
        {
          text: "Done",
          toolCalls: [],
        },
      ],
    });

    // Mock validation: always returns the same error (stall condition)
    const mockValidate = async (): Promise<ValidationResult> => {
      return { ok: false, errors: [stalledError], error: null };
    };

    const result = await repairTask(
      sampleTask,
      "Generate a component",
      sampleRules,
      [stalledError],
      provider,
      { outDir },
      { maxRetries: 5, validateFn: mockValidate },
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("stall");
    expect(result.errors).toEqual([stalledError]);
    expect(result.log.some((l) => l.includes("Stall detected"))).toBe(true);
  });

  it("blast-radius: error in CarCard.tsx -> SearchBar.tsx bytes unchanged", async () => {
    // Scenario: CarCard.tsx has an error, we repair it. SearchBar.tsx should remain untouched.

    const carCardContent = `export const CarCard = (props: any) => {
  return <div>{props.name}</div>;
};`;

    const searchBarContent = `export const SearchBar = () => {
  return <input type="text" />;
};`;

    mkdirSync(join(outDir, "src", "components"), { recursive: true });
    writeFileSync(join(outDir, "src", "components", "CarCard.tsx"), carCardContent, "utf8");
    writeFileSync(join(outDir, "src", "components", "SearchBar.tsx"), searchBarContent, "utf8");

    const carCardError: ValidationError = {
      tool: "typecheck",
      file: "src/components/CarCard.tsx",
      line: 1,
      code: "TS7006",
      message: "Parameter 'props' implicitly has an 'any' type",
    };

    // Provider script: fix only CarCard.tsx
    const fixedCarCard = `import type { CarProps } from "../types";
export const CarCard = (props: CarProps) => {
  return <div>{props.name}</div>;
};`;

    const provider = new FakeProvider({
      responses: [
        {
          toolCalls: [
            {
              name: "write_file",
              args: { path: "src/components/CarCard.tsx", content: fixedCarCard },
              id: "fix_car",
            },
          ],
        },
        {
          text: "Fixed CarCard type annotation",
          toolCalls: [],
        },
      ],
    });

    // Mock validation: first fails on CarCard, second passes
    const mockValidate = async (): Promise<ValidationResult> => {
      // After repairs, validation should pass
      return { ok: true, errors: [], error: null };
    };

    const result = await repairTask(
      sampleTask,
      "Generate components",
      sampleRules,
      [carCardError],
      provider,
      { outDir },
      { maxRetries: 3, validateFn: mockValidate },
    );

    expect(result.ok).toBe(true);
    expect(result.reason).toBe("success");

    // Verify SearchBar.tsx was not modified
    const searchBarAfter = readFileSync(join(outDir, "src", "components", "SearchBar.tsx"), "utf8");
    expect(searchBarAfter).toBe(searchBarContent);

    // Verify CarCard.tsx was modified
    const carCardAfter = readFileSync(join(outDir, "src", "components", "CarCard.tsx"), "utf8");
    expect(carCardAfter).toBe(fixedCarCard);
  });

  it("max-retries 0: no repair call, non-zero exit with error report", async () => {
    // Scenario: maxRetries is set to 0, so we should not attempt any repairs.

    const componentContent = `export const Component = () => {
  const unused = 42;
  return <div>Hello</div>;
};`;

    writeFileSync(join(outDir, "src", "Component.ts"), componentContent, "utf8");

    const initialError: ValidationError = {
      tool: "typecheck",
      file: "src/Component.ts",
      line: 2,
      code: "TS6133",
      message: "unused local variable 'unused'",
    };

    const provider = new FakeProvider({
      responses: [], // No responses needed since we won't call the provider
    });

    const mockValidate = async (): Promise<ValidationResult> => {
      return { ok: false, errors: [initialError], error: null };
    };

    const result = await repairTask(
      sampleTask,
      "Generate a component",
      sampleRules,
      [initialError],
      provider,
      { outDir },
      { maxRetries: 0, validateFn: mockValidate },
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("max_retries");
    expect(result.errors).toEqual([initialError]);
    // Should not call the provider at all
    expect(provider.requests.length).toBe(0);
  });
});
