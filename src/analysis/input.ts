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

function cloneJsonCompatibleValueInternal(
  value: unknown,
  seen: Set<object>,
  depth: number,
): JsonValue {
  if (depth > 64) throw new TypeError("JSON value exceeds maximum depth");
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object") throw new TypeError("value is not JSON-compatible");
  if (seen.has(value)) throw new TypeError("value contains a cycle");
  seen.add(value);

  let result: JsonValue;
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype)
      throw new TypeError("array prototype is invalid");
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (
      lengthDescriptor === undefined ||
      lengthDescriptor.enumerable ||
      !Object.hasOwn(lengthDescriptor, "value") ||
      !Number.isSafeInteger(lengthDescriptor.value) ||
      lengthDescriptor.value < 0
    ) {
      throw new TypeError("array length is invalid");
    }
    const length = lengthDescriptor.value as number;
    if (Reflect.ownKeys(value).length !== length + 1)
      throw new TypeError("array has extra properties");
    const items: JsonValue[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !Object.hasOwn(descriptor, "value") ||
        Object.hasOwn(descriptor, "get") ||
        Object.hasOwn(descriptor, "set")
      ) {
        throw new TypeError("array contains an invalid member");
      }
      items.push(cloneJsonCompatibleValueInternal(descriptor.value, seen, depth + 1));
    }
    result = items;
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("object prototype is invalid");
    }
    const record = Object.create(null) as Record<string, JsonValue>;
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") throw new TypeError("object contains a symbol property");
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !Object.hasOwn(descriptor, "value") ||
        Object.hasOwn(descriptor, "get") ||
        Object.hasOwn(descriptor, "set")
      ) {
        throw new TypeError("object contains an invalid property");
      }
      defineValue(record, key, cloneJsonCompatibleValueInternal(descriptor.value, seen, depth + 1));
    }
    result = record;
  }
  seen.delete(value);
  return result;
}

export function cloneJsonCompatibleValue(value: unknown): JsonValue {
  return cloneJsonCompatibleValueInternal(value, new Set(), 0);
}

export function cloneJsonValue(value: JsonValue): JsonValue {
  return cloneJsonCompatibleValue(value);
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
