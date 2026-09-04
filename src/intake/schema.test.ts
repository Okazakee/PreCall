import { expect, test } from "bun:test";
import {
  createFieldDefinitionSchema,
  DEFAULT_INTAKE_LIMITS,
  FieldDefinitionSchema,
  IntakeLimitsSchema,
  resolveFieldDefinition,
  resolveIntakeLimits,
} from "./schema.ts";

const expectedDefaults = {
  maxFields: 100,
  maxKeyLength: 128,
  maxLabelLength: 256,
  maxDescriptionLength: 1_024,
  maxFieldBytes: 65_536,
  maxSubmissionBytes: 262_144,
  maxValueDepth: 8,
};

test("uses the exact default intake limits", () => {
  expect(DEFAULT_INTAKE_LIMITS).toEqual(expectedDefaults);
  expect(resolveIntakeLimits()).toEqual(expectedDefaults);
});

test("merges partial limit overrides over the defaults", () => {
  expect(resolveIntakeLimits({ maxFields: 12, maxValueDepth: 3 })).toEqual({
    ...expectedDefaults,
    maxFields: 12,
    maxValueDepth: 3,
  });
  expect(IntakeLimitsSchema.safeParse({ maxKeyLength: 10 }).success).toBe(true);
});

test("rejects invalid intake limit values", () => {
  const invalidValues = [
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ];

  for (const value of invalidValues) {
    expect(() => resolveIntakeLimits({ maxFields: value })).toThrow();
  }
  expect(() => resolveIntakeLimits({ unknownLimit: 1 })).toThrow();
});

test("parses ordinary definitions and permits an omitted description", () => {
  expect(FieldDefinitionSchema.parse({ key: "email", label: "Email address" })).toEqual({
    key: "email",
    label: "Email address",
  });
  expect(
    FieldDefinitionSchema.parse({
      key: "name",
      label: "Full name",
      description: "The person's preferred name.",
    }),
  ).toEqual({
    key: "name",
    label: "Full name",
    description: "The person's preferred name.",
  });
});

test("rejects unknown definition keys", () => {
  expect(
    FieldDefinitionSchema.safeParse({
      key: "email",
      label: "Email",
      unexpected: true,
    }).success,
  ).toBe(false);
});

test("rejects an empty key and a whitespace-only label", () => {
  expect(FieldDefinitionSchema.safeParse({ key: "", label: "Label" }).success).toBe(false);
  expect(FieldDefinitionSchema.safeParse({ key: "key", label: " \t\n" }).success).toBe(false);
});

test("treats code-point length boundaries as inclusive", () => {
  const schema = createFieldDefinitionSchema(
    resolveIntakeLimits({
      maxKeyLength: 2,
      maxLabelLength: 2,
      maxDescriptionLength: 2,
    }),
  );
  const boundary = "😀😀";

  for (const field of ["key", "label", "description"] as const) {
    expect(
      schema.safeParse({
        key: "k",
        label: "L",
        description: "d",
        [field]: boundary,
      }).success,
    ).toBe(true);
  }

  for (const field of ["key", "label", "description"] as const) {
    expect(
      schema.safeParse({
        key: "k",
        label: "L",
        description: "d",
        [field]: `${boundary}😀`,
      }).success,
    ).toBe(false);
  }
});

test("resolves privacy defaults for non-sensitive fields", () => {
  expect(resolveFieldDefinition({ key: "email", label: "Email" })).toEqual({
    key: "email",
    label: "Email",
    sensitive: false,
    sendToAI: true,
    includeInOutput: true,
  });
});

test("defaults sensitive fields to exclude them from AI but not output", () => {
  expect(
    resolveFieldDefinition({ key: "ssn", label: "Social Security number", sensitive: true }),
  ).toEqual({
    key: "ssn",
    label: "Social Security number",
    sensitive: true,
    sendToAI: false,
    includeInOutput: true,
  });
});

test("honors explicit privacy flag overrides", () => {
  expect(
    resolveFieldDefinition({
      key: "ssn",
      label: "Social Security number",
      sensitive: true,
      sendToAI: true,
      includeInOutput: false,
    }),
  ).toEqual({
    key: "ssn",
    label: "Social Security number",
    sensitive: true,
    sendToAI: true,
    includeInOutput: false,
  });
});

test("applies raised string limits when resolving definitions", () => {
  const definition = {
    key: "k".repeat(129),
    label: "L".repeat(257),
    description: "d".repeat(1_025),
  };
  expect(
    resolveFieldDefinition(definition, {
      maxKeyLength: 129,
      maxLabelLength: 257,
      maxDescriptionLength: 1_025,
    }),
  ).toEqual({
    ...definition,
    sensitive: false,
    sendToAI: true,
    includeInOutput: true,
  });
});
