// JSON Schema validation for task plans (task 2026-09-04-001-T08).

import { TASK_PLAN_JSON_SCHEMA } from "./prompts/planner.ts";

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

  // If additionalProperties is false, check for unexpected fields
  if (!TASK_PLAN_JSON_SCHEMA.additionalProperties) {
    for (const key in obj) {
      if (!(key in TASK_PLAN_JSON_SCHEMA.properties)) {
        errors.push(`Unexpected field: ${key}`);
      }
    }
  }

  // Validate individual properties
  // file: must be string
  if ("file" in obj && typeof obj.file !== "string") {
    errors.push("file: must be a string");
  }

  // purpose: must be string
  if ("purpose" in obj && typeof obj.purpose !== "string") {
    errors.push("purpose: must be a string");
  }

  // dependsOn: must be array of strings
  if ("dependsOn" in obj) {
    if (!Array.isArray(obj.dependsOn)) {
      errors.push("dependsOn: must be an array");
    } else {
      for (let i = 0; i < obj.dependsOn.length; i += 1) {
        if (typeof obj.dependsOn[i] !== "string") {
          errors.push(`dependsOn[${i}]: must be a string`);
        }
      }
    }
  }

  // exports: must be array of strings
  if ("exports" in obj) {
    if (!Array.isArray(obj.exports)) {
      errors.push("exports: must be an array");
    } else {
      for (let i = 0; i < obj.exports.length; i += 1) {
        if (typeof obj.exports[i] !== "string") {
          errors.push(`exports[${i}]: must be a string`);
        }
      }
    }
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
