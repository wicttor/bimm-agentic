// JSON Schema validation for task plans (task 2026-09-04-001-T08).
//
// Driven entirely by `TASK_PLAN_JSON_SCHEMA`, so the planner can never advertise one shape and
// accept another. Unknown keys are tolerated (the schema opts into `additionalProperties`) because
// the Tasks phase of the plan skill may add fields before this repo's schema does; every key the
// schema *does* declare is type-checked, and the four required keys stay required.

import { TASK_PLAN_JSON_SCHEMA } from "./prompts/planner.ts";

type PropertySpec = Record<string, unknown>;

/** Type-check one declared property against its schema entry. Null means "conforms". */
function checkProperty(key: string, spec: PropertySpec, value: unknown): string | null {
  if (value === undefined || value === null) return null;

  if (spec.type === "string") {
    return typeof value === "string" ? null : `${key}: must be a string`;
  }

  if (spec.type === "array") {
    if (!Array.isArray(value)) return `${key}: must be an array`;
    const items = spec.items as PropertySpec | undefined;
    if (items?.type === "string") {
      for (let i = 0; i < value.length; i += 1) {
        if (typeof value[i] !== "string") return `${key}[${i}]: must be a string`;
      }
    }
    return null;
  }

  return null;
}

/** Validate an unknown value against the planner schema. Returns errors if validation fails. */
export function validateTaskPlan(value: unknown): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  // Check if it's an object
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, errors: ["Must be an object"] };
  }

  const obj = value as Record<string, unknown>;

  // Check required fields
  for (const required of TASK_PLAN_JSON_SCHEMA.required) {
    if (!(required in obj)) {
      errors.push(`Missing required field: ${required}`);
    }
  }

  // Type-check every declared key that is present. Undeclared keys are ignored by design:
  // `additionalProperties` is true on this schema, so an extra field is information, not a defect.
  for (const [key, spec] of Object.entries(TASK_PLAN_JSON_SCHEMA.properties)) {
    if (!(key in obj)) continue;
    const error = checkProperty(key, spec as PropertySpec, obj[key]);
    if (error) errors.push(error);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true };
}

/** Validate that value is an array of task objects. */
export function validateTaskArray(value: unknown): { ok: true; tasks: any[] } | { ok: false; errors: string[] } {
  if (!Array.isArray(value)) {
    return { ok: false, errors: ["Expected an array of tasks, but got " + typeof value] };
  }

  const errors: string[] = [];
  const tasks: any[] = [];

  for (let i = 0; i < value.length; i += 1) {
    const task = value[i];
    const result = validateTaskPlan(task);
    if (!result.ok) {
      errors.push(`Task [${i}]: ${result.errors.join("; ")}`);
    } else {
      tasks.push(task);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, tasks };
}
