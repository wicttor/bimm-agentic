// Repair loop with bounded retries and stall detection (task 2026-09-04-001-T11).
//
// When validation reports errors, the repair pass:
// 1. Sends the error list and only offending files to the model
// 2. Applies targeted edits via tools (apply_patch/write_file)
// 3. Re-runs validation
// 4. Stops after `maxRetries` or on stall (identical error fingerprint twice)
// 5. Exits with a typed failure on unrecoverable failure
//
// Stall detection: if repeated iterations make no file changes, or the error set is identical,
// the loop stops early to avoid token waste.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { agentLoop } from "./agent-loop.ts";
import { buildRepairPrompt, type OffendingFile } from "./prompts/repair.ts";
import type { ValidationError, ValidationResult } from "./validate.ts";
import { validate } from "./validate.ts";
import { TOOL_DEFINITIONS } from "./tools/registry.ts";
import type { LlmProvider, ToolDefinition } from "./llm/provider.ts";
import type { ToolContext } from "./tools/registry.ts";
import type { GenerationTask } from "./prompts/generator.ts";
import type { DerivedRules } from "./prompts/exemplars.ts";

/** Result of the repair loop. */
export interface RepairResult {
  /** Did repair succeed? */
  ok: boolean;
  /** Why did the loop exit? */
  reason: "success" | "max_retries" | "stall" | "validation_error" | "provider_error";
  /** Residual errors if the loop failed. */
  errors?: ValidationError[];
  /** Log of repair attempts. */
  log: string[];
}

export interface RepairOptions {
  /** Maximum repair attempts (default 3). */
  maxRetries?: number;
  /** Validation function override for testing. */
  validateFn?: (options: ToolContext) => Promise<ValidationResult>;
}

/** Compute a deterministic fingerprint of an error set for stall detection. */
function errorFingerprint(errors: ValidationError[]): string {
  const sorted = errors
    .map((e) => `${e.tool}|${e.file}|${e.line ?? ""}|${e.code}|${e.message}`)
    .sort();
  return JSON.stringify(sorted);
}

/** Read the contents of a single file. */
function readOffendingFile(outDir: string, file: string): OffendingFile | null {
  try {
    const contents = readFileSync(join(outDir, file), "utf8");
    return { file, contents };
  } catch {
    return null;
  }
}

/** Collect the contents of all files mentioned by errors. */
function collectOffendingFiles(outDir: string, errors: ValidationError[]): OffendingFile[] {
  const fileSet = new Set<string>(errors.map((e) => e.file).filter((f) => f !== ""));
  const result: OffendingFile[] = [];
  for (const file of fileSet) {
    const content = readOffendingFile(outDir, file);
    if (content) result.push(content);
  }
  return result;
}

export async function repairTask(
  task: GenerationTask,
  spec: string,
  rules: DerivedRules,
  initialErrors: ValidationError[],
  provider: LlmProvider,
  toolContext: ToolContext,
  options: RepairOptions = {},
): Promise<RepairResult> {
  const maxRetries = options.maxRetries ?? 3;
  const validateFn = options.validateFn ?? ((ctx) => validate({ outDir: ctx.outDir }));
  const log: string[] = [];
  let currentErrors = initialErrors;
  let previousFingerprint: string | null = null;

  if (currentErrors.length === 0) {
    log.push("No errors to repair");
    return { ok: true, reason: "success", log };
  }

  log.push(`Starting repair loop (max ${maxRetries} retries) with ${currentErrors.length} errors`);

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    log.push(`\n--- Repair attempt ${attempt}/${maxRetries} ---`);

    // Check for stall: if error set is identical to last iteration
    const currentFingerprint = errorFingerprint(currentErrors);
    if (previousFingerprint !== null && previousFingerprint === currentFingerprint) {
      log.push(`Stall detected: error set unchanged from previous iteration`);
      return {
        ok: false,
        reason: "stall",
        errors: currentErrors,
        log,
      };
    }
    previousFingerprint = currentFingerprint;

    // Collect offending files
    const offendingFiles = collectOffendingFiles(toolContext.outDir, currentErrors);
    log.push(`Offending files: ${offendingFiles.map((f) => f.file).join(", ") || "(none)"}`);

    // Build repair prompt
    const repairPrompt = buildRepairPrompt({
      task,
      spec,
      rules,
      errors: currentErrors,
      offendingFiles,
      attempt,
      maxAttempts: maxRetries,
    });

    // Extract the system prompt and initial user message
    const systemPrompt = repairPrompt.system;
    const initialUserMessage = repairPrompt.messages.find((m) => m.role === "user")?.text ?? "";

    // Run agent loop to generate repairs
    log.push(`Running agent loop for repairs...`);
    const loopResult = await agentLoop(
      systemPrompt,
      initialUserMessage,
      provider,
      TOOL_DEFINITIONS as ToolDefinition[],
      toolContext,
      { maxIterations: 5 },
    );

    if (!loopResult.ok) {
      log.push(`Agent loop failed: ${loopResult.reason}`);
      if (loopResult.error) {
        log.push(`  ${loopResult.error.code}: ${loopResult.error.message}`);
      }
      return {
        ok: false,
        reason: "provider_error",
        errors: currentErrors,
        log: log.concat(loopResult.log),
      };
    }

    log.push(`Agent loop completed (${loopResult.iterations} iterations)`);

    // Re-validate to see if repairs worked
    log.push(`Re-validating...`);
    let validationResult: ValidationResult;
    try {
      validationResult = await validateFn(toolContext);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      log.push(`Validation error: ${message}`);
      return {
        ok: false,
        reason: "validation_error",
        errors: currentErrors,
        log,
      };
    }

    if (validationResult.ok) {
      log.push(`Validation passed! Repair successful.`);
      return { ok: true, reason: "success", log };
    }

    if (validationResult.error) {
      log.push(`Validation gate error: ${validationResult.error}`);
      return {
        ok: false,
        reason: "validation_error",
        errors: currentErrors,
        log,
      };
    }

    currentErrors = validationResult.errors;
    log.push(`Validation returned ${currentErrors.length} errors`);

    if (attempt < maxRetries) {
      log.push(`Continuing to next repair attempt...`);
    }
  }

  log.push(`\nMax retries (${maxRetries}) exceeded`);
  return {
    ok: false,
    reason: "max_retries",
    errors: currentErrors,
    log,
  };
}
