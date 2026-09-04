import { describe, expect, test } from "bun:test";
import type { AnalysisInput } from "./analysis/input.js";
import type { AnalysisResult } from "./analysis/result.js";
import type { AIAdapter, AIAnalysisRequest } from "./analysis/run.js";
import { normalizeSubmission } from "./intake/normalize.js";
import { processNormalizedSubmission } from "./result.js";

const validResult: AnalysisResult = {
  summary: "The request needs clarification before implementation.",
  clarity: { level: "low", reason: "The desired outcome is not yet specific." },
  facts: [],
  inferences: [],
  assumptions: [],
  unknowns: [],
  risks: [],
  discoveryQuestions: [
    {
      question: "What outcome should the first release achieve?",
      priority: "critical",
      reason: "The goal is unclear.",
    },
  ],
  roadmap: {
    status: "insufficient_information",
    phases: [{ name: "Clarify", purpose: "Establish scope and constraints." }],
  },
  confidence: { level: "insufficient_information", reason: "The request lacks essential context." },
};

function adapterReturning(
  output: unknown,
  onCall?: (request: AIAnalysisRequest) => void,
): AIAdapter {
  return {
    async generateAnalysis(request) {
      onCall?.(request);
      return output;
    },
  };
}

describe("processNormalizedSubmission", () => {
  test("composes a successful analysis with the detached request", async () => {
    const normalized = normalizeSubmission(
      [{ key: "goal", label: "Goal", description: "Desired outcome", sendToAI: true }],
      { goal: "Clarify this request" },
    );

    const result = await processNormalizedSubmission(adapterReturning(validResult), normalized);

    expect(result.analysis).toEqual({ status: "succeeded", result: validResult });
    expect(Object.keys(result)).toEqual(["request", "analysis"]);
    expect(result.request).toEqual({
      original: { goal: "Clarify this request" },
      fields: [
        {
          key: "goal",
          label: "Goal",
          value: "Clarify this request",
          description: "Desired outcome",
          sensitive: false,
          sendToAI: true,
          includeInOutput: true,
        },
      ],
    });
    expect(Object.getPrototypeOf(result.request.original)).toBeNull();
  });

  test("preserves a vague valid success without inventing processing metadata", async () => {
    const normalized = normalizeSubmission([{ key: "message", label: "Message", sendToAI: true }], {
      message: "hello",
    });
    const result = await processNormalizedSubmission(adapterReturning(validResult), normalized);

    expect(result.analysis.status).toBe("succeeded");
    expect(Object.keys(result.analysis)).toEqual(["status", "result"]);
    expect(Object.keys(result)).toEqual(["request", "analysis"]);
    expect(Object.keys(result.request)).toEqual(["original", "fields"]);
  });

  test("returns no_input for all-private fields without calling the adapter", async () => {
    let calls = 0;
    const normalized = normalizeSubmission(
      [
        { key: "secret", label: "Secret", sensitive: true },
        { key: "hidden", label: "Hidden", sendToAI: false },
      ],
      { secret: "do not send", hidden: "also private" },
    );

    const result = await processNormalizedSubmission(
      adapterReturning(validResult, () => {
        calls += 1;
      }),
      normalized,
    );

    expect(calls).toBe(0);
    expect(result.analysis).toEqual({ status: "unavailable", reason: "no_input" });
    expect(result.request.fields.map((field) => field.key)).toEqual(["secret", "hidden"]);
    expect(result.request.original).toEqual({ secret: "do not send", hidden: "also private" });
  });

  test("maps adapter errors without exposing their raw details", async () => {
    const secret = "provider credentials and private failure details";
    const normalized = normalizeSubmission([{ key: "goal", label: "Goal", sendToAI: true }], {
      goal: "test",
    });
    const result = await processNormalizedSubmission(
      {
        async generateAnalysis() {
          throw new Error(secret);
        },
      },
      normalized,
    );

    expect(result.analysis).toEqual({ status: "unavailable", reason: "adapter_error" });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(result.request.original).toEqual({ goal: "test" });
  });

  test("maps malformed adapter output without retaining it", async () => {
    const normalized = normalizeSubmission([{ key: "goal", label: "Goal", sendToAI: true }], {
      goal: "test",
    });
    const malformed = { secret: "must not escape" };
    const result = await processNormalizedSubmission(adapterReturning(malformed), normalized);

    expect(result.analysis).toEqual({ status: "unavailable", reason: "invalid_output" });
    expect(JSON.stringify(result)).not.toContain("must not escape");
    expect(result.request.original).toEqual({ goal: "test" });
  });

  test("retains policy fields while filtering AI input", async () => {
    let captured: AnalysisInput | undefined;
    const normalized = normalizeSubmission(
      [
        { key: "private", label: "Private", sensitive: true },
        { key: "visible", label: "Visible", sendToAI: true, includeInOutput: false },
        { key: "sensitiveVisible", label: "Sensitive visible", sensitive: true, sendToAI: true },
      ],
      { private: "private", visible: "visible", sensitiveVisible: "sensitive" },
    );

    const result = await processNormalizedSubmission(
      adapterReturning(validResult, (request) => {
        captured = request.input;
      }),
      normalized,
    );

    expect(result.request.fields).toEqual([
      {
        key: "private",
        label: "Private",
        value: "private",
        sensitive: true,
        sendToAI: false,
        includeInOutput: true,
      },
      {
        key: "visible",
        label: "Visible",
        value: "visible",
        sensitive: false,
        sendToAI: true,
        includeInOutput: false,
      },
      {
        key: "sensitiveVisible",
        label: "Sensitive visible",
        value: "sensitive",
        sensitive: true,
        sendToAI: true,
        includeInOutput: true,
      },
    ]);
    expect(captured).toEqual({
      fields: [
        { key: "visible", label: "Visible", value: "visible" },
        { key: "sensitiveVisible", label: "Sensitive visible", value: "sensitive" },
      ],
    });
  });

  test("detaches request and captured input before adapter async work", async () => {
    let release: ((value: unknown) => void) | undefined;
    const pending = new Promise<unknown>((resolve) => {
      release = resolve;
    });
    let captured: AnalysisInput | undefined;
    const normalized = normalizeSubmission([{ key: "details", label: "Details", sendToAI: true }], {
      details: { nested: [{ keep: true }] },
    });
    const operation = processNormalizedSubmission(
      {
        async generateAnalysis(request) {
          captured = request.input;
          return pending;
        },
      },
      normalized,
    );

    const originalField = normalized.fields[0];
    if (
      originalField === undefined ||
      typeof originalField.value !== "object" ||
      originalField.value === null ||
      Array.isArray(originalField.value)
    ) {
      throw new Error("test fixture is missing its object value");
    }
    const fieldNested = originalField.value.nested;
    const fieldNestedFirst = Array.isArray(fieldNested) ? fieldNested[0] : undefined;
    if (
      !Array.isArray(fieldNested) ||
      fieldNestedFirst === undefined ||
      typeof fieldNestedFirst !== "object" ||
      fieldNestedFirst === null ||
      Array.isArray(fieldNestedFirst)
    ) {
      throw new Error("test fixture is missing its nested object");
    }
    fieldNestedFirst.keep = false;

    const originalValue = normalized.original.details;
    if (
      typeof originalValue !== "object" ||
      originalValue === null ||
      Array.isArray(originalValue)
    ) {
      throw new Error("test fixture is missing its original object");
    }
    const originalNested = originalValue.nested;
    const originalNestedFirst = Array.isArray(originalNested) ? originalNested[0] : undefined;
    if (
      !Array.isArray(originalNested) ||
      originalNestedFirst === undefined ||
      typeof originalNestedFirst !== "object" ||
      originalNestedFirst === null ||
      Array.isArray(originalNestedFirst)
    ) {
      throw new Error("test fixture is missing its original nested object");
    }
    originalNestedFirst.keep = false;
    if (release === undefined) throw new Error("adapter was not reached");
    release(validResult);
    const result = await operation;

    expect(result.request.fields[0]?.value).toEqual({ nested: [{ keep: true }] });
    expect(result.request.original.details).toEqual({ nested: [{ keep: true }] });
    expect(captured?.fields[0]?.value).toEqual({ nested: [{ keep: true }] });

    const requestField = result.request.fields[0];
    if (requestField === undefined) throw new Error("result is missing its field");
    requestField.label = "changed";
    const requestFieldValue = requestField.value;
    if (
      typeof requestFieldValue !== "object" ||
      requestFieldValue === null ||
      Array.isArray(requestFieldValue)
    ) {
      throw new Error("result is missing its field object");
    }
    const requestNested = requestFieldValue.nested;
    const requestNestedFirst = Array.isArray(requestNested) ? requestNested[0] : undefined;
    if (
      !Array.isArray(requestNested) ||
      requestNestedFirst === undefined ||
      typeof requestNestedFirst !== "object" ||
      requestNestedFirst === null ||
      Array.isArray(requestNestedFirst)
    ) {
      throw new Error("result is missing its nested object");
    }
    requestNestedFirst.keep = false;
    expect(result.request.original.details).toEqual({ nested: [{ keep: true }] });
    expect(captured?.fields[0]?.value).toEqual({ nested: [{ keep: true }] });

    const requestOriginalValue = result.request.original.details;
    if (
      typeof requestOriginalValue !== "object" ||
      requestOriginalValue === null ||
      Array.isArray(requestOriginalValue)
    ) {
      throw new Error("result is missing its original object");
    }
    const requestOriginalNested = requestOriginalValue.nested;
    const requestOriginalNestedFirst = Array.isArray(requestOriginalNested)
      ? requestOriginalNested[0]
      : undefined;
    if (
      !Array.isArray(requestOriginalNested) ||
      requestOriginalNestedFirst === undefined ||
      typeof requestOriginalNestedFirst !== "object" ||
      requestOriginalNestedFirst === null ||
      Array.isArray(requestOriginalNestedFirst)
    ) {
      throw new Error("result is missing its original nested object");
    }
    requestOriginalNestedFirst.keep = false;
    expect(result.request.fields[0]?.value).toEqual({ nested: [{ keep: false }] });

    expect(normalized.fields[0]?.label).toBe("Details");
    expect(normalized.fields[0]?.value).toEqual({ nested: [{ keep: false }] });
    expect(normalized.original.details).toEqual({ nested: [{ keep: false }] });
    expect(result.request.fields[0]?.value).toEqual({ nested: [{ keep: false }] });
    expect(result.request.original.details).toEqual({ nested: [{ keep: false }] });
  });

  test("propagates pre-abort and adapter-time cancellation", async () => {
    const normalized = normalizeSubmission([{ key: "goal", label: "Goal", sendToAI: true }], {
      goal: "test",
    });
    const pre = new AbortController();
    const preReason = { kind: "pre-aborted" };
    pre.abort(preReason);
    await expect(
      processNormalizedSubmission(adapterReturning(validResult), normalized, pre.signal),
    ).rejects.toBe(preReason);

    const during = new AbortController();
    const duringReason = new Error("caller cancelled");
    await expect(
      processNormalizedSubmission(
        {
          async generateAnalysis() {
            during.abort(duringReason);
            throw new Error("late provider error");
          },
        },
        normalized,
        during.signal,
      ),
    ).rejects.toBe(duringReason);
  });

  test("copies hostile nested keys without invoking prototype semantics", async () => {
    const value = Object.create(null) as Record<string, unknown>;
    for (const key of ["__proto__", "constructor", "prototype"]) {
      Object.defineProperty(value, key, {
        configurable: true,
        enumerable: true,
        value: { key },
        writable: true,
      });
    }
    const normalized = normalizeSubmission([{ key: "value", label: "Value", sendToAI: true }], {
      value,
    });
    const result = await processNormalizedSubmission(adapterReturning(validResult), normalized);
    const snapshot = result.request.original.value;
    if (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot)) {
      throw new Error("test fixture is missing its object value");
    }
    expect(Object.getPrototypeOf(snapshot)).toBeNull();
    expect(Reflect.ownKeys(snapshot)).toEqual(["__proto__", "constructor", "prototype"]);
    expect(Object.getOwnPropertyDescriptor(result.request.original, "value")).toMatchObject({
      enumerable: true,
      writable: true,
    });
  });
});
