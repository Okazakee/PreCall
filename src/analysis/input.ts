import type { JsonValue, NormalizedSubmission } from "../intake/normalize.js";

export interface AnalysisInputField {
  key: string;
  label: string;
  value: JsonValue;
  description?: string;
}

export interface AnalysisInput {
  fields: AnalysisInputField[];
}

function defineValue(target: object, key: string, value: JsonValue): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

export function cloneJsonValue(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    const result: JsonValue[] = [];
    for (const item of value) result.push(cloneJsonValue(item));
    return result;
  }

  const result = Object.create(null) as Record<string, JsonValue>;
  for (const key of Object.keys(value)) {
    defineValue(result, key, cloneJsonValue(value[key] as JsonValue));
  }
  return result;
}

export function createAnalysisInput(normalized: NormalizedSubmission): AnalysisInput {
  const fields: AnalysisInputField[] = [];
  for (const field of normalized.fields) {
    if (field.sendToAI !== true) continue;

    const projected: AnalysisInputField = {
      key: field.key,
      label: field.label,
      value: cloneJsonValue(field.value),
    };
    if (field.description !== undefined) projected.description = field.description;
    fields.push(projected);
  }
  return { fields };
}
