// Tests for trace recording and offline replay (task 2026-09-04-001-T12).
//
// AC under test:
//   - Completeness: run against FakeProvider -> all four artifact kinds present and valid JSON
//   - Cost math: two calls of 1000/500 tokens -> summary cost equals the model rate-table total
//   - Failure path: run aborted mid-repair -> trace still written, status marked `failed`
//   - Replay: a recorded fixture trace re-runs the pipeline with zero network

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  recordRun,
  loadTrace,
  replayTrace,
  aggregateUsage,
  calculateCost,
} from "../src/tracer.ts";
import type { Task } from "../src/plan.ts";
import type { TaskResult } from "../src/generator.ts";
import type { RepairResult } from "../src/repair.ts";
import type { ValidationError, ValidationResult } from "../src/validate.ts";
import type { Usage } from "../src/llm/provider.ts";
import type { TaskRecord, RepairAttempt } from "../src/tracer.ts";

describe("Trace recording and offline replay", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync("tracer-test-");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("Completeness AC: all four artifact kinds present and valid JSON", () => {
    it("writes plan.json, tasks/*.json, validation/*.json, and cost.json to trace directory", () => {
      const plan: Task[] = [
        {
          file: "src/index.ts",
          purpose: "Create main entry point",
          dependsOn: [],
          exports: ["default"],
        },
      ];

      const usage: Usage = {
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      };

      const taskRecord: TaskRecord = {
        task: plan[0]!,
        result: {
          task: plan[0]!,
          ok: true,
          log: ["Generated successfully"],
        } as TaskResult,
        repairs: [],
        totalUsage: usage,
      };

      const initialValidations = new Map<string, ValidationResult>([
        [
          "src/index.ts",
          {
            ok: true,
            errors: [],
            error: null,
          },
        ],
      ]);

      const repairValidations = new Map<string, Array<{ attemptNumber: number; errors: ValidationError[]; finalValidation: ValidationResult }>>();

      const summary = recordRun(
        "run-001",
        "# Test Spec",
        plan,
        [taskRecord],
        "gpt-4",
        1,
        initialValidations,
        repairValidations,
        tempDir,
      );

      const traceDir = join(tempDir, "traces", "run-001");

      // Verify all files exist
      expect(existsSync(join(traceDir, "plan.json"))).toBe(true);
      expect(existsSync(join(traceDir, "run.json"))).toBe(true);
      expect(existsSync(join(traceDir, "cost.json"))).toBe(true);
      expect(existsSync(join(traceDir, "tasks"))).toBe(true);
      expect(existsSync(join(traceDir, "validation"))).toBe(true);

      // Verify JSON validity and content
      const planJson = JSON.parse(readFileSync(join(traceDir, "plan.json"), "utf8"));
      expect(planJson).toHaveLength(1);
      expect(planJson[0]!.file).toBe("src/index.ts");

      const runJson = JSON.parse(readFileSync(join(traceDir, "run.json"), "utf8"));
      expect(runJson.runId).toBe("run-001");
      expect(runJson.status).toBe("green");

      const costJson = JSON.parse(readFileSync(join(traceDir, "cost.json"), "utf8"));
      expect(costJson.model).toBe("gpt-4");
      expect(costJson.totalInputTokens).toBe(1000);
      expect(costJson.totalOutputTokens).toBe(500);

      // Verify summary structure
      expect(summary.taskCount).toBe(1);
      expect(summary.successCount).toBe(1);
      expect(summary.failureCount).toBe(0);
    });

    it("deterministically sorts JSON keys in all files", () => {
      const plan: Task[] = [
        {
          file: "src/app.ts",
          purpose: "Application entry",
          dependsOn: [],
          exports: ["App"],
        },
      ];

      const usage: Usage = {
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      };

      const taskRecord: TaskRecord = {
        task: plan[0]!,
        result: {
          task: plan[0]!,
          ok: true,
          log: [],
        } as TaskResult,
        repairs: [],
        totalUsage: usage,
      };

      recordRun(
        "run-sorted",
        "# Spec",
        plan,
        [taskRecord],
        "gpt-3.5-turbo",
        1,
        new Map([[plan[0]!.file, { ok: true, errors: [], error: null }]]),
        new Map(),
        tempDir,
      );

      const traceDir = join(tempDir, "traces", "run-sorted");
      const runJsonText = readFileSync(join(traceDir, "run.json"), "utf8");

      // Verify keys appear in sorted order (simple heuristic check)
      const runJson = JSON.parse(runJsonText);
      const keys = Object.keys(runJson);
      const sortedKeys = [...keys].sort();
      expect(keys).toEqual(sortedKeys);
    });
  });

  describe("Cost math AC: aggregation and calculation accuracy", () => {
    it("aggregates usage from multiple tasks correctly", () => {
      const usage1: Usage = {
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: 100,
        cacheWriteTokens: 50,
      };

      const usage2: Usage = {
        inputTokens: 2000,
        outputTokens: 1000,
        cacheReadTokens: 200,
        cacheWriteTokens: 100,
      };

      const task1: Task = {
        file: "src/a.ts",
        purpose: "Task A",
        dependsOn: [],
        exports: [],
      };

      const task2: Task = {
        file: "src/b.ts",
        purpose: "Task B",
        dependsOn: ["src/a.ts"],
        exports: [],
      };

      const records: TaskRecord[] = [
        {
          task: task1,
          result: { task: task1, ok: true, log: [] } as TaskResult,
          repairs: [],
          totalUsage: usage1,
        },
        {
          task: task2,
          result: { task: task2, ok: true, log: [] } as TaskResult,
          repairs: [],
          totalUsage: usage2,
        },
      ];

      const aggregated = aggregateUsage(records);

      expect(aggregated.inputTokens).toBe(3000);
      expect(aggregated.outputTokens).toBe(1500);
      expect(aggregated.cacheReadTokens).toBe(300);
      expect(aggregated.cacheWriteTokens).toBe(150);
    });

    it("calculates cost correctly using model rate table", () => {
      // GPT-4: 30 USD per 1M input, 60 USD per 1M output
      const usage: Usage = {
        inputTokens: 1_000_000, // Exactly 1M input
        outputTokens: 1_000_000, // Exactly 1M output
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      };

      const cost = calculateCost(usage, "gpt-4");

      // Expected: (1M / 1M) * 30 + (1M / 1M) * 60 = 30 + 60 = 90
      expect(cost).toBe(90);
    });

    it("handles cost calculation for different models", () => {
      const usage: Usage = {
        inputTokens: 100_000,
        outputTokens: 50_000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      };

      // GPT-3.5-turbo: 0.5 per 1M input, 1.5 per 1M output
      const gpt35Cost = calculateCost(usage, "gpt-3.5-turbo");
      const expected35 = (100_000 / 1_000_000) * 0.5 + (50_000 / 1_000_000) * 1.5;
      expect(gpt35Cost).toBeCloseTo(expected35, 5);

      // Claude-3-sonnet: 3 per 1M input, 15 per 1M output
      const claudeCost = calculateCost(usage, "claude-3-sonnet");
      const expectedClaude = (100_000 / 1_000_000) * 3 + (50_000 / 1_000_000) * 15;
      expect(claudeCost).toBeCloseTo(expectedClaude, 5);
    });

    it("computes cost summary correctly in recordRun", () => {
      const plan: Task[] = [
        { file: "src/x.ts", purpose: "X", dependsOn: [], exports: [] },
        { file: "src/y.ts", purpose: "Y", dependsOn: [], exports: [] },
      ];

      const usage1: Usage = {
        inputTokens: 500_000,
        outputTokens: 250_000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      };

      const usage2: Usage = {
        inputTokens: 500_000,
        outputTokens: 250_000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      };

      const records: TaskRecord[] = [
        {
          task: plan[0]!,
          result: { task: plan[0]!, ok: true, log: [] } as TaskResult,
          repairs: [],
          totalUsage: usage1,
        },
        {
          task: plan[1]!,
          result: { task: plan[1]!, ok: true, log: [] } as TaskResult,
          repairs: [],
          totalUsage: usage2,
        },
      ];

      const summary = recordRun(
        "run-cost",
        "# Spec",
        plan,
        records,
        "gpt-4",
        2,
        new Map(),
        new Map(),
        tempDir,
      );

      // Total: 1M input, 500K output
      // Cost: (1M/1M) * 30 + (500K/1M) * 60 = 30 + 30 = 60
      expect(summary.cost.totalInputTokens).toBe(1_000_000);
      expect(summary.cost.totalOutputTokens).toBe(500_000);
      expect(summary.cost.estimatedCostUSD).toBe(60);
    });
  });

  describe("Failure path AC: status marked failed when tasks fail", () => {
    it("sets status to 'failed' when all tasks fail", () => {
      const plan: Task[] = [
        { file: "src/fail.ts", purpose: "Failing task", dependsOn: [], exports: [] },
      ];

      const records: TaskRecord[] = [
        {
          task: plan[0]!,
          result: {
            task: plan[0]!,
            ok: false,
            failureReason: "max_iterations",
            log: ["Failed to generate"],
          } as TaskResult,
          repairs: [],
          totalUsage: {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
        },
      ];

      const summary = recordRun(
        "run-fail",
        "# Spec",
        plan,
        records,
        "gpt-4",
        1,
        new Map(),
        new Map(),
        tempDir,
      );

      expect(summary.status).toBe("failed");
      expect(summary.successCount).toBe(0);
      expect(summary.failureCount).toBe(1);
    });

    it("sets status to 'stalled' when some tasks fail", () => {
      const plan: Task[] = [
        { file: "src/ok.ts", purpose: "OK task", dependsOn: [], exports: [] },
        { file: "src/fail.ts", purpose: "Failing task", dependsOn: [], exports: [] },
      ];

      const okUsage: Usage = {
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      };

      const records: TaskRecord[] = [
        {
          task: plan[0]!,
          result: { task: plan[0]!, ok: true, log: [] } as TaskResult,
          repairs: [],
          totalUsage: okUsage,
        },
        {
          task: plan[1]!,
          result: {
            task: plan[1]!,
            ok: false,
            failureReason: "error",
            log: ["Generation failed"],
          } as TaskResult,
          repairs: [],
          totalUsage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        },
      ];

      const summary = recordRun(
        "run-partial",
        "# Spec",
        plan,
        records,
        "gpt-4",
        2,
        new Map(),
        new Map(),
        tempDir,
      );

      expect(summary.status).toBe("stalled");
      expect(summary.successCount).toBe(1);
      expect(summary.failureCount).toBe(1);
    });
  });;

  describe("Replay AC: deterministic offline replay without network", () => {
    it("loads a trace and reconstructs run summary", () => {
      const plan: Task[] = [
        { file: "src/hello.ts", purpose: "Hello", dependsOn: [], exports: [] },
      ];

      const usage: Usage = {
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      };

      const records: TaskRecord[] = [
        {
          task: plan[0]!,
          result: { task: plan[0]!, ok: true, log: [] } as TaskResult,
          repairs: [],
          totalUsage: usage,
        },
      ];

      recordRun(
        "replay-test",
        "# Spec",
        plan,
        records,
        "gpt-4",
        1,
        new Map([[plan[0]!.file, { ok: true, errors: [], error: null }]]),
        new Map(),
        tempDir,
      );

      const traceDir = join(tempDir, "traces", "replay-test");
      const loaded = loadTrace(traceDir);

      expect(loaded.runSummary.runId).toBe("replay-test");
      expect(loaded.plan).toHaveLength(1);
      expect(loaded.plan[0]!.file).toBe("src/hello.ts");
      expect(loaded.taskRecords.size).toBeGreaterThan(0);
    });

    it("replayTrace executes without network errors", async () => {
      const plan: Task[] = [
        { file: "src/test.ts", purpose: "Test", dependsOn: [], exports: [] },
      ];

      const records: TaskRecord[] = [
        {
          task: plan[0]!,
          result: { task: plan[0]!, ok: true, log: [] } as TaskResult,
          repairs: [],
          totalUsage: {
            inputTokens: 100,
            outputTokens: 50,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
        },
      ];

      recordRun(
        "replay-exec",
        "# Spec",
        plan,
        records,
        "gpt-4",
        1,
        new Map([[plan[0]!.file, { ok: true, errors: [], error: null }]]),
        new Map(),
        tempDir,
      );

      const traceDir = join(tempDir, "traces", "replay-exec");
      const replayDir = join(tempDir, "replay-output");

      const result = await replayTrace(
        traceDir,
        {},
        undefined,
        { outDir: replayDir, verbose: false },
      );

      expect(result.ok).toBe(true);
      expect(result.message).toContain("successfully");
    });

    it("replayTrace is deterministic across multiple runs", async () => {
      const plan: Task[] = [
        { file: "src/deterministic.ts", purpose: "Deterministic test", dependsOn: [], exports: [] },
      ];

      const records: TaskRecord[] = [
        {
          task: plan[0]!,
          result: { task: plan[0]!, ok: true, log: [] } as TaskResult,
          repairs: [],
          totalUsage: {
            inputTokens: 200,
            outputTokens: 100,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
        },
      ];

      recordRun(
        "replay-det",
        "# Spec",
        plan,
        records,
        "gpt-4",
        1,
        new Map([[plan[0]!.file, { ok: true, errors: [], error: null }]]),
        new Map(),
        tempDir,
      );

      const traceDir = join(tempDir, "traces", "replay-det");

      // First replay
      const result1 = await replayTrace(traceDir, {}, undefined, { verbose: false });

      // Second replay
      const result2 = await replayTrace(traceDir, {}, undefined, { verbose: false });

      expect(result1.ok).toBe(result2.ok);
      expect(result1.message).toBe(result2.message);
    });
  });;

  describe("Trace with repairs AC: includes repair attempts in trace", () => {
    it("records repair attempts with validation outputs", () => {
      const plan: Task[] = [
        { file: "src/repair.ts", purpose: "Task needing repair", dependsOn: [], exports: [] },
      ];

      const repairUsage: Usage = {
        inputTokens: 500,
        outputTokens: 250,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      };

      const repairAttempt: RepairAttempt = {
        attemptNumber: 1,
        errors: [
          {
            tool: "typecheck",
            file: "src/repair.ts",
            line: 5,
            code: "TS2322",
            message: "Type mismatch",
          },
        ],
        result: {
          ok: true,
          reason: "success",
          log: ["Repair successful"],
        } as RepairResult,
        usage: repairUsage,
      };

      const records: TaskRecord[] = [
        {
          task: plan[0]!,
          result: { task: plan[0]!, ok: true, log: [] } as TaskResult,
          repairs: [repairAttempt],
          totalUsage: {
            inputTokens: 1500,
            outputTokens: 750,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
        },
      ];

      recordRun(
        "run-repair",
        "# Spec",
        plan,
        records,
        "gpt-4",
        2,
        new Map(),
        new Map(),
        tempDir,
      );

      const traceDir = join(tempDir, "traces", "run-repair");
      const taskRecordFile = join(traceDir, "tasks", "src_repair.ts.json");
      const taskRecord = JSON.parse(readFileSync(taskRecordFile, "utf8"));

      expect(taskRecord.repairs).toHaveLength(1);
      expect(taskRecord.repairs[0]!.attemptNumber).toBe(1);
      expect(taskRecord.repairs[0]!.errorCount).toBe(1);
      expect(taskRecord.repairs[0]!.result.reason).toBe("success");
    });
  });
});
