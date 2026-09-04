import { z } from "zod";

const DEFAULT_MAX_FIELDS = 100;
const DEFAULT_MAX_KEY_LENGTH = 128;
const DEFAULT_MAX_LABEL_LENGTH = 256;
const DEFAULT_MAX_DESCRIPTION_LENGTH = 1024;
const DEFAULT_MAX_FIELD_BYTES = 65_536;
const DEFAULT_MAX_SUBMISSION_BYTES = 262_144;
const DEFAULT_MAX_VALUE_DEPTH = 8;

const limitValueSchema = z.number().int().positive().safe();

/** Processing limits used at the intake boundary. */
export const IntakeLimitsSchema = z
  .object({
    maxFields: limitValueSchema.optional(),
    maxKeyLength: limitValueSchema.optional(),
    maxLabelLength: limitValueSchema.optional(),
    maxDescriptionLength: limitValueSchema.optional(),
    maxFieldBytes: limitValueSchema.optional(),
    maxSubmissionBytes: limitValueSchema.optional(),
    maxValueDepth: limitValueSchema.optional(),
  })
  .strict();

export type IntakeLimitOverrides = z.infer<typeof IntakeLimitsSchema>;

const ResolvedIntakeLimitsSchema = z.object({
  maxFields: limitValueSchema,
  maxKeyLength: limitValueSchema,
  maxLabelLength: limitValueSchema,
  maxDescriptionLength: limitValueSchema,
  maxFieldBytes: limitValueSchema,
  maxSubmissionBytes: limitValueSchema,
  maxValueDepth: limitValueSchema,
});

export type IntakeLimits = z.infer<typeof ResolvedIntakeLimitsSchema>;

export const DEFAULT_INTAKE_LIMITS = Object.freeze(
  ResolvedIntakeLimitsSchema.parse({
    maxFields: DEFAULT_MAX_FIELDS,
    maxKeyLength: DEFAULT_MAX_KEY_LENGTH,
    maxLabelLength: DEFAULT_MAX_LABEL_LENGTH,
    maxDescriptionLength: DEFAULT_MAX_DESCRIPTION_LENGTH,
    maxFieldBytes: DEFAULT_MAX_FIELD_BYTES,
    maxSubmissionBytes: DEFAULT_MAX_SUBMISSION_BYTES,
    maxValueDepth: DEFAULT_MAX_VALUE_DEPTH,
  }),
);

/** Validate partial overrides and merge them over the exact intake defaults. */
export function resolveIntakeLimits(overrides: unknown = {}): IntakeLimits {
  const parsedOverrides = IntakeLimitsSchema.parse(overrides);
  return ResolvedIntakeLimitsSchema.parse({
    ...DEFAULT_INTAKE_LIMITS,
    ...parsedOverrides,
  });
}

const fieldDefinitionFlags = {
  sensitive: z.boolean().optional(),
  sendToAI: z.boolean().optional(),
  includeInOutput: z.boolean().optional(),
};

const codePointLength = (value: string): number => Array.from(value).length;

function boundedString(maxLength: number, name: string): z.ZodType<string> {
  return z.string().refine((value) => codePointLength(value) <= maxLength, {
    message: `${name} exceeds the configured maximum length`,
  });
}

function fieldDefinitionShape(limits: IntakeLimits) {
  return {
    key: boundedString(limits.maxKeyLength, "key").refine((value) => value.length > 0, {
      message: "key must not be empty",
    }),
    label: boundedString(limits.maxLabelLength, "label").refine(
      (value) => value.trim().length > 0,
      { message: "label must not be empty or whitespace" },
    ),
    description: boundedString(limits.maxDescriptionLength, "description").optional(),
    ...fieldDefinitionFlags,
  };
}

/** Build a strict field-definition schema using the supplied resolved limits. */
export function createFieldDefinitionSchema(limits: IntakeLimits = DEFAULT_INTAKE_LIMITS) {
  return z.object(fieldDefinitionShape(limits)).strict();
}

export const FieldDefinitionSchema = createFieldDefinitionSchema();
export type FieldDefinition = z.infer<typeof FieldDefinitionSchema>;

function createResolvedFieldDefinitionSchema(limits: IntakeLimits) {
  return createFieldDefinitionSchema(limits).safeExtend({
    sensitive: z.boolean(),
    sendToAI: z.boolean(),
    includeInOutput: z.boolean(),
  });
}

const ResolvedFieldDefinitionSchema = createResolvedFieldDefinitionSchema(DEFAULT_INTAKE_LIMITS);

export type ResolvedFieldDefinition = z.infer<typeof ResolvedFieldDefinitionSchema>;

/** Validate a definition and resolve privacy flags without rewriting its strings. */
export function resolveFieldDefinition(
  definition: unknown,
  limitOverrides: unknown = {},
): ResolvedFieldDefinition {
  const limits = resolveIntakeLimits(limitOverrides);
  const parsed = createFieldDefinitionSchema(limits).parse(definition);
  const sensitive = parsed.sensitive ?? false;
  const resolved = {
    key: parsed.key,
    label: parsed.label,
    ...(parsed.description === undefined ? {} : { description: parsed.description }),
    sensitive,
    sendToAI: parsed.sendToAI ?? !sensitive,
    includeInOutput: parsed.includeInOutput ?? true,
  };
  return createResolvedFieldDefinitionSchema(limits).parse(resolved);
}
