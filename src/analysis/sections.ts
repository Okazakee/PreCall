import type { ZodType } from "zod";
import { z } from "zod";
import type { JsonValue } from "../intake/normalize.js";
import { IntakeValidationError } from "../intake/normalize.js";
import { cloneJsonCompatibleValue } from "./input.js";

export type AnalysisSectionConfig = {
  key: string;
  title: string;
  instructions: string;
  schema: ZodType;
};

export type AnalysisConfig = {
  sections: readonly AnalysisSectionConfig[];
};

export type AnalysisSectionUnavailableReason =
  | "no_input"
  | "adapter_error"
  | "invalid_output"
  | "not_provided";

export type AnalysisSectionState =
  | { title: string; status: "succeeded"; value: JsonValue }
  | { title: string; status: "unavailable"; reason: AnalysisSectionUnavailableReason };

type ResolvedAnalysisSection = {
  readonly key: string;
  readonly title: string;
  readonly instructions: string;
  readonly schema: ZodType;
  readonly outputSchema: JsonValue;
};

export type ResolvedAnalysisConfiguration = {
  readonly sections: readonly ResolvedAnalysisSection[];
  readonly adapterConfiguration: {
    readonly sections: readonly {
      readonly key: string;
      readonly instructions: string;
      readonly outputSchema: JsonValue;
    }[];
  };
};

const MAX_SECTIONS = 8;
const MAX_TITLE_CODE_POINTS = 160;
const MAX_INSTRUCTIONS_CODE_POINTS = 2048;
const MAX_REQUEST_BYTES = 65536;
const KEY_PATTERN = /^[a-z][A-Za-z0-9]{0,63}$/u;
const RESERVED_KEYS: Record<string, true> = Object.freeze({
  request: true,
  analysis: true,
  costEstimate: true,
  sections: true,
  summary: true,
  clarity: true,
  facts: true,
  inferences: true,
  assumptions: true,
  unknowns: true,
  risks: true,
  discoveryQuestions: true,
  roadmap: true,
  confidence: true,
});

function invalidConfiguration(): never {
  throw new IntakeValidationError("invalid_configuration");
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function copyRecord(value: unknown): Record<string, unknown> {
  if (!isPlainRecord(value)) return invalidConfiguration();
  const result = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") return invalidConfiguration();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.hasOwn(descriptor, "value") ||
      Object.hasOwn(descriptor, "get") ||
      Object.hasOwn(descriptor, "set")
    ) {
      return invalidConfiguration();
    }
    Object.defineProperty(result, key, {
      configurable: true,
      enumerable: true,
      value: descriptor.value,
      writable: true,
    });
  }
  return result;
}

function copySchemaTree(value: unknown, seen: Set<object>, depth: number): JsonValue {
  if (depth > 64) return invalidConfiguration();
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object") return invalidConfiguration();
  if (seen.has(value)) return invalidConfiguration();
  seen.add(value);
  let result: JsonValue;
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) return invalidConfiguration();
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (
      lengthDescriptor === undefined ||
      !Object.hasOwn(lengthDescriptor, "value") ||
      lengthDescriptor.enumerable ||
      !Number.isSafeInteger(lengthDescriptor.value)
    ) {
      return invalidConfiguration();
    }
    const length = lengthDescriptor.value as number;
    if (Reflect.ownKeys(value).length !== length + 1) return invalidConfiguration();
    const items: JsonValue[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !Object.hasOwn(descriptor, "value")
      ) {
        return invalidConfiguration();
      }
      items.push(copySchemaTree(descriptor.value, seen, depth + 1));
    }
    result = items;
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return invalidConfiguration();
    const record = Object.create(null) as Record<string, JsonValue>;
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") return invalidConfiguration();
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !Object.hasOwn(descriptor, "value") ||
        Object.hasOwn(descriptor, "get") ||
        Object.hasOwn(descriptor, "set")
      ) {
        // Zod annotates generated schemas with this non-enumerable internal metadata member.
        if (descriptor !== undefined && key === "~standard" && !descriptor.enumerable) continue;
        return invalidConfiguration();
      }
      Object.defineProperty(record, key, {
        configurable: true,
        enumerable: true,
        value: copySchemaTree(descriptor.value, seen, depth + 1),
        writable: true,
      });
    }
    result = record;
  }
  seen.delete(value);
  return result;
}

function deepFreezeJson(value: JsonValue): JsonValue {
  if (typeof value === "object" && value !== null) {
    for (const child of Array.isArray(value) ? value : Object.values(value)) {
      deepFreezeJson(child);
    }
    Object.freeze(value);
  }
  return value;
}

type ZodCloneNode = z.core.$ZodType;

type ZodCloneState = {
  readonly nodes: Map<object, ZodCloneNode>;
  readonly values: Map<object, unknown>;
  readonly activeNodes: Set<object>;
};

function isZodCloneNode(value: unknown): value is ZodCloneNode {
  if (!(value instanceof z.ZodType) || !("_zod" in value)) return false;
  const internals = Reflect.get(value, "_zod");
  if (typeof internals !== "object" || internals === null) return false;
  if (!("def" in internals) || !("constr" in internals)) return false;
  const definition = internals.def;
  const zodConstructor = internals.constr;
  return (
    definition !== null && typeof definition === "object" && typeof zodConstructor === "function"
  );
}

function definitionPropertyValue(source: object, descriptor: PropertyDescriptor): unknown {
  if (Object.hasOwn(descriptor, "value")) return descriptor.value;
  if (typeof descriptor.get === "function") return descriptor.get.call(source);
  return invalidConfiguration();
}

function cloneDefinitionValue(value: unknown, state: ZodCloneState): unknown {
  if (isZodCloneNode(value)) return cloneZodNode(value, state);
  if (value === null || typeof value !== "object" || typeof value === "function") return value;

  const cached = state.values.get(value);
  if (cached !== undefined) return cached;

  if (value instanceof RegExp) {
    const result = new RegExp(value.source, value.flags);
    result.lastIndex = value.lastIndex;
    state.values.set(value, result);
    return result;
  }
  if (value instanceof Date) {
    const result = new Date(value.getTime());
    state.values.set(value, result);
    return result;
  }
  if (value instanceof Map) {
    const result = new Map<unknown, unknown>();
    state.values.set(value, result);
    for (const [key, entry] of value) {
      result.set(cloneDefinitionValue(key, state), cloneDefinitionValue(entry, state));
    }
    return result;
  }
  if (value instanceof Set) {
    const result = new Set<unknown>();
    state.values.set(value, result);
    for (const entry of value) result.add(cloneDefinitionValue(entry, state));
    return result;
  }
  if (Array.isArray(value)) {
    const result: unknown[] = [];
    state.values.set(value, result);
    for (const key of Reflect.ownKeys(value)) {
      if (key === "length") continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined) return invalidConfiguration();
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: descriptor.enumerable === true,
        value: cloneDefinitionValue(definitionPropertyValue(value, descriptor), state),
        writable: true,
      });
    }
    return result;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return invalidConfiguration();
  const result = Object.create(prototype) as Record<PropertyKey, unknown>;
  state.values.set(value, result);
  const type = "type" in value && typeof value.type === "string" ? value.type : undefined;
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined) return invalidConfiguration();
    const propertyValue = definitionPropertyValue(value, descriptor);
    const clonedValue =
      type === "lazy" && key === "getter" && typeof propertyValue === "function"
        ? (() => {
            let clonedTarget: ZodCloneNode | undefined;
            let resolved = false;
            return () => {
              if (!resolved) {
                const target = propertyValue();
                if (!isZodCloneNode(target)) return invalidConfiguration();
                clonedTarget = cloneZodNode(target, state);
                resolved = true;
              }
              return clonedTarget ?? invalidConfiguration();
            };
          })()
        : cloneDefinitionValue(propertyValue, state);
    Object.defineProperty(result, key, {
      configurable: true,
      enumerable: descriptor.enumerable === true,
      value: clonedValue,
      writable: true,
    });
  }
  return result;
}

function cloneZodNode(source: ZodCloneNode, state: ZodCloneState): ZodCloneNode {
  const cached = state.nodes.get(source);
  if (cached !== undefined) return cached;
  if (state.activeNodes.has(source)) return invalidConfiguration();
  state.activeNodes.add(source);
  try {
    const internals = Reflect.get(source, "_zod");
    if (typeof internals !== "object" || internals === null || !("def" in internals)) {
      return invalidConfiguration();
    }
    const definition = cloneDefinitionValue(internals.def, state);
    const cloned = z.clone(source, definition as ZodCloneNode["_zod"]["def"]);
    state.nodes.set(source, cloned);
    return cloned;
  } finally {
    state.activeNodes.delete(source);
  }
}

function cloneZodSchema(schema: ZodType): ZodType {
  const state: ZodCloneState = {
    nodes: new Map(),
    values: new Map(),
    activeNodes: new Set(),
  };
  return cloneZodNode(schema as unknown as ZodCloneNode, state) as unknown as ZodType;
}

function createOutputSchema(schema: ZodType): JsonValue {
  try {
    const generated = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" });
    const detached = copySchemaTree(generated, new Set(), 0);
    return deepFreezeJson(cloneJsonCompatibleValue(detached));
  } catch {
    return invalidConfiguration();
  }
}

function countCodePoints(value: string): number {
  return Array.from(value).length;
}

export function resolveAnalysisConfiguration(
  value: unknown = undefined,
): ResolvedAnalysisConfiguration | undefined {
  if (value === undefined) return undefined;
  try {
    const config = copyRecord(value);
    if (Object.keys(config).length !== 1 || !Object.hasOwn(config, "sections")) {
      return invalidConfiguration();
    }
    const sectionsValue = config.sections;
    if (!Array.isArray(sectionsValue) || Object.getPrototypeOf(sectionsValue) !== Array.prototype) {
      return invalidConfiguration();
    }
    const lengthDescriptor = Object.getOwnPropertyDescriptor(sectionsValue, "length");
    if (
      lengthDescriptor === undefined ||
      !Object.hasOwn(lengthDescriptor, "value") ||
      !Number.isSafeInteger(lengthDescriptor.value) ||
      Reflect.ownKeys(sectionsValue).length !== (lengthDescriptor.value as number) + 1
    ) {
      return invalidConfiguration();
    }
    const length = lengthDescriptor.value as number;
    if (length > MAX_SECTIONS) return invalidConfiguration();
    if (length === 0) return undefined;
    const sections: ResolvedAnalysisSection[] = [];
    const keys = new Set<string>();
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(sectionsValue, String(index));
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !Object.hasOwn(descriptor, "value")
      ) {
        return invalidConfiguration();
      }
      const section = copyRecord(descriptor.value);
      if (Object.keys(section).length !== 4) return invalidConfiguration();
      const key = section.key;
      const title = section.title;
      const instructions = section.instructions;
      const schema = section.schema;
      if (
        typeof key !== "string" ||
        !KEY_PATTERN.test(key) ||
        Object.hasOwn(RESERVED_KEYS, key) ||
        keys.has(key) ||
        typeof title !== "string" ||
        !/\S/u.test(title) ||
        countCodePoints(title) > MAX_TITLE_CODE_POINTS ||
        typeof instructions !== "string" ||
        !/\S/u.test(instructions) ||
        countCodePoints(instructions) > MAX_INSTRUCTIONS_CODE_POINTS ||
        !(schema instanceof z.ZodType)
      ) {
        return invalidConfiguration();
      }
      keys.add(key);
      const clonedSchema = cloneZodSchema(schema);
      const outputSchema = createOutputSchema(clonedSchema);
      sections.push(
        Object.freeze({ key, title, instructions, schema: clonedSchema, outputSchema }),
      );
    }
    const adapterSections = sections.map(({ key, instructions, outputSchema }) =>
      Object.freeze({ key, instructions, outputSchema }),
    );
    const adapterConfiguration = Object.freeze({ sections: Object.freeze(adapterSections) });
    const resolved = Object.freeze({ sections: Object.freeze(sections), adapterConfiguration });
    const bytes = new TextEncoder().encode(JSON.stringify(adapterConfiguration)).byteLength;
    if (bytes > MAX_REQUEST_BYTES) return invalidConfiguration();
    return resolved;
  } catch (error) {
    if (error instanceof IntakeValidationError) throw error;
    return invalidConfiguration();
  }
}
