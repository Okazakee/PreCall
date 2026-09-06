import { describe, expect, test } from "bun:test";
import * as publicApi from "./index.js";
import {
  type AIAdapter,
  type AnalysisInput,
  createPrecall,
  type DeliveryOutcome,
  type EmailDeliveryRequest,
  type FieldDefinition,
  IntakeValidationError,
} from "./index.js";

const validAnalysis = {
  summary: "The request is ready for a useful first conversation.",
  clarity: { level: "high" as const, reason: "The desired outcome is clear." },
  facts: [],
  inferences: [],
  assumptions: [],
  unknowns: [],
  risks: [],
  discoveryQuestions: [],
  roadmap: { status: "available" as const, phases: [{ name: "Plan", purpose: "Confirm scope." }] },
  confidence: { level: "high" as const, reason: "The submitted information is sufficient." },
};

const fields: FieldDefinition[] = [
  { key: "company", label: "Company" },
  { key: "message", label: "Message" },
  { key: "email", label: "Email", sensitive: true, sendToAI: false, includeInOutput: true },
];

function adapterReturning(output: unknown = validAnalysis): AIAdapter {
  return { generateAnalysis: async () => output };
}
async function expectIntakeCode(
  action: () => unknown,
  code: IntakeValidationError["code"],
): Promise<void> {
  try {
    await action();
    throw new Error("expected intake failure");
  } catch (error) {
    expect(error).toBeInstanceOf(IntakeValidationError);
    expect((error as IntakeValidationError).code).toBe(code);
  }
}
describe("public Precall facade", () => {
  test("processes a privacy-filtered request and delivers the fixed professional email", async () => {
    let input: AnalysisInput | undefined;
    let sent: EmailDeliveryRequest | undefined;
    const ai: AIAdapter = {
      generateAnalysis: async (request) => {
        input = request.input;
        return validAnalysis;
      },
    };
    const precall = createPrecall({ ai, fields });
    const result = await precall.process({
      submission: {
        company: "Small fitness business",
        message: "Customers should book classes online.",
        email: "owner@example.com",
      },
    });

    expect(result.analysis.status).toBe("succeeded");
    expect(input?.fields.map((field) => field.key)).toEqual(["company", "message"]);
    expect(result.request.fields.find((field) => field.key === "email")?.value).toBe(
      "owner@example.com",
    );

    const outcome = await precall.deliver({
      result,
      transport: {
        send: async (request) => {
          sent = request;
        },
      },
      recipient: "studio@example.com",
    });
    expect(outcome).toEqual({ status: "sent" });
    expect(sent?.recipient).toBe("studio@example.com");
    expect(sent?.email.subject).toBe("Pre-Call Brief");
    expect(sent?.email.html).toContain("Submitted information");
    expect(sent?.email.text).toContain("owner@example.com");
    expect(sent?.email.attachments).toHaveLength(1);
    expect(sent?.email.attachments[0]?.filename).toBe("submission.json");
    expect(new TextDecoder().decode(sent?.email.attachments[0]?.bytes)).toContain(
      "owner@example.com",
    );
  });

  test("preserves unavailable analysis distinctions", async () => {
    const throwing = createPrecall({
      ai: {
        generateAnalysis: async () => {
          throw new Error("provider");
        },
      },
      fields,
    });
    const failed = await throwing.process({ submission: { message: "hello" } });
    expect(failed.analysis).toEqual({ status: "unavailable", reason: "adapter_error" });

    const malformed = createPrecall({ ai: adapterReturning({ nope: true }), fields });
    const invalid = await malformed.process({ submission: { message: "hello" } });
    expect(invalid.analysis).toEqual({ status: "unavailable", reason: "invalid_output" });
  });

  test("validates configuration at creation and submissions at process time", async () => {
    expect(() => createPrecall({ ai: {} as AIAdapter, fields })).toThrow(TypeError);
    await expectIntakeCode(
      () =>
        createPrecall({
          ai: adapterReturning(),
          fields: [
            { key: "x", label: "X" },
            { key: "x", label: "X" },
          ],
        }),
      "invalid_configuration",
    );
    await expectIntakeCode(
      () => createPrecall({ ai: adapterReturning(), fields, limits: { maxFields: 1 } }),
      "limit_exceeded",
    );
    const precall = createPrecall({ ai: adapterReturning(), fields });
    await expectIntakeCode(
      () => precall.process({ submission: { unknown: "x" } }),
      "invalid_submission",
    );
  });

  test("snapshots fields, limits, and the configured adapter reference", async () => {
    const mutableFields: FieldDefinition[] = [{ key: "message", label: "Message" }];
    const firstAdapter = adapterReturning();
    const config = { ai: firstAdapter, fields: mutableFields, limits: { maxFields: 2 } };
    const precall = createPrecall(config);
    config.ai = { generateAnalysis: async () => ({ nope: true }) };
    config.fields = [{ key: "other", label: "Other" }];
    config.limits.maxFields = 1;
    const mutableField = mutableFields.at(0);
    if (mutableField === undefined) throw new Error("test fixture field is missing");
    mutableField.key = "other";
    const result = await precall.process({ submission: { message: "still accepted" } });
    expect(result.analysis.status).toBe("succeeded");
    expect(result.request.fields[0]?.key).toBe("message");
  });

  test("keeps concurrent requests isolated", async () => {
    const seen: string[] = [];
    const precall = createPrecall({
      fields: [{ key: "message", label: "Message" }],
      ai: {
        generateAnalysis: async ({ input }) => {
          seen.push(String(input.fields[0]?.value));
          await new Promise((resolve) => setTimeout(resolve, 1));
          return validAnalysis;
        },
      },
    });
    const [a, b] = await Promise.all([
      precall.process({ submission: { message: "A" } }),
      precall.process({ submission: { message: "B" } }),
    ]);
    expect(seen).toHaveLength(2);
    expect(seen).toContain("A");
    expect(seen).toContain("B");
    expect(a.request.original.message).toBe("A");
    expect(b.request.original.message).toBe("B");
  });

  test("forwards exact signals and propagates aborts", async () => {
    const controller = new AbortController();
    let processSignal: AbortSignal | undefined;
    const precall = createPrecall({
      fields: [{ key: "message", label: "Message" }],
      ai: {
        generateAnalysis: async ({ signal }) => {
          processSignal = signal;
          return validAnalysis;
        },
      },
    });
    await precall.process({ submission: { message: "hello" }, signal: controller.signal });
    expect(processSignal).toBe(controller.signal);

    const aborted = new AbortController();
    aborted.abort();
    await expect(
      precall.process({ submission: { message: "hello" }, signal: aborted.signal }),
    ).rejects.toThrow();
    await expect(
      precall.deliver({
        result: await precall.process({ submission: { message: "hello" } }),
        transport: {
          send: async () => {
            throw new Error("must not send");
          },
        },
        recipient: "trusted@example.com",
        signal: aborted.signal,
      }),
    ).rejects.toThrow();
  });

  test("maps delivery failures without changing results and supports disabled attachments", async () => {
    const first = createPrecall({ ai: adapterReturning(), fields });
    const second = createPrecall({ ai: adapterReturning(), fields });
    const result = await first.process({
      submission: { message: "hello", email: "a@example.com" },
    });
    const before = JSON.stringify(result);
    const failed: DeliveryOutcome = await second.deliver({
      result,
      transport: {
        send: async () => {
          throw new Error("offline");
        },
      },
      recipient: "trusted@example.com",
    });
    expect(failed).toEqual({ status: "failed", reason: "transport_error" });
    expect(JSON.stringify(result)).toBe(before);

    let request: EmailDeliveryRequest | undefined;
    await second.deliver({
      result,
      transport: {
        send: async (value) => {
          request = value;
        },
      },
      recipient: "trusted@example.com",
      email: { attachRawSubmission: false },
    });
    expect(request?.email.attachments).toEqual([]);
  });
  test("submit orchestrates processing and delivery while preserving field privacy", async () => {
    let seenInput: AnalysisInput | undefined;
    let sent: EmailDeliveryRequest | undefined;
    const precall = createPrecall({
      ai: {
        generateAnalysis: async ({ input }) => {
          seenInput = input;
          return validAnalysis;
        },
      },
      fields: [
        { key: "project", label: "Project", sendToAI: true },
        { key: "email", label: "Email", sendToAI: false, includeInOutput: true },
        { key: "internal", label: "Internal", sendToAI: false, includeInOutput: false },
      ],
    });

    const outcome = await precall.submit({
      submission: {
        project: "Booking workflow",
        email: "owner@example.com",
        internal: "do not expose",
      },
      transport: {
        send: async (request) => {
          sent = request;
        },
      },
      recipient: "professional@example.com",
    });

    expect(outcome.result.analysis.status).toBe("succeeded");
    expect(outcome.delivery).toEqual({ status: "sent" });
    expect(seenInput?.fields.map((field) => field.key)).toEqual(["project"]);
    expect(sent?.recipient).toBe("professional@example.com");
    expect(sent?.email.subject).toBe("Pre-Call Brief");
    expect(sent?.email.text).toContain("owner@example.com");
    expect(sent?.email.text).not.toContain("do not expose");
  });

  test("submit still delivers a fallback when AI is unavailable", async () => {
    let sent: EmailDeliveryRequest | undefined;
    const precall = createPrecall({
      ai: {
        generateAnalysis: async () => {
          throw new Error("provider unavailable");
        },
      },
      fields: [{ key: "message", label: "Message", sendToAI: true }],
    });

    const outcome = await precall.submit({
      submission: { message: "Please improve our intake form." },
      transport: {
        send: async (request) => {
          sent = request;
        },
      },
      recipient: "professional@example.com",
    });

    expect(outcome.result.analysis).toEqual({ status: "unavailable", reason: "adapter_error" });
    expect(outcome.delivery).toEqual({ status: "sent" });
    expect(sent?.email.text).toContain("AI analysis was unavailable");
    expect(sent?.email.text).toContain("Please improve our intake form.");
  });

  test("submit returns the result when transport fails", async () => {
    const precall = createPrecall({ ai: adapterReturning(), fields });

    const outcome = await precall.submit({
      submission: { message: "hello", email: "owner@example.com" },
      transport: {
        send: async () => {
          throw new Error("offline");
        },
      },
      recipient: "professional@example.com",
    });

    expect(outcome.result.analysis.status).toBe("succeeded");
    expect(outcome.delivery).toEqual({ status: "failed", reason: "transport_error" });
  });

  test("submit preserves cancellation before processing or delivery", async () => {
    const controller = new AbortController();
    controller.abort();
    let aiCalls = 0;
    let transportCalls = 0;
    const precall = createPrecall({
      ai: {
        generateAnalysis: async () => {
          aiCalls += 1;
          return validAnalysis;
        },
      },
      fields: [{ key: "message", label: "Message" }],
    });

    await expect(
      precall.submit({
        submission: { message: "cancelled" },
        transport: {
          send: async () => {
            transportCalls += 1;
          },
        },
        recipient: "professional@example.com",
        signal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(aiCalls).toBe(0);
    expect(transportCalls).toBe(0);
  });

  test("exposes only intentional runtime values", () => {
    const runtimeKeys = Object.keys(publicApi);
    expect(runtimeKeys).toHaveLength(2);
    expect(runtimeKeys).toContain("IntakeValidationError");
    expect(runtimeKeys).toContain("createPrecall");
  });
});
