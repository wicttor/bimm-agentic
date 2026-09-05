// Repair prompt (task 2026-09-04-001-T07).
//
// The repair loop is where generated code meets the validation gate (T06), and it is the easiest
// place in the system to lose information: a model handed "typecheck failed" rewrites the file from
// memory and breaks something that worked. So this builder hands over three things and nothing else —
// the structured errors with their code, file and line, the current contents of the offending files,
// and the same derived hard rules the generator was held to (a fix that satisfies the compiler by
// redefining a query is not a fix).
//
// Context discipline is the point. Files the errors do not name stay out of the prompt, so the loop
// cannot spend its token budget on code that is already correct, and the model cannot "helpfully"
// touch them.

import { DEFAULTS } from "../config.ts";
import type { ValidationError } from "../validate.ts";
import type { DerivedRules, Prompt } from "./exemplars.ts";
import { renderRules } from "./exemplars.ts";
import type { GenerationTask } from "./generator.ts";

/** The current text of a file implicated by an error. */
export interface OffendingFile {
  file: string;
  contents: string;
}

export interface RepairPromptInput {
  /** The task whose output failed validation; its rules and purpose still apply. */
  task: GenerationTask;
  spec: string;
  rules: DerivedRules;
  /** Straight from `validate()` — the same structured errors, not a re-summarised version. */
  errors: ValidationError[];
  /** Contents of the files the errors name. Owned by the context builder (T09). */
  offendingFiles: OffendingFile[];
  /** 1-based repair attempt; omitted when the caller has no bounded budget to report. */
  attempt?: number;
  /**
   * Ceiling for `attempt`, so the model can tell a first pass from a last one. Defaults to the
   * CLI's documented `--max-retries`, because that is the budget the loop was started with.
   */
  maxAttempts?: number;
}

function repairRole(rules: DerivedRules): string {
  return [
    "You are the repair stage of a code-generation agent. A file that was just generated failed the project's own validation gate. Your job is the smallest change that clears the reported errors — not a rewrite, not a redesign, not an improvement.",
    "",
    "How to work:",
    "- Fix what the errors below name. Do not restructure, rename an export, or touch behaviour the errors do not mention.",
    "- Do not solve an error by weakening the contract: no type assertions, no `any`, no deleted or skipped tests, no comments silencing a diagnostic, no edits to `tsconfig.json`, `package.json` or the boilerplate files the rules name.",
    "- Re-read the rules below before you edit: several failure classes below are caused by ignoring them.",
    "- Call `write_file` with the complete, corrected contents of each file you change, then stop. Files you do not rewrite stay as they are.",
    "",
    renderRules(rules),
  ].join("\n");
}

/** One rendered error line: where, what the tool called it, and what it said. */
function renderError(error: ValidationError): string {
  const location = error.file === "" ? "(no file named)" : `${error.file}${error.line === null ? "" : `:${error.line}`}`;
  return `- [${error.tool}] ${location} ${error.code}: ${error.message}`;
}

function repairUser(input: RepairPromptInput): string {
  const { errors, offendingFiles, task, attempt } = input;
  const maxAttempts = input.maxAttempts ?? DEFAULTS.maxRetries;
  const sections: string[] = [];

  if (attempt !== undefined) {
    sections.push(`Repair attempt ${attempt} of ${maxAttempts}.`, "");
  }

  sections.push(
    `The generated file \`${task.file}\` (purpose: ${task.purpose}) failed validation.`,
    "",
    errors.length === 0
      ? "No validation errors were reported — the gate itself could not be measured, which is still a failure to clear. Re-write the task's file unchanged in behaviour and confirm it satisfies the hard rules."
      : `Errors (${String(errors.length)}):`,
  );
  sections.push(...errors.map(renderError));

  if (offendingFiles.length > 0) {
    sections.push("", "Current contents of the files named by those errors:");
    for (const file of offendingFiles) {
      sections.push("", `\`\`ts path="${file.file}"\n${file.contents}\`\`\``);
    }
  } else if (errors.length > 0) {
    sections.push(
      "",
      "No file contents were supplied, so read the files you are being asked to change with `read_file` before editing them.",
    );
  }

  sections.push(
    "",
    "Specification, for context on what the code is meant to do (it is not a licence to change other behaviour):",
    "",
    input.spec.trim(),
    "",
    "Apply the smallest change that clears every error above, write the changed files with `write_file`, then stop.",
  );
  return sections.join("\n");
}

/**
 * Build the repair request.
 *
 * `errors` is passed through verbatim: a `null` line or an empty file is information about a broken
 * measurement, and flattening it here would hide exactly the case T06 exists to surface.
 */
export function buildRepairPrompt(input: RepairPromptInput): Prompt {
  return {
    system: repairRole(input.rules),
    messages: [{ role: "user", text: repairUser(input) }],
  };
}
