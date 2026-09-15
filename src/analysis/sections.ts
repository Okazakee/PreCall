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
  /** Trusted caller configuration retained by reference and applied at the core parse boundary. */
  readonly schema: ZodType;
  /** Detached provider-facing contract generated once from the schema at configuration time. */
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

/**
 * Recognize a configured Zod schema without asserting class identity.
 *
 * Zod 4 exposes the Standard Schema v1 interface on every schema of every installation, so that
 * public library-author boundary is checked first. A schema whose interface cannot be read (for
 * example a frozen schema) is recognized by Zod's own `_zod` type tag instead. `instanceof` is
 * deliberately not used: it asserts that the caller's Zod class objects are the ones this package
 * was built against, which a second installation, a different version, or `zod/mini` violates.
 */
function hasStandardZodInterface(value: object): boolean {
  try {
    const standard = Reflect.get(value, "~standard");
    if (typeof standard !== "object" || standard === null) return false;
    return (
      Reflect.get(standard, "vendor") === "zod" &&
      Reflect.get(standard, "version") === 1 &&
      typeof Reflect.get(standard, "validate") === "function"
    );
  } catch {
    return false;
  }
}

function hasZodTypeTag(value: object): boolean {
  const internals = Reflect.get(value, "_zod");
  if (typeof internals !== "object" || internals === null) return false;
  const definition = Reflect.get(internals, "def");
  return (
    typeof definition === "object" &&
    definition !== null &&
    typeof Reflect.get(definition, "type") === "string"
  );
}

function isSectionSchema(value: unknown): value is ZodType {
  if (typeof value !== "object" || value === null) return false;
  if (typeof Reflect.get(value, "safeParse") !== "function") return false;
  return hasStandardZodInterface(value) || hasZodTypeTag(value);
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
        !isSectionSchema(schema)
      ) {
        return invalidConfiguration();
      }
      keys.add(key);
      const outputSchema = createOutputSchema(schema);
      sections.push(Object.freeze({ key, title, instructions, schema, outputSchema }));
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
