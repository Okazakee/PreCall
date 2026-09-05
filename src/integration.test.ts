import { describe, expect, test } from "bun:test";
import type {
  BaseLanguageModel,
  BaseLanguageModelCallOptions,
  BaseLanguageModelInput,
} from "@langchain/core/language_models/base";
import { RunnableLambda } from "@langchain/core/runnables";
import { fakeModel } from "@langchain/core/testing";
import type { AnalysisResult } from "./analysis/result.js";
import type { EmailDeliveryRequest } from "./delivery.js";
import { createPrecall } from "./index.js";
import { createLangChainAIAdapter } from "./langchain.js";
import { createResendEmailTransportWithFetch } from "./resend-internal.js";

type CapturedFetch = {
  input: RequestInfo | URL;
  init: RequestInit | undefined;
};
type TestFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const fields = [
  { key: "business", label: "Business", sendToAI: true },
  { key: "goal", label: "Goal", sendToAI: true },
  { key: "email", label: "Email", sensitive: true, sendToAI: false, includeInOutput: true },
] as const;

const analysis: AnalysisResult = {
  summary: "A studio needs a booking workflow.",
  clarity: { level: "high", reason: "The outcome is clear." },
  facts: [{ text: "The client runs a studio.", sourceFieldKeys: ["business"] }],
  inferences: [],
  assumptions: [],
  unknowns: [],
  risks: [],
  discoveryQuestions: [],
  roadmap: { status: "available", phases: [{ name: "Discovery", purpose: "Confirm workflows." }] },
  confidence: { level: "high", reason: "The fixture is complete." },
};

function modelWith(
  output: AnalysisResult,
  capture?: (input: BaseLanguageModelInput) => void,
): BaseLanguageModel {
  const model = fakeModel();
  model.structuredResponse(output as Record<string, unknown>);
  if (capture === undefined) return model;
  const original = model.withStructuredOutput.bind(model);
  model.withStructuredOutput = ((schema, config) => {
    const structured = original(schema, config);
    return RunnableLambda.from<
      BaseLanguageModelInput,
      AnalysisResult,
      BaseLanguageModelCallOptions
    >(async (input, options) => {
      capture(input);
      return (await structured.invoke(input, options)) as unknown as AnalysisResult;
    });
  }) as typeof model.withStructuredOutput;
  return model;
}

function failingModel(error: Error): BaseLanguageModel {
  const model = fakeModel();
  model.withStructuredOutput = (() =>
    RunnableLambda.from<BaseLanguageModelInput, AnalysisResult, BaseLanguageModelCallOptions>(
      async () => {
        throw error;
      },
    )) as typeof model.withStructuredOutput;
  return model;
}

function submission() {
  return {
    business: "A neighborhood studio",
    goal: "Build booking software",
    email: "private@example.com",
  };
}

function response(status = 200): TestFetch {
  return async () => new Response("provider response must stay private", { status });
}

describe("built-in AI and delivery integration", () => {
  test("composes LangChain success, rendering, attachment, and fake email delivery", async () => {
    let modelInput: BaseLanguageModelInput | undefined;
    const precall = createPrecall({
      ai: createLangChainAIAdapter({
        model: modelWith(analysis, (input) => {
          modelInput = input;
        }),
      }),
      fields,
    });
    const result = await precall.process({ submission: submission() });
    let delivered: EmailDeliveryRequest | undefined;
    const outcome = await precall.deliver({
      result,
      recipient: "professional@example.com",
      transport: {
        send: async (request) => {
          delivered = request;
        },
      },
    });

    expect(result.analysis.status).toBe("succeeded");
    expect(outcome).toEqual({ status: "sent" });
    expect(delivered?.recipient).toBe("professional@example.com");
    expect(delivered?.email.subject).toBe("Pre-Call Brief");
    expect(delivered?.email.html).toContain("private@example.com");
    expect(delivered?.email.text).toContain("private@example.com");
    expect(delivered?.email.attachments).toHaveLength(1);
    expect(new TextDecoder().decode(delivered?.email.attachments[0]?.bytes)).toContain(
      "private@example.com",
    );
    expect(JSON.stringify(modelInput)).not.toContain("private@example.com");
  });

  test("keeps delivery available after LangChain failure through real Resend mapping", async () => {
    const precall = createPrecall({
      ai: createLangChainAIAdapter({ model: failingModel(new Error("provider failure")) }),
      fields,
    });
    const result = await precall.process({ submission: submission() });
    const captured: CapturedFetch[] = [];
    const transport = createResendEmailTransportWithFetch(
      { apiKey: "secret-key", from: "briefs@example.test" },
      async (input, init) => {
        captured.push({ input, init });
        return new Response("accepted", { status: 200 });
      },
    );
    const outcome = await precall.deliver({
      result,
      transport,
      recipient: "professional@example.com",
    });
    const body = JSON.parse(String(captured[0]?.init?.body)) as Record<string, unknown>;

    expect(result.analysis).toEqual({ status: "unavailable", reason: "adapter_error" });
    expect(outcome).toEqual({ status: "sent" });
    expect(captured).toHaveLength(1);
    expect(captured[0]?.input).toBe("https://api.resend.com/emails");
    expect(body.to).toEqual(["professional@example.com"]);
    expect(body.subject).toBe("Pre-Call Brief");
    expect(body.attachments).toBeDefined();
  });

  test("keeps a valid LangChain result unchanged when Resend rejects", async () => {
    const precall = createPrecall({
      ai: createLangChainAIAdapter({ model: modelWith(analysis) }),
      fields,
    });
    const result = await precall.process({ submission: submission() });
    const outcome = await precall.deliver({
      result,
      transport: createResendEmailTransportWithFetch(
        { apiKey: "secret-key", from: "briefs@example.test" },
        response(503),
      ),
      recipient: "professional@example.com",
    });

    expect(result.analysis.status).toBe("succeeded");
    expect(outcome).toEqual({ status: "failed", reason: "transport_error" });
  });
});
