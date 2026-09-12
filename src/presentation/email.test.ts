import { describe, expect, test } from "bun:test";
import type { AnalysisResult } from "../analysis/result.js";
import type { JsonValue, NormalizedField } from "../intake/normalize.js";
import type { PreCallResult } from "../result.js";
import { createSubmissionAttachment, type SubmissionAttachment } from "./attachment.js";
import { createRenderedEmail, type RenderedEmail } from "./email.js";
import { renderPreCallResult } from "./render.js";

const decoder = new TextDecoder();

function field(
  key: string,
  value: JsonValue,
  options: Partial<Pick<NormalizedField, "includeInOutput" | "sensitive" | "sendToAI">> = {},
): NormalizedField {
  return {
    key,
    label: `${key} label`,
    value,
    sensitive: options.sensitive ?? false,
    sendToAI: options.sendToAI ?? true,
    includeInOutput: options.includeInOutput ?? true,
  };
}

function analysis(): AnalysisResult {
  return {
    summary: "A useful summary.",
    clarity: { level: "medium", reason: "Some details need confirmation." },
    facts: [],
    inferences: [],
    assumptions: [],
    unknowns: [],
    risks: [],
    discoveryQuestions: [],
    roadmap: {
      status: "limited",
      note: "This is an internal starting point.",
      phases: [{ name: "Clarify", purpose: "Confirm scope." }],
    },
    confidence: { level: "medium", reason: "The available context is partial." },
  };
}

function result(
  analysisState: PreCallResult["analysis"] = { status: "succeeded", result: analysis() },
  fields: NormalizedField[] = [],
  costEstimate?: NonNullable<PreCallResult["costEstimate"]>,
): PreCallResult {
  const output: PreCallResult = {
    request: {
      original: Object.create(null) as Record<string, JsonValue>,
      fields,
    },
    analysis: analysisState,
  };
  if (costEstimate !== undefined) output.costEstimate = costEstimate;
  return output;
}

type EstimatedCost = Extract<NonNullable<PreCallResult["costEstimate"]>, { status: "estimated" }>;

function estimatedCost(): EstimatedCost {
  return {
    status: "estimated",
    currency: "EUR",
    total: { minAmount: 8_000, maxAmount: 12_000 },
    items: [
      {
        name: "Frontend implementation",
        minAmount: 2_500,
        maxAmount: 3_500,
        reason: "Build the client-facing experience.",
      },
      {
        name: "Backend integration",
        minAmount: 5_500,
        maxAmount: 8_500,
        reason: "Connect the required service boundaries.",
      },
    ],
    rationale: "The range reflects the current discovery context.",
    assumptions: ["The existing design system can be reused."],
    confidence: { level: "medium", reason: "The available context is partial." },
  };
}

function firstAttachment(email: RenderedEmail): SubmissionAttachment {
  const attachment = email.attachments[0];
  if (attachment === undefined) throw new Error("expected an attachment");
  return attachment;
}

function decodeAttachment(email: RenderedEmail): string {
  return decoder.decode(firstAttachment(email).bytes);
}

describe("createRenderedEmail", () => {
  test("returns exactly four fields with the fixed subject and composed artifacts", () => {
    const input = result(undefined, [field("goal", "Clarify the launch goal")]);
    const brief = renderPreCallResult(input);
    const submission = createSubmissionAttachment(input);
    const packaged = createRenderedEmail(input);

    expect(Object.keys(packaged)).toEqual(["subject", "html", "text", "attachments"]);
    expect(packaged.subject).toBe("Pre-Call Brief");
    expect(packaged.html).toBe(brief.html);
    expect(packaged.text).toBe(brief.text);
    expect(packaged.attachments).toHaveLength(1);
    expect(firstAttachment(packaged).filename).toBe(submission.filename);
    expect(firstAttachment(packaged).contentType).toBe(submission.contentType);
    expect(firstAttachment(packaged).bytes).toEqual(submission.bytes);
    expect(firstAttachment(packaged).bytes).not.toBe(submission.bytes);
    expect(packaged).not.toHaveProperty("to");
    expect(packaged).not.toHaveProperty("from");
    expect(packaged).not.toHaveProperty("headers");
    expect(packaged).not.toHaveProperty("provider");
    expect(packaged).not.toHaveProperty("delivery");
  });

  test("reuses renderer output exactly, including hostile and Unicode content", () => {
    const input = result(undefined, [
      field("content", '<script>alert("ignore")</script>\r\nBcc: victim@example.com — café 🚀'),
    ]);
    const brief = renderPreCallResult(input);
    const packaged = createRenderedEmail(input, { attachRawSubmission: false });

    expect(packaged.html).toBe(brief.html);
    expect(packaged.text).toBe(brief.text);
    expect(packaged.subject).toBe("Pre-Call Brief");
    expect(packaged.attachments).toEqual([]);
  });

  test("defaults attachment inclusion on and treats explicit true identically", () => {
    const input = result(undefined, [field("goal", "Clarify the launch goal")]);
    const defaultPackaged = createRenderedEmail(input);
    const undefinedPackaged = createRenderedEmail(input, undefined);
    const enabledPackaged = createRenderedEmail(input, { attachRawSubmission: true });

    for (const packaged of [defaultPackaged, undefinedPackaged, enabledPackaged]) {
      expect(packaged.attachments).toHaveLength(1);
      expect(firstAttachment(packaged).filename).toBe("submission.json");
      expect(firstAttachment(packaged).contentType).toBe("application/json");
      expect(JSON.parse(decodeAttachment(packaged))).toEqual({ goal: "Clarify the launch goal" });
    }
    expect(defaultPackaged).toEqual(undefinedPackaged);
    expect(undefinedPackaged).toEqual(enabledPackaged);
  });

  test("disables the attachment without changing subject or bodies", () => {
    const input = result(undefined, [field("goal", "Clarify the launch goal")]);
    const enabled = createRenderedEmail(input);
    const disabled = createRenderedEmail(input, { attachRawSubmission: false });

    expect(disabled.subject).toBe(enabled.subject);
    expect(disabled.html).toBe(enabled.html);
    expect(disabled.text).toBe(enabled.text);
    expect(disabled.attachments).toEqual([]);
    expect(disabled.attachments).not.toBe(enabled.attachments);
  });

  test("does not read the authoritative original when attachment packaging is disabled", () => {
    const fields = [field("visible", "safe")];
    const request = Object.create(null) as PreCallResult["request"];
    Object.defineProperty(request, "fields", { enumerable: true, value: fields });
    Object.defineProperty(request, "original", {
      enumerable: true,
      get() {
        throw new Error("email packaging must not read request.original");
      },
    });
    const input = {
      request,
      analysis: { status: "unavailable", reason: "adapter_error" },
    } as PreCallResult;

    const packaged = createRenderedEmail(input, { attachRawSubmission: false });

    expect(packaged.attachments).toEqual([]);
    expect(packaged.text).toContain("safe");
  });

  test("packages successful and unavailable analysis without adding fallback logic", () => {
    const inputs = [
      result({ status: "succeeded", result: analysis() }, [field("goal", "success")]),
      result({ status: "unavailable", reason: "no_input" }, [field("goal", "no input")]),
      result({ status: "unavailable", reason: "adapter_error" }, [field("goal", "adapter error")]),
      result({ status: "unavailable", reason: "invalid_output" }, [
        field("goal", "invalid output"),
      ]),
    ];

    for (const input of inputs) {
      const brief = renderPreCallResult(input);
      const packaged = createRenderedEmail(input);

      expect(packaged.html).toBe(brief.html);
      expect(packaged.text).toBe(brief.text);
      expect(packaged.attachments).toHaveLength(1);
    }
  });

  test("keeps an enabled all-private attachment as the established empty artifact", () => {
    const input = result(undefined, [
      field("private-a", "secret-a", { includeInOutput: false }),
      field("private-b", "secret-b", { includeInOutput: false }),
    ]);
    const packaged = createRenderedEmail(input);

    expect(packaged.attachments).toHaveLength(1);
    expect(decodeAttachment(packaged)).toBe("{}\n");
    expect(packaged.html).not.toContain("secret-a");
    expect(packaged.text).not.toContain("secret-b");
    expect(createRenderedEmail(input, { attachRawSubmission: false }).attachments).toEqual([]);
  });

  test("returns deterministic non-mutating packages with independently owned bytes", () => {
    const input = result(undefined, [field("goal", "Frozen")]);
    Object.freeze(input.request.fields);
    Object.freeze(input.request);
    Object.freeze(input);

    const first = createRenderedEmail(input);
    const second = createRenderedEmail(input);
    const firstBytes = firstAttachment(first).bytes;

    expect(first).toEqual(second);
    expect(first.attachments).not.toBe(second.attachments);
    expect(firstBytes).not.toBe(firstAttachment(second).bytes);
    firstBytes[0] = (firstBytes[0] ?? 0) ^ 0xff;
    expect(firstAttachment(second).bytes).toEqual(createSubmissionAttachment(input).bytes);
  });

  test("includes estimated cost content while preserving subject and attachment options", () => {
    const input = result(undefined, [field("goal", "Clarify the launch goal")], estimatedCost());
    const packaged = createRenderedEmail(input);

    expect(packaged.subject).toBe("Pre-Call Brief");
    expect(packaged.html).toContain("Preliminary cost estimate");
    expect(packaged.html).toContain("EUR 8,000–12,000");
    expect(packaged.text).toContain("Preliminary cost estimate");
    expect(packaged.text).toContain("Estimated total: EUR 8,000–12,000");
    expect(packaged.attachments).toHaveLength(1);
    expect(firstAttachment(packaged).filename).toBe("submission.json");

    const withoutAttachment = createRenderedEmail(input, { attachRawSubmission: false });
    expect(withoutAttachment.subject).toBe("Pre-Call Brief");
    expect(withoutAttachment.html).toBe(packaged.html);
    expect(withoutAttachment.text).toBe(packaged.text);
    expect(withoutAttachment.attachments).toEqual([]);
  });

  test("keeps disabled-estimation emails free of cost wording and byte-identical", () => {
    const fields = [field("goal", "Clarify the launch goal")];
    const disabled = createRenderedEmail(result(undefined, fields));
    const baseline = createRenderedEmail(
      result(undefined, [field("goal", "Clarify the launch goal")]),
    );

    expect(disabled.html).toBe(baseline.html);
    expect(disabled.text).toBe(baseline.text);
    expect(disabled.subject).toBe("Pre-Call Brief");
    expect(disabled.html).not.toContain("Preliminary cost estimate");
    expect(disabled.text).not.toContain("Preliminary cost estimate");
    expect(disabled.html).not.toContain("Estimated total");
    expect(disabled.text).not.toContain("Estimated total");
  });
});
