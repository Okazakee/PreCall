import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { z as mini } from "zod/mini";
import { IntakeValidationError } from "../intake/normalize.js";
import { createPrecall, type Precall } from "../precall.js";
import { renderPreCallResult } from "../presentation/render.js";
import type { AIAnalysisRequest } from "./run.js";
import { type AnalysisSectionConfig, resolveAnalysisConfiguration } from "./sections.js";

function makeCustomPrecall(
  output: unknown,
  sections: readonly AnalysisSectionConfig[],
): { precall: Precall; requests: AIAnalysisRequest[] } {
  const requests: AIAnalysisRequest[] = [];
  const precall = createPrecall({
    ai: {
      async generateAnalysis(request) {
        requests.push(request);
        return output;
      },
    },
    fields: [{ key: "message", label: "Message", sendToAI: true }],
    analysis: { sections },
  });
  return { precall, requests };
}

const shortTakeSection: AnalysisSectionConfig = {
  key: "shortTake",
  title: "Short take",
  instructions: "Give one concise paragraph.",
  schema: z.string(),
};

const analysis = {
  summary: "A useful summary",
  clarity: { level: "high" as const, reason: "The request is clear" },
  facts: [],
  inferences: [],
  assumptions: [],
  unknowns: [],
  risks: [],
  discoveryQuestions: [],
  roadmap: { status: "available" as const, phases: [{ name: "Next", purpose: "Proceed" }] },
  confidence: { level: "high" as const, reason: "Enough information" },
};

function expectInvalid(value: unknown): void {
  try {
    resolveAnalysisConfiguration(value);
    throw new Error("expected invalid configuration");
  } catch (error) {
    expect(error).toBeInstanceOf(IntakeValidationError);
    expect((error as IntakeValidationError).code).toBe("invalid_configuration");
  }
}

/** A Zod 4 schema built by a documented entrypoint whose classes are not this package's. */
function consumerOwnedSchema(): z.ZodType {
  return mini.object({
    status: mini.enum(["compatible", "uncertain", "incompatible"]),
    reason: mini.string(),
  }) as unknown as z.ZodType;
}

describe("custom analysis sections", () => {
  test("rejects duplicate, reserved, malformed, and oversized metadata", () => {
    const base = { title: "Title", instructions: "Instructions", schema: z.string() };
    expectInvalid({ sections: [{ ...base, key: "1bad" }] });
    expectInvalid({ sections: [{ ...base, key: "analysis" }] });
    expectInvalid({
      sections: [
        { ...base, key: "good" },
        { ...base, key: "good" },
      ],
    });
    expectInvalid({ sections: [{ ...base, key: "good", title: "   " }] });
    expectInvalid({ sections: [{ ...base, key: "good", instructions: "x".repeat(2049) }] });
    expect(resolveAnalysisConfiguration({ sections: [] })).toBeUndefined();
    expectInvalid({
      sections: Array.from({ length: 9 }, (_, index) => ({ ...base, key: `s${index}` })),
    });
  });

  test("snapshots trusted metadata and detached adapter contracts", async () => {
    const section = {
      key: "shortTake",
      title: "Short take",
      instructions: "Be concise",
      schema: z.string(),
    };
    const config = { sections: [section] };
    let seen: AIAnalysisRequest | undefined;
    const precall = createPrecall({
      ai: {
        async generateAnalysis(request) {
          seen = request;
          return { ...analysis, sections: { shortTake: "<safe>" } };
        },
      },
      fields: [{ key: "message", label: "Message", sendToAI: true }],
      analysis: config,
    });
    section.key = "changed";
    section.title = "Changed";
    section.instructions = "Changed";
    const result = await precall.process({ submission: { message: "hello" } });
    expect(result.sections?.shortTake).toEqual({
      title: "Short take",
      status: "succeeded",
      value: "<safe>",
    });
    expect(seen?.analysis?.sections[0]?.key).toBe("shortTake");
    expect(Object.hasOwn(seen?.analysis ?? {}, "title")).toBe(false);
  });
  test("accepts a consumer-owned Zod schema that shares no class identity", async () => {
    const schema = consumerOwnedSchema();
    expect(schema instanceof z.ZodType).toBe(false);
    const { precall, requests } = makeCustomPrecall(
      { ...analysis, sections: { budgetFit: { status: "compatible", reason: "Bounded scope." } } },
      [
        {
          key: "budgetFit",
          title: "Budget fit",
          instructions: "Assess compatibility.",
          schema,
        },
      ],
    );
    const result = await precall.process({ submission: { message: "hello" } });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.analysis?.sections[0]?.outputSchema).toMatchObject({
      type: "object",
      required: ["status", "reason"],
    });
    expect(result.sections).toEqual({
      budgetFit: {
        title: "Budget fit",
        status: "succeeded",
        value: { status: "compatible", reason: "Bounded scope." },
      },
    });
  });

  test("rejects schema lookalikes that are not Zod schemas", () => {
    expectInvalid({
      sections: [
        {
          key: "lookalike",
          title: "Lookalike",
          instructions: "Validate nothing.",
          schema: { safeParse: () => ({ success: true }) },
        },
      ],
    });
    expectInvalid({
      sections: [
        {
          key: "vendor",
          title: "Vendor",
          instructions: "Validate nothing.",
          schema: {
            safeParse: () => ({ success: true }),
            "~standard": { version: 1, vendor: "other", validate: () => ({ value: 1 }) },
          },
        },
      ],
    });
  });

  test("validates a consumer-owned schema independently from canonical analysis", async () => {
    const { precall } = makeCustomPrecall(
      { ...analysis, sections: { budgetFit: "not an object" } },
      [
        {
          key: "budgetFit",
          title: "Budget fit",
          instructions: "Assess compatibility.",
          schema: consumerOwnedSchema(),
        },
      ],
    );
    const result = await precall.process({ submission: { message: "hello" } });
    expect(result.analysis).toEqual({ status: "succeeded", result: analysis });
    expect(result.sections).toEqual({
      budgetFit: { title: "Budget fit", status: "unavailable", reason: "invalid_output" },
    });
  });

  test("isolates invalid sections and preserves canonical output", async () => {
    let calls = 0;
    const precall = createPrecall({
      ai: {
        async generateAnalysis() {
          calls += 1;
          return { ...analysis, sections: { good: { value: "ok" }, bad: 42 } };
        },
      },
      fields: [{ key: "message", label: "Message", sendToAI: true }],
      analysis: {
        sections: [
          {
            key: "good",
            title: "Good",
            instructions: "Return object",
            schema: z.object({ value: z.string() }),
          },
          { key: "bad", title: "Bad", instructions: "Return text", schema: z.string() },
        ],
      },
    });
    const result = await precall.process({ submission: { message: "hello" } });
    expect(calls).toBe(1);
    expect(result.analysis.status).toBe("succeeded");
    expect(result.sections?.good?.status).toBe("succeeded");
    expect(result.sections?.bad).toEqual({
      title: "Bad",
      status: "unavailable",
      reason: "invalid_output",
    });
  });

  test("renders custom values escaped and keeps unavailable sections isolated", () => {
    const rendered = renderPreCallResult({
      request: { original: Object.create(null), fields: [] },
      analysis: { status: "unavailable", reason: "adapter_error" },
      sections: {
        custom: { title: "<Title>", status: "succeeded", value: "<script>" },
        failed: { title: "Failed", status: "unavailable", reason: "invalid_output" },
      },
    });
    expect(rendered.html).toContain("&lt;Title&gt;");
    expect(rendered.html).toContain("&lt;script&gt;");
    expect(rendered.html).toContain("This section returned an unusable result");
  });
});
test("omitting custom sections preserves the default result shape and rendering", async () => {
  let calls = 0;
  const precall = createPrecall({
    ai: {
      async generateAnalysis() {
        calls += 1;
        return analysis;
      },
    },
    fields: [{ key: "message", label: "Message", sendToAI: true }],
  });
  const result = await precall.process({ submission: { message: "hello" } });
  expect(calls).toBe(1);
  expect(Object.hasOwn(result, "sections")).toBe(false);
  expect(renderPreCallResult(result).html).not.toContain("Short take");
});

test("accepts a string section through the same adapter operation", async () => {
  const { precall, requests } = makeCustomPrecall(
    { ...analysis, sections: { shortTake: "A concise opportunity." } },
    [shortTakeSection],
  );
  const result = await precall.process({ submission: { message: "hello" } });
  expect(requests).toHaveLength(1);
  expect(requests[0]?.analysis?.sections[0]).toMatchObject({
    key: "shortTake",
    instructions: "Give one concise paragraph.",
  });
  expect(result.sections).toEqual({
    shortTake: {
      title: "Short take",
      status: "succeeded",
      value: "A concise opportunity.",
    },
  });
});

test("accepts a structured object section and detaches its value", async () => {
  const candidate = { status: "compatible", reason: "The stated scope appears bounded." };
  const section: AnalysisSectionConfig = {
    key: "budgetFit",
    title: "Budget fit",
    instructions: "Assess compatibility.",
    schema: z.object({
      status: z.enum(["compatible", "uncertain", "incompatible"]),
      reason: z.string(),
    }),
  };
  const { precall } = makeCustomPrecall({ ...analysis, sections: { budgetFit: candidate } }, [
    section,
  ]);
  const result = await precall.process({ submission: { message: "hello" } });
  if (result.sections?.budgetFit?.status !== "succeeded") {
    throw new Error("expected structured section");
  }
  expect(result.sections.budgetFit.value).toEqual(candidate);
  expect(result.sections.budgetFit.value).not.toBe(candidate);
  candidate.reason = "mutated after adapter return";
  expect(result.sections.budgetFit.value).toEqual({
    status: "compatible",
    reason: "The stated scope appears bounded.",
  });
});

test("accepts multiple differently shaped sections in declaration order", async () => {
  const sections: AnalysisSectionConfig[] = [
    shortTakeSection,
    {
      key: "signals",
      title: "Signals",
      instructions: "List the notable signals.",
      schema: z.array(z.string()),
    },
    {
      key: "classification",
      title: "Classification",
      instructions: "Classify the opportunity.",
      schema: z.object({ label: z.string(), confidence: z.number() }),
    },
  ];
  const { precall, requests } = makeCustomPrecall(
    {
      ...analysis,
      sections: {
        shortTake: "A concise opportunity.",
        signals: ["clear goal", "open constraints"],
        classification: { label: "promising", confidence: 0.8 },
      },
    },
    sections,
  );
  const result = await precall.process({ submission: { message: "hello" } });
  expect(requests).toHaveLength(1);
  expect(Object.keys(result.sections ?? {})).toEqual(["shortTake", "signals", "classification"]);
  expect(result.sections?.signals).toEqual({
    title: "Signals",
    status: "succeeded",
    value: ["clear goal", "open constraints"],
  });
  expect(result.sections?.classification).toEqual({
    title: "Classification",
    status: "succeeded",
    value: { label: "promising", confidence: 0.8 },
  });
});

test("coexists with specialized cost estimation in one adapter operation", async () => {
  const requests: AIAnalysisRequest[] = [];
  const precall = createPrecall({
    ai: {
      async generateAnalysis(request) {
        requests.push(request);
        return {
          ...analysis,
          costEstimate: {
            status: "estimated",
            items: [
              {
                name: "Discovery",
                minAmount: 1000,
                maxAmount: 1500,
                reason: "Clarify the workflow.",
              },
            ],
            rationale: "The range reflects the limited detail.",
            assumptions: [],
            confidence: { level: "medium", reason: "Several details remain open." },
          },
          sections: { shortTake: "A concise opportunity." },
        };
      },
    },
    fields: [{ key: "message", label: "Message", sendToAI: true }],
    costEstimation: { currency: "EUR" },
    analysis: { sections: [shortTakeSection] },
  });
  const result = await precall.process({ submission: { message: "hello" } });
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({
    costEstimation: { currency: "EUR" },
    analysis: { sections: [{ key: "shortTake" }] },
  });
  expect(result.analysis.status).toBe("succeeded");
  expect(result.costEstimate).toMatchObject({
    status: "estimated",
    currency: "EUR",
    total: { minAmount: 1000, maxAmount: 1500 },
  });
  expect(result.sections?.shortTake?.status).toBe("succeeded");
});

test("keeps canonical analysis when one custom section is malformed", async () => {
  const { precall } = makeCustomPrecall({ ...analysis, sections: { shortTake: 42 } }, [
    shortTakeSection,
  ]);
  const result = await precall.process({ submission: { message: "hello" } });
  expect(result.analysis).toEqual({ status: "succeeded", result: analysis });
  expect(result.sections).toEqual({
    shortTake: { title: "Short take", status: "unavailable", reason: "invalid_output" },
  });
});

test("isolates a malformed custom section from another valid section", async () => {
  const { precall } = makeCustomPrecall(
    { ...analysis, sections: { shortTake: "valid", signals: 42 } },
    [
      shortTakeSection,
      {
        key: "signals",
        title: "Signals",
        instructions: "List signals.",
        schema: z.array(z.string()),
      },
    ],
  );
  const result = await precall.process({ submission: { message: "hello" } });
  expect(result.sections?.shortTake).toEqual({
    title: "Short take",
    status: "succeeded",
    value: "valid",
  });
  expect(result.sections?.signals).toEqual({
    title: "Signals",
    status: "unavailable",
    reason: "invalid_output",
  });
});

test("marks configured sections not_provided when the adapter returns base analysis only", async () => {
  const { precall } = makeCustomPrecall(analysis, [shortTakeSection]);
  const result = await precall.process({ submission: { message: "hello" } });
  expect(result.analysis.status).toBe("succeeded");
  expect(result.sections).toEqual({
    shortTake: { title: "Short take", status: "unavailable", reason: "not_provided" },
  });
});

test("preserves the request and section fallback when the adapter fails", async () => {
  const secret = "provider credentials must stay hidden";
  const precall = createPrecall({
    ai: {
      async generateAnalysis() {
        throw new Error(secret);
      },
    },
    fields: [{ key: "message", label: "Message", sendToAI: true }],
    analysis: { sections: [shortTakeSection] },
  });
  const result = await precall.process({ submission: { message: "hello" } });
  expect(result.request.original.message).toBe("hello");
  expect(result.analysis).toEqual({ status: "unavailable", reason: "adapter_error" });
  expect(result.sections).toEqual({
    shortTake: { title: "Short take", status: "unavailable", reason: "adapter_error" },
  });
  expect(JSON.stringify(result)).not.toContain(secret);
});

test("marks custom sections no_input without invoking the adapter", async () => {
  let calls = 0;
  const precall = createPrecall({
    ai: {
      async generateAnalysis() {
        calls += 1;
        return analysis;
      },
    },
    fields: [{ key: "private", label: "Private", sendToAI: false }],
    analysis: { sections: [shortTakeSection] },
  });
  const result = await precall.process({ submission: { private: "secret" } });
  expect(calls).toBe(0);
  expect(result.request.original.private).toBe("secret");
  expect(result.analysis).toEqual({ status: "unavailable", reason: "no_input" });
  expect(result.sections).toEqual({
    shortTake: { title: "Short take", status: "unavailable", reason: "no_input" },
  });
});

test("propagates cancellation during custom section validation without returning a result", async () => {
  const controller = new AbortController();
  const reason = new Error("custom section cancelled");
  const section: AnalysisSectionConfig = {
    ...shortTakeSection,
    schema: z.string().refine(() => {
      controller.abort(reason);
      return true;
    }),
  };
  const { precall, requests } = makeCustomPrecall(
    { ...analysis, sections: { shortTake: "candidate" } },
    [section],
  );
  const operation = precall.process({
    submission: { message: "hello" },
    signal: controller.signal,
  });
  await expect(operation).rejects.toBe(reason);
  expect(requests).toHaveLength(1);
});

test("does not include hidden fields in custom section adapter input", async () => {
  const requests: AIAnalysisRequest[] = [];
  const precall = createPrecall({
    ai: {
      async generateAnalysis(request) {
        requests.push(request);
        return { ...analysis, sections: { shortTake: "safe" } };
      },
    },
    fields: [
      { key: "message", label: "Message", sendToAI: true },
      { key: "email", label: "Email", sendToAI: false, includeInOutput: true },
    ],
    analysis: { sections: [shortTakeSection] },
  });
  await precall.process({
    submission: { message: "hello", email: "hidden@example.com" },
  });
  const request = requests[0];
  expect(request?.input.fields).toEqual([{ key: "message", label: "Message", value: "hello" }]);
  expect(JSON.stringify(request)).not.toContain("hidden@example.com");
});

test("rejects transformed custom results that are not JSON-compatible", async () => {
  const section: AnalysisSectionConfig = {
    key: "dateValue",
    title: "Date value",
    instructions: "Return a date.",
    schema: z.string().transform(() => new Date(0)),
  };
  const { precall } = makeCustomPrecall({ ...analysis, sections: { dateValue: "2026-01-01" } }, [
    section,
  ]);
  const result = await precall.process({ submission: { message: "hello" } });
  expect(result.analysis.status).toBe("succeeded");
  expect(result.sections).toEqual({
    dateValue: { title: "Date value", status: "unavailable", reason: "invalid_output" },
  });
});

test("contains hostile optional result containers without losing canonical output", async () => {
  const sections = new Proxy(
    {},
    {
      getPrototypeOf() {
        throw new Error("section container access failed");
      },
    },
  );
  const costEstimate = new Proxy(
    {},
    {
      get() {
        throw new Error("cost candidate access failed");
      },
    },
  );
  const precall = createPrecall({
    ai: {
      async generateAnalysis() {
        return { ...analysis, costEstimate, sections };
      },
    },
    fields: [{ key: "message", label: "Message", sendToAI: true }],
    costEstimation: { currency: "EUR" },
    analysis: { sections: [shortTakeSection] },
  });
  const result = await precall.process({ submission: { message: "hello" } });
  expect(result.analysis).toEqual({ status: "succeeded", result: analysis });
  expect(result.costEstimate).toEqual({
    status: "unavailable",
    reason: "invalid_output",
  });
  expect(result.sections).toEqual({
    shortTake: { title: "Short take", status: "unavailable", reason: "invalid_output" },
  });
});

test("propagates cancellation observed during cost validation", async () => {
  const controller = new AbortController();
  const reason = new Error("cost validation cancelled");
  const costEstimate = {
    get status() {
      controller.abort(reason);
      return "invalid";
    },
  };
  const precall = createPrecall({
    ai: {
      async generateAnalysis() {
        return { ...analysis, costEstimate };
      },
    },
    fields: [{ key: "message", label: "Message", sendToAI: true }],
    costEstimation: { currency: "EUR" },
  });
  await expect(
    precall.process({ submission: { message: "hello" }, signal: controller.signal }),
  ).rejects.toBe(reason);
});
