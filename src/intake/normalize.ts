import {
  type IntakeLimits,
  type ResolvedFieldDefinition,
  resolveFieldDefinition,
  resolveIntakeLimits,
} from "./schema.js";

export type IntakeValidationCode =
  | "invalid_configuration"
  | "invalid_submission"
  | "limit_exceeded";

const ERROR_MESSAGES: Record<IntakeValidationCode, string> = {
  invalid_configuration: "Invalid intake configuration",
  invalid_submission: "Invalid intake submission",
  limit_exceeded: "Intake limit exceeded",
};

/** Stable, deliberately non-descriptive error for an intake-boundary failure. */
export class IntakeValidationError extends Error {
  readonly code: IntakeValidationCode;
  constructor(code: IntakeValidationCode) {
    super(ERROR_MESSAGES[code]);
    Object.defineProperty(this, "name", {
      configurable: true,
      enumerable: false,
      value: "IntakeValidationError",
      writable: true,
    });
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface NormalizedField {
  key: string;
  label: string;
  value: JsonValue;
  description?: string;
  sensitive: boolean;
  sendToAI: boolean;
  includeInOutput: boolean;
}

export interface NormalizedSubmission {
  original: Record<string, JsonValue>;
  fields: NormalizedField[];
}

type FailureCode = IntakeValidationCode;
type DataRecord = Record<string, unknown>;

function fail(code: FailureCode): never {
  throw new IntakeValidationError(code);
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function isPlainRecord(value: unknown): value is DataRecord {
  if (!isObject(value) || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function defineData(target: object, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

function ownDataDescriptor(target: object, key: string, code: FailureCode): PropertyDescriptor {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  if (
    descriptor === undefined ||
    !Object.hasOwn(descriptor, "value") ||
    Object.hasOwn(descriptor, "get") ||
    Object.hasOwn(descriptor, "set")
  ) {
    fail(code);
  }
  return descriptor;
}

function ownValue(target: object, key: string, code: FailureCode): unknown {
  return ownDataDescriptor(target, key, code).value;
}

function inspectArray(target: object, code: FailureCode): number {
  if (Object.getPrototypeOf(target) !== Array.prototype) fail(code);
  const lengthDescriptor = ownDataDescriptor(target, "length", code);
  if (lengthDescriptor.enumerable || !Number.isSafeInteger(lengthDescriptor.value)) {
    fail(code);
  }
  const length = lengthDescriptor.value as number;
  const keys = Reflect.ownKeys(target);
  if (keys.length !== length + 1) fail(code);

  for (const key of keys) {
    if (typeof key !== "string") fail(code);
    if (key === "length") continue;
    if (!/^(?:0|[1-9]\d*)$/u.test(key)) fail(code);
    const index = Number(key);
    if (!Number.isSafeInteger(index) || index < 0 || index >= length) fail(code);
    const descriptor = ownDataDescriptor(target, key, code);
    if (!descriptor.enumerable) fail(code);
  }
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(target, String(index));
    if (descriptor === undefined || !descriptor.enumerable) fail(code);
  }
  return length;
}

function isAllowedConfigValue(value: unknown): boolean {
  return (
    value === undefined ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

/** Copy a configuration record without invoking any caller-defined property. */
function copyConfigRecord(value: unknown): DataRecord {
  if (!isPlainRecord(value)) fail("invalid_configuration");
  const result = Object.create(null) as DataRecord;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") fail("invalid_configuration");
    const descriptor = ownDataDescriptor(value, key, "invalid_configuration");
    if (!descriptor.enumerable || !isAllowedConfigValue(descriptor.value)) {
      fail("invalid_configuration");
    }
    defineData(result, key, descriptor.value);
  }
  return result;
}
function resolveLimits(overrides: unknown): IntakeLimits {
  try {
    return resolveIntakeLimits(copyConfigRecord(overrides));
  } catch (error) {
    if (error instanceof IntakeValidationError) throw error;
    fail("invalid_configuration");
  }
}

function copyDefinition(value: unknown): DataRecord {
  if (!isPlainRecord(value)) fail("invalid_configuration");
  const result = Object.create(null) as DataRecord;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") fail("invalid_configuration");
    const descriptor = ownDataDescriptor(value, key, "invalid_configuration");
    if (!descriptor.enumerable || !isAllowedConfigValue(descriptor.value)) {
      fail("invalid_configuration");
    }
    defineData(result, key, descriptor.value);
  }
  return result;
}

function resolveDefinitions(
  definitions: unknown,
  limits: IntakeLimits,
): Map<string, ResolvedFieldDefinition> {
  try {
    if (!Array.isArray(definitions)) fail("invalid_configuration");
    const length = inspectArray(definitions, "invalid_configuration");
    if (length > limits.maxFields) fail("limit_exceeded");
    const resolved = new Map<string, ResolvedFieldDefinition>();
    for (let index = 0; index < length; index += 1) {
      const definition = copyDefinition(
        ownValue(definitions, String(index), "invalid_configuration"),
      );
      let parsed: ResolvedFieldDefinition;
      try {
        parsed = resolveFieldDefinition(definition, limits);
      } catch (error) {
        if (error instanceof IntakeValidationError) throw error;
        fail("invalid_configuration");
      }
      const key = ownValue(parsed, "key", "invalid_configuration");
      if (typeof key !== "string") fail("invalid_configuration");
      if (resolved.has(key)) fail("invalid_configuration");
      resolved.set(key, parsed);
    }
    return resolved;
  } catch (error) {
    if (error instanceof IntakeValidationError) throw error;
    fail("invalid_configuration");
  }
}

interface ByteBudget {
  submission: number;
  field: number;
}

interface CloneContext {
  limits: IntakeLimits;
  active: WeakSet<object>;
  budget: ByteBudget;
}

function addBytes(context: CloneContext, bytes: number, countField: boolean): void {
  const submissionRemaining = context.limits.maxSubmissionBytes - context.budget.submission;
  if (bytes > submissionRemaining) fail("limit_exceeded");
  if (countField) {
    const fieldRemaining = context.limits.maxFieldBytes - context.budget.field;
    if (bytes > fieldRemaining) fail("limit_exceeded");
  }
  context.budget.submission += bytes;
  if (countField) context.budget.field += bytes;
}

function jsonStringBytes(value: string, limit: number): number {
  let total = 2;
  if (total > limit) return limit + 1;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    let bytes: number;
    if (code === 0x22 || code === 0x5c) {
      bytes = 2;
    } else if (code === 0x08 || code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d) {
      bytes = 2;
    } else if (code < 0x20) {
      bytes = 6;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes = 4;
        index += 1;
      } else {
        bytes = 6;
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      bytes = 6;
    } else if (code <= 0x7f) {
      bytes = 1;
    } else if (code <= 0x7ff) {
      bytes = 2;
    } else {
      bytes = 3;
    }
    total += bytes;
    if (total > limit) return limit + 1;
  }
  return total;
}

function addJsonString(context: CloneContext, value: string, countField: boolean): void {
  const submissionRemaining = context.limits.maxSubmissionBytes - context.budget.submission;
  const fieldRemaining = countField
    ? context.limits.maxFieldBytes - context.budget.field
    : submissionRemaining;
  const bytes = jsonStringBytes(value, Math.min(submissionRemaining, fieldRemaining));
  addBytes(context, bytes, countField);
}

function primitiveJsonBytes(value: number | boolean | null): number {
  if (value === null) return 4;
  if (typeof value === "boolean") return value ? 4 : 5;
  return String(value).length;
}

function cloneValue(value: unknown, depth: number, context: CloneContext): JsonValue {
  if (value === null) {
    addBytes(context, primitiveJsonBytes(null), true);
    return null;
  }
  if (typeof value === "string") {
    addJsonString(context, value, true);
    return value;
  }
  if (typeof value === "boolean") {
    addBytes(context, primitiveJsonBytes(value), true);
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return fail("invalid_submission");
    addBytes(context, primitiveJsonBytes(value), true);
    return value;
  }
  if (typeof value !== "object") return fail("invalid_submission");

  if (depth > context.limits.maxValueDepth) fail("limit_exceeded");
  if (!isObject(value)) fail("invalid_submission");
  if (context.active.has(value)) fail("invalid_submission");
  context.active.add(value);
  try {
    if (Array.isArray(value)) {
      const length = inspectArray(value, "invalid_submission");
      if (length > context.limits.maxSubmissionBytes) fail("limit_exceeded");
      addBytes(context, 1, true);
      const result: JsonValue[] = [];
      for (let index = 0; index < length; index += 1) {
        if (index > 0) addBytes(context, 1, true);
        const child = cloneValue(
          ownValue(value, String(index), "invalid_submission"),
          depth + 1,
          context,
        );
        defineData(result, String(index), child);
      }
      addBytes(context, 1, true);
      return result;
    }

    if (!isPlainRecord(value)) fail("invalid_submission");
    const keys = Reflect.ownKeys(value);
    const result: Record<string, JsonValue> = Object.create(null) as Record<string, JsonValue>;
    let first = true;
    for (const key of keys) {
      if (typeof key !== "string") fail("invalid_submission");
      const descriptor = ownDataDescriptor(value, key, "invalid_submission");
      if (!descriptor.enumerable) fail("invalid_submission");
      if (first) {
        addBytes(context, 1, true);
        first = false;
      } else {
        addBytes(context, 1, true);
      }
      addJsonString(context, key, true);
      addBytes(context, 1, true);
      defineData(result, key, cloneValue(descriptor.value, depth + 1, context));
    }
    if (first) addBytes(context, 1, true);
    addBytes(context, 1, true);
    return result;
  } finally {
    context.active.delete(value);
  }
}

interface SubmissionSnapshot {
  snapshot: Record<string, JsonValue>;
  values: Map<string, JsonValue>;
}

function cloneSubmission(submission: unknown, limits: IntakeLimits): SubmissionSnapshot {
  try {
    if (!isPlainRecord(submission)) fail("invalid_submission");
    const keys = Reflect.ownKeys(submission);
    if (keys.length === 0) fail("invalid_submission");
    if (keys.length > limits.maxFields) fail("limit_exceeded");

    const values = new Map<string, JsonValue>();
    const context: CloneContext = {
      active: new WeakSet<object>(),
      limits,
      budget: { submission: 1, field: 0 },
    };
    const snapshot = Object.create(null) as Record<string, JsonValue>;
    for (const key of keys) {
      if (typeof key !== "string") fail("invalid_submission");
      const descriptor = ownDataDescriptor(submission, key, "invalid_submission");
      if (!descriptor.enumerable) fail("invalid_submission");
      if (context.budget.submission > 1) addBytes(context, 1, false);
      addJsonString(context, key, false);
      addBytes(context, 1, false);
      context.budget.field = 0;
      const cloned = cloneValue(descriptor.value, 1, context);
      defineData(snapshot, key, cloned);
      values.set(key, cloned);
    }
    addBytes(context, 1, false);
    return { snapshot, values };
  } catch (error) {
    if (error instanceof IntakeValidationError) throw error;
    fail("invalid_submission");
  }
}

function normalizedField(definition: ResolvedFieldDefinition, value: JsonValue): NormalizedField {
  const key = ownValue(definition, "key", "invalid_configuration");
  const label = ownValue(definition, "label", "invalid_configuration");
  const sensitive = ownValue(definition, "sensitive", "invalid_configuration");
  const sendToAI = ownValue(definition, "sendToAI", "invalid_configuration");
  const includeInOutput = ownValue(definition, "includeInOutput", "invalid_configuration");
  if (
    typeof key !== "string" ||
    typeof label !== "string" ||
    typeof sensitive !== "boolean" ||
    typeof sendToAI !== "boolean" ||
    typeof includeInOutput !== "boolean"
  ) {
    fail("invalid_configuration");
  }
  const field: NormalizedField = {
    key,
    label,
    value,
    sensitive,
    sendToAI,
    includeInOutput,
  };
  const description = ownValueIfPresent(definition, "description");
  if (description !== undefined) {
    if (typeof description !== "string") fail("invalid_configuration");
    field.description = description;
  }
  return field;
}

function ownValueIfPresent(target: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  if (descriptor === undefined) return undefined;
  if (!Object.hasOwn(descriptor, "value")) fail("invalid_configuration");
  return descriptor.value;
}

/** Resolve trusted intake configuration once for a configured facade. */
export interface ResolvedIntakeConfiguration {
  readonly limits: IntakeLimits;
  readonly definitions: ReadonlyMap<string, ResolvedFieldDefinition>;
}

export function resolveIntakeConfiguration(
  definitions: unknown,
  limitOverrides: unknown = {},
): ResolvedIntakeConfiguration {
  const limits = resolveLimits(limitOverrides);
  return { limits, definitions: resolveDefinitions(definitions, limits) };
}

function normalizeResolvedSubmission(
  configuration: ResolvedIntakeConfiguration,
  submission: unknown,
): NormalizedSubmission {
  const { snapshot, values } = cloneSubmission(submission, configuration.limits);

  for (const key of values.keys()) {
    if (!configuration.definitions.has(key)) fail("invalid_submission");
  }
  const fields: NormalizedField[] = [];
  for (const [key, definition] of configuration.definitions) {
    const value = values.get(key);
    if (value !== undefined) {
      fields.push(normalizedField(definition, value));
    }
  }
  return { original: snapshot, fields };
}

/** Validate, detach, and normalize a configured submission in definition order. */
export function normalizeSubmission(
  definitions: unknown,
  submission: unknown,
  limitOverrides: unknown = {},
): NormalizedSubmission {
  return normalizeResolvedSubmission(
    resolveIntakeConfiguration(definitions, limitOverrides),
    submission,
  );
}

/** Normalize a submission against a previously validated trusted configuration. */
export function normalizeSubmissionWithConfiguration(
  configuration: ResolvedIntakeConfiguration,
  submission: unknown,
): NormalizedSubmission {
  return normalizeResolvedSubmission(configuration, submission);
}
