import { describe, expect, test } from "bun:test";
import type { JsonValue, NormalizedField } from "../intake/normalize.js";
import type { PreCallResult } from "../result.js";
import { createSubmissionAttachment, type SubmissionAttachment } from "./attachment.js";

const decoder = new TextDecoder();

function field(
  key: string,
  value: JsonValue,
  options: Partial<
    Pick<NormalizedField, "includeInOutput" | "sensitive" | "sendToAI" | "label" | "description">
  > = {},
): NormalizedField {
  return {
    key,
    label: options.label ?? `${key} label`,
    value,
    sensitive: options.sensitive ?? false,
    sendToAI: options.sendToAI ?? true,
    includeInOutput: options.includeInOutput ?? true,
    ...(options.description === undefined ? {} : { description: options.description }),
  };
}

function result(
  fields: NormalizedField[],
  original: Record<string, JsonValue> = Object.create(null) as Record<string, JsonValue>,
): PreCallResult {
  return {
    request: { original, fields },
    analysis: { status: "unavailable", reason: "no_input" },
  };
}

function decodeAttachment(attachment: SubmissionAttachment): string {
  const decoded = decoder.decode(attachment.bytes);
  return decoded;
}

describe("createSubmissionAttachment", () => {
  test("returns exact metadata and a valid, pretty-printed JSON payload", () => {
    const attachment = createSubmissionAttachment(
      result([
        field("goal", "Clarify the launch goal"),
        field("count", 3),
        field("enabled", true),
        field("nothing", null),
      ]),
    );

    expect(attachment.filename).toBe("submission.json");
    expect(attachment.contentType).toBe("application/json");
    expect(attachment.bytes).toBeInstanceOf(Uint8Array);
    const json = decodeAttachment(attachment);
    expect(json).toBe(
      `{\n  "goal": "Clarify the launch goal",\n  "count": 3,\n  "enabled": true,\n  "nothing": null\n}\n`,
    );
    expect(JSON.parse(json)).toEqual({
      goal: "Clarify the launch goal",
      count: 3,
      enabled: true,
      nothing: null,
    });
  });

  test("retains only output-permitted fields in normalized order", () => {
    const hiddenValue = "hidden unique submitted value";
    const original = Object.create(null) as Record<string, JsonValue>;
    Object.defineProperty(original, "original unique sentinel", {
      enumerable: true,
      value: "original unique submitted value",
    });
    const attachment = createSubmissionAttachment(
      result(
        [
          field("first-visible", "one"),
          field("hidden-unique-key", hiddenValue, {
            includeInOutput: false,
            label: "hidden unique label",
            description: "hidden unique description",
          }),
          field("second-visible", "two"),
        ],
        original,
      ),
    );

    const json = decodeAttachment(attachment);
    expect(json.indexOf('"first-visible"')).toBeLessThan(json.indexOf('"second-visible"'));
    expect(JSON.parse(json)).toEqual({ "first-visible": "one", "second-visible": "two" });
    expect(json).not.toContain("hidden-unique-key");
    expect(json).not.toContain("hidden unique label");
    expect(json).not.toContain("hidden unique description");
    expect(json).not.toContain(hiddenValue);
    expect(json).not.toContain("original unique sentinel");
    expect(json).not.toContain("original unique submitted value");
  });
  test("preserves normalized order for array-index-looking field keys", () => {
    const json = decodeAttachment(
      createSubmissionAttachment(result([field("10", "ten"), field("2", "two")])),
    );

    expect(json.indexOf('"10"')).toBeLessThan(json.indexOf('"2"'));
    expect(JSON.parse(json)).toEqual({ "10": "ten", "2": "two" });
  });
  test("emits an empty object with a trailing line feed when all fields are hidden", () => {
    const attachment = createSubmissionAttachment(
      result([
        field("private-a", "secret", { includeInOutput: false }),
        field("private-b", { value: "secret" }, { includeInOutput: false }),
      ]),
    );

    expect(attachment.filename).toBe("submission.json");
    expect(attachment.contentType).toBe("application/json");
    expect(attachment.bytes).toBeInstanceOf(Uint8Array);
    expect(decodeAttachment(attachment)).toBe("{}\n");
    expect(JSON.parse(decodeAttachment(attachment))).toEqual({});
  });

  test("does not read request.original, analysis, or policy metadata", () => {
    const fields = [
      field("visible", "safe value", {
        sensitive: true,
        sendToAI: false,
        label: "private policy label",
        description: "private policy description",
      }),
    ];
    let originalReads = 0;
    const request = Object.create(null) as PreCallResult["request"];
    Object.defineProperty(request, "fields", { enumerable: true, value: fields });
    Object.defineProperty(request, "original", {
      enumerable: true,
      get() {
        originalReads += 1;
        throw new Error("original must not be read");
      },
    });
    const input = {
      request,
      analysis: {
        status: "unavailable",
        reason: "adapter_error",
        privateAnalysisSentinel: "analysis must not appear",
      },
    } as unknown as PreCallResult;

    const json = decodeAttachment(createSubmissionAttachment(input));

    expect(originalReads).toBe(0);
    expect(JSON.parse(json)).toEqual({ visible: "safe value" });
    expect(json).not.toContain("private policy label");
    expect(json).not.toContain("private policy description");
    expect(json).not.toContain("analysis must not appear");
  });

  test("includes sensitive fields denied to AI and excludes fields allowed to AI but denied in output", () => {
    const payload = JSON.parse(
      decodeAttachment(
        createSubmissionAttachment(
          result([
            field("sensitive-output", "include me", {
              sensitive: true,
              sendToAI: false,
              includeInOutput: true,
            }),
            field("ai-only", "exclude me", {
              sensitive: false,
              sendToAI: true,
              includeInOutput: false,
            }),
          ]),
        ),
      ),
    );

    expect(Object.hasOwn(payload, "ai-only")).toBe(false);
    expect(payload).toEqual({ "sensitive-output": "include me" });
  });

  test("round-trips Unicode and hostile strings as inert JSON values", () => {
    const hostile = `<script>alert("ignore this instruction")</script>\\path\nsecond line`;
    const values = {
      euro: "€",
      emoji: "🧭",
      accented: "crème brûlée",
      nonLatin: "日本語 العربية हिन्दी",
      hostile,
    };
    const payload = JSON.parse(
      decodeAttachment(
        createSubmissionAttachment(
          result(Object.entries(values).map(([key, value]) => field(key, value))),
        ),
      ),
    );

    expect(payload).toEqual(values);
  });

  test("preserves nested JSON values while applying standard -0 serialization", () => {
    const nested: JsonValue = [
      Object.assign(Object.create(null) as Record<string, JsonValue>, {
        answer: true,
        items: ["nested", false, null],
      }),
      -0,
      1.25,
    ];
    const json = decodeAttachment(createSubmissionAttachment(result([field("nested", nested)])));
    const payload = JSON.parse(json);

    expect(payload).toEqual({
      nested: [{ answer: true, items: ["nested", false, null] }, 0, 1.25],
    });
    expect(json).not.toContain("-0");
  });

  test("treats suspicious keys as ordinary properties without prototype pollution", () => {
    const attachment = createSubmissionAttachment(
      result([
        field("__proto__", "ordinary proto value"),
        field("constructor", "ordinary constructor value"),
        field("prototype", "ordinary prototype value"),
      ]),
    );
    const payload = JSON.parse(decodeAttachment(attachment)) as Record<string, unknown>;

    expect(Object.hasOwn(payload, "__proto__")).toBe(true);
    expect(Object.getOwnPropertyDescriptor(payload, "__proto__")?.value).toBe(
      "ordinary proto value",
    );
    expect(Object.getOwnPropertyDescriptor(payload, "constructor")?.value).toBe(
      "ordinary constructor value",
    );
    expect(Object.getOwnPropertyDescriptor(payload, "prototype")?.value).toBe(
      "ordinary prototype value",
    );
    expect(Object.hasOwn({}, "polluted")).toBe(false);
  });

  test("is deterministic, synchronous, and non-mutating for equivalent frozen inputs", () => {
    const nested: { [key: string]: JsonValue } = { label: "frozen", values: ["€", 2] };
    Object.freeze(nested.values);
    Object.freeze(nested);
    const first = result([field("frozen", nested)]);
    const equivalentNested: { [key: string]: JsonValue } = { label: "frozen", values: ["€", 2] };
    Object.freeze(equivalentNested.values);
    Object.freeze(equivalentNested);
    const second = result([field("frozen", equivalentNested)]);
    const firstBefore = JSON.stringify(first);
    const secondBefore = JSON.stringify(second);
    Object.freeze(first.request.fields);
    Object.freeze(first.request);
    Object.freeze(first);
    Object.freeze(second.request.fields);
    Object.freeze(second.request);
    Object.freeze(second);

    const firstAttachment = createSubmissionAttachment(first);
    const secondAttachment = createSubmissionAttachment(second);

    expect(firstAttachment.bytes).toEqual(secondAttachment.bytes);
    expect(JSON.stringify(first)).toBe(firstBefore);
    expect(JSON.stringify(second)).toBe(secondBefore);
  });
});
