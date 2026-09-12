import { describe, expect, test } from "bun:test";
import type { AnalysisResult } from "../analysis/result.js";
import type { JsonValue, NormalizedField } from "../intake/normalize.js";
import type { PreCallResult } from "../result.js";
import { renderPreCallResult } from "./render.js";

function field(
  key: string,
  label: string,
  value: JsonValue,
  options: Partial<Pick<NormalizedField, "sensitive" | "includeInOutput" | "description">> = {},
): NormalizedField {
  return {
    key,
    label,
    value,
    sensitive: options.sensitive ?? false,
    sendToAI: true,
    includeInOutput: options.includeInOutput ?? true,
    ...(options.description === undefined ? {} : { description: options.description }),
  };
}

function analysis(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
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
    ...overrides,
  };
}

function result(
  analysisState: PreCallResult["analysis"],
  fields: NormalizedField[] = [],
  original: Record<string, JsonValue> = Object.create(null) as Record<string, JsonValue>,
  costEstimate?: NonNullable<PreCallResult["costEstimate"]>,
): PreCallResult {
  const output: PreCallResult = { request: { original, fields }, analysis: analysisState };
  if (costEstimate !== undefined) output.costEstimate = costEstimate;
  return output;
}

type EstimatedCost = Extract<NonNullable<PreCallResult["costEstimate"]>, { status: "estimated" }>;

function estimatedCost(overrides: Partial<EstimatedCost> = {}): EstimatedCost {
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
    ...overrides,
  };
}
function resultWithCost(
  analysisState: PreCallResult["analysis"],
  costEstimate: NonNullable<PreCallResult["costEstimate"]>,
  fields: NormalizedField[] = [],
): PreCallResult {
  return result(
    analysisState,
    fields,
    Object.create(null) as Record<string, JsonValue>,
    costEstimate,
  );
}

describe("renderPreCallResult", () => {
  test("returns the exact shape deterministically without mutating the result", () => {
    const original = Object.create(null) as Record<string, JsonValue>;
    Object.defineProperty(original, "unique-original-sentinel", {
      enumerable: true,
      value: "must not render",
      writable: true,
    });
    const fields = [field("goal", "Goal", "Clarify the goal")];
    const input = result({ status: "succeeded", result: analysis() }, fields, original);
    const before = JSON.stringify(input);

    const first = renderPreCallResult(input);
    const second = renderPreCallResult(input);

    expect(Object.keys(first)).toEqual(["html", "text"]);
    expect(first).toEqual(second);
    expect(first.html).toContain("<article>");
    expect(first.html).toContain("</article>");
    expect(first.text).toContain("Pre-Call Brief");
    expect(JSON.stringify(input)).toBe(before);
    expect(input.request.fields).toBe(fields);
    expect(input.request.original).toBe(original);
  });

  test("renders populated success in semantic order with useful metadata, not provenance", () => {
    const input = result({
      status: "succeeded",
      result: analysis({
        summary: "Summary & <summary>.",
        clarity: { level: "low", reason: 'Reason "needs" validation.' },
        facts: [{ text: "Fact text", sourceFieldKeys: ["fact-source-sentinel"] }],
        inferences: [
          {
            text: "Inference text",
            confidence: "medium",
            reason: "Inference reason",
            basedOnFieldKeys: ["inference-source-sentinel"],
            needsValidation: "Validate this inference.",
          },
        ],
        assumptions: [{ text: "Assumption text", impact: "high" }],
        unknowns: [
          { text: "Unknown text", priority: "important", whyItMatters: "It affects scope." },
        ],
        risks: [
          {
            text: "Risk text",
            reason: "Risk reason",
            severity: "low",
            needsValidation: "Check the dependency.",
          },
        ],
        discoveryQuestions: [
          {
            question: "What is the target?",
            priority: "critical",
            reason: "The target is unclear.",
          },
        ],
        roadmap: {
          status: "available",
          note: "Preliminary only.",
          phases: [
            { name: "First", purpose: "First purpose" },
            { name: "Second", purpose: "Second purpose" },
          ],
        },
        confidence: { level: "high", reason: "Most needed context is present." },
      }),
    });

    const rendered = renderPreCallResult(input);
    const orderedHeadings = [
      "Summary",
      "Request clarity",
      "Client-stated facts",
      "Inferred understanding",
      "Assumptions",
      "Important unknowns",
      "Risks / complexity drivers",
      "Discovery questions",
      "Preliminary execution path",
      "Confidence / uncertainty",
    ];
    let previous = -1;
    for (const heading of orderedHeadings) {
      const position = rendered.text.indexOf(heading);
      expect(position).toBeGreaterThan(previous);
      previous = position;
    }
    expect(rendered.text).toContain("Level: Low");
    expect(rendered.text).toContain("Needs validation: Validate this inference.");
    expect(rendered.text).toContain("Impact: High");
    expect(rendered.text).toContain("Priority: Important");
    expect(rendered.text).toContain("Severity: Low");
    expect(rendered.text).toContain("Status: Available");
    expect(rendered.text).toContain("1. First");
    expect(rendered.text).toContain("2. Second");
    expect(rendered.text).toContain("  First purpose");
    expect(rendered.text).toContain("  Second purpose");
    expect(rendered.text).not.toContain("fact-source-sentinel");
    expect(rendered.text).not.toContain("inference-source-sentinel");
    expect(rendered.html).not.toContain("sourceFieldKeys");
    expect(rendered.html).not.toContain("basedOnFieldKeys");
  });

  test("omits empty optional sections and undefined optional details", () => {
    const rendered = renderPreCallResult(
      result({
        status: "succeeded",
        result: analysis({
          inferences: [
            {
              text: "Inference",
              confidence: "high",
              reason: "Reason",
              basedOnFieldKeys: ["field"],
            },
          ],
          assumptions: [{ text: "Assumption" }],
          risks: [{ text: "Risk", reason: "Reason" }],
          roadmap: {
            status: "insufficient_information",
            phases: [{ name: "Phase", purpose: "Purpose" }],
          },
        }),
      }),
    );

    for (const omitted of [
      "Client-stated facts",
      "Important unknowns",
      "Discovery questions",
      "Needs validation:",
      "Impact:",
      "Severity:",
      "Note:",
    ]) {
      expect(rendered.text).not.toContain(omitted);
    }
    expect(rendered.text).toContain("Risks / complexity drivers");
    expect(rendered.text).toContain("Preliminary execution path");
    expect(rendered.text).toContain("Confidence / uncertainty");
  });

  test("projects visible normalized fields in order and keeps source private metadata out", () => {
    const suspicious = Object.create(null) as Record<string, JsonValue>;
    Object.defineProperty(suspicious, "__proto__", { enumerable: true, value: "<nested>" });
    Object.defineProperty(suspicious, "constructor", { enumerable: true, value: true });
    Object.defineProperty(suspicious, "prototype", { enumerable: true, value: null });
    const fields = [
      field("first-private-key", "First & <field>", "one\r\ntwo", {
        sensitive: true,
        description: "private policy description",
      }),
      field("output-private-key", "Do not show", "hidden", { includeInOutput: false }),
      field("structured-key", "Structured", [suspicious, false, null, -0, "<array>"], {
        description: "another policy description",
      }),
    ];
    const original = Object.create(null) as Record<string, JsonValue>;
    Object.defineProperty(original, "original-only-sentinel", {
      enumerable: true,
      value: "original-only-sentinel",
    });
    const rendered = renderPreCallResult(
      result({ status: "succeeded", result: analysis() }, fields, original),
    );

    expect(rendered.text.indexOf("First & <field>")).toBeLessThan(
      rendered.text.indexOf("Structured"),
    );
    expect(rendered.text).toContain("Submitted information");
    expect(rendered.text).not.toContain("Original submission");
    expect(rendered.text).toContain("First & <field>: one\ntwo");
    expect(rendered.text).toContain(
      '{"__proto__": "<nested>", "constructor": true, "prototype": null}',
    );
    expect(rendered.text).toContain("-0");
    expect(rendered.text).toContain('"<array>"');
    expect(rendered.text).not.toContain("Do not show");
    expect(rendered.text).not.toContain("output-private-key");
    expect(rendered.text).not.toContain("original-only-sentinel");
    expect(rendered.text).not.toContain("private policy description");
    expect(rendered.html).toContain("First &amp; &lt;field&gt;");
    expect(rendered.html).toContain("&quot;__proto__&quot;");
    expect(rendered.html).toContain("&lt;nested&gt;");
    expect(rendered.html).not.toContain("Do not show");
  });

  test("escapes AI and client strings, normalizes line endings, and preserves Unicode", () => {
    const rendered = renderPreCallResult(
      result(
        {
          status: "succeeded",
          result: analysis({
            summary: `AI & < > " '\r\nnext`,
            facts: [{ text: `Client & < > " '\rvalue`, sourceFieldKeys: ["source"] }],
          }),
        },
        [
          field("visible", "Client & < > \" '", "Value & < > \" '\r\nline"),
          field("hidden", "Hidden", "secret", { includeInOutput: false }),
        ],
      ),
    );

    expect(rendered.html).toContain("AI &amp; &lt; &gt; &quot; &#39;<br>next");
    expect(rendered.html).toContain("Client &amp; &lt; &gt; &quot; &#39;<br>value");
    expect(rendered.html).not.toContain("<summary>");
    expect(rendered.text).toContain("AI & < > \" '\nnext");
    expect(rendered.text).toContain("Client & < > \" '\nvalue");
    expect(rendered.text).toContain("Value & < > \" '\nline");
    expect(rendered.text).toContain("Client & < > \" '");
  });

  test("numbers roadmap phases and normalizes phase-name line endings in text", () => {
    const rendered = renderPreCallResult(
      result({
        status: "succeeded",
        result: analysis({
          roadmap: {
            status: "available",
            phases: [
              { name: "First\r\nphase", purpose: "First purpose" },
              { name: "Second\rphase", purpose: "Second purpose" },
            ],
          },
        }),
      }),
    );

    expect(rendered.text).toContain("1. First\nphase\n  First purpose");
    expect(rendered.text).toContain("2. Second\nphase\n  Second purpose");
    expect(rendered.text).not.toContain("\r");
  });

  test("escapes untrusted AI strings in every analysis section", () => {
    const dangerous = `<img src=x onerror=alert("ai")>`;
    const rendered = renderPreCallResult(
      result({
        status: "succeeded",
        result: analysis({
          summary: dangerous,
          facts: [{ text: dangerous, sourceFieldKeys: ["fact"] }],
          inferences: [
            {
              text: dangerous,
              confidence: "low",
              reason: dangerous,
              basedOnFieldKeys: ["inference"],
              needsValidation: dangerous,
            },
          ],
          assumptions: [{ text: dangerous, impact: "low" }],
          unknowns: [{ text: dangerous, priority: "minor", whyItMatters: dangerous }],
          risks: [
            {
              text: dangerous,
              reason: dangerous,
              severity: "low",
              needsValidation: dangerous,
            },
          ],
          discoveryQuestions: [{ question: dangerous, priority: "secondary", reason: dangerous }],
          roadmap: {
            status: "limited",
            note: dangerous,
            phases: [{ name: dangerous, purpose: dangerous }],
          },
          confidence: { level: "low", reason: dangerous },
        }),
      }),
    );

    expect(rendered.html).not.toContain(dangerous);
    expect(rendered.html).toContain("&lt;img src=x onerror=alert(&quot;ai&quot;)&gt;");
    expect(rendered.text).toContain(dangerous);
  });

  test("renders every unavailable reason safely without successful-section leakage", () => {
    const reasons = {
      no_input:
        "AI analysis was not run because no submitted fields were permitted for AI processing.",
      adapter_error:
        "AI analysis was unavailable for this request. The original inquiry has still been preserved.",
      invalid_output:
        "AI analysis returned an unusable result and was not included. The original inquiry has still been preserved.",
    } as const;
    for (const reason of Object.keys(reasons) as Array<keyof typeof reasons>) {
      const rendered = renderPreCallResult(
        result({ status: "unavailable", reason }, [field("visible", "Visible", "value")]),
      );
      expect(rendered.text).toContain(reasons[reason]);
      expect(rendered.text).toContain("Analysis unavailable");
      expect(rendered.text).not.toContain("Summary");
      expect(rendered.text).not.toContain("Request clarity");
      expect(rendered.text).not.toContain("Preliminary execution path");
      expect(rendered.text).toContain("Submitted information");
      expect(rendered.html).not.toContain("provider");
      expect(rendered.html).not.toContain("error details");
    }
  });

  test("keeps unavailable output nonempty and omits source heading when all fields are hidden", () => {
    const rendered = renderPreCallResult(
      result({ status: "unavailable", reason: "adapter_error" }, [
        field("hidden", "Hidden", "not output", { includeInOutput: false }),
      ]),
    );
    expect(rendered.html.length).toBeGreaterThan(0);
    expect(rendered.text.length).toBeGreaterThan(0);
    expect(rendered.text).not.toContain("Submitted information");
    expect(rendered.html).not.toContain("Submitted information");
    expect(rendered.text).not.toContain("not output");
  });

  test("renders estimated totals, item order, and semantic section order", () => {
    const fields = [field("goal", "Goal", "Build the product")];
    const first = renderPreCallResult(
      resultWithCost({ status: "succeeded", result: analysis() }, estimatedCost(), fields),
    );

    expect(first.text).toContain("Estimated total: EUR 8,000–12,000");
    const frontend = "Frontend implementation — EUR 2,500–3,500";
    const backend = "Backend integration — EUR 5,500–8,500";
    const frontendPosition = first.text.indexOf(frontend);
    const backendPosition = first.text.indexOf(backend);
    expect(frontendPosition).toBeGreaterThan(-1);
    expect(
      first.text.indexOf("Build the client-facing experience.", frontendPosition),
    ).toBeGreaterThan(frontendPosition);
    expect(backendPosition).toBeGreaterThan(frontendPosition);
    expect(
      first.text.indexOf("Connect the required service boundaries.", backendPosition),
    ).toBeGreaterThan(backendPosition);

    const costPosition = first.text.indexOf("Preliminary cost estimate");
    expect(costPosition).toBeGreaterThan(first.text.indexOf("Preliminary execution path"));
    expect(costPosition).toBeLessThan(first.text.indexOf("Confidence / uncertainty"));
    expect(first.text.indexOf("Submitted information")).toBeGreaterThan(
      first.text.indexOf("Confidence / uncertainty"),
    );

    const second = renderPreCallResult(
      resultWithCost(
        { status: "succeeded", result: analysis() },
        estimatedCost({
          items: [
            {
              name: "Discovery",
              minAmount: 1_500,
              maxAmount: 2_500,
              reason: "Clarify the remaining scope.",
            },
            {
              name: "Delivery",
              minAmount: 5_000,
              maxAmount: 7_000,
              reason: "Implement the agreed scope.",
            },
          ],
          total: { minAmount: 6_500, maxAmount: 9_500 },
        }),
      ),
    );
    expect(second.text).toContain("Estimated total: EUR 6,500–9,500");
  });

  test("renders insufficient information and every missing-information entry", () => {
    const rendered = renderPreCallResult(
      resultWithCost(
        { status: "succeeded", result: analysis() },
        {
          status: "insufficient_information",
          reason: "The scope is not specific enough.",
          missingInformation: ["Target platform", "Required integrations", "Expected launch date"],
        },
      ),
    );

    expect(rendered.text).toContain("Preliminary cost estimate");
    expect(rendered.text).toContain("The scope is not specific enough.");
    for (const missing of ["Target platform", "Required integrations", "Expected launch date"]) {
      expect(rendered.text).toContain(`- ${missing}`);
    }
    expect(rendered.text).toContain("Missing information to clarify during discovery:");
  });

  test("renders each exact unavailable cost-estimate message", () => {
    const messages = {
      no_input:
        "Cost estimation was not run because no submitted fields were permitted for AI processing.",
      adapter_error: "Cost estimation was unavailable for this request.",
      invalid_output:
        "Cost estimation returned an unusable result and was not included. The original inquiry has still been preserved.",
      not_provided: "Cost estimation was not provided by the configured AI implementation.",
    } as const;

    for (const reason of Object.keys(messages) as Array<keyof typeof messages>) {
      const rendered = renderPreCallResult(
        resultWithCost(
          { status: "succeeded", result: analysis() },
          { status: "unavailable", reason },
        ),
      );
      expect(rendered.text).toContain(messages[reason]);
    }
  });

  test("escapes estimate strings in HTML while preserving them in text", () => {
    const hostile = `<script>alert(1)</script> & " '`;
    const rendered = renderPreCallResult(
      resultWithCost(
        { status: "succeeded", result: analysis() },
        estimatedCost({
          items: [
            {
              name: hostile,
              minAmount: 1,
              maxAmount: 2,
              reason: "A safe item reason.",
            },
          ],
          total: { minAmount: 1, maxAmount: 2 },
          rationale: hostile,
          assumptions: [hostile],
        }),
      ),
    );

    expect(rendered.html).not.toContain(hostile);
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot; &#39;");
    expect(rendered.text).toContain(hostile);
  });

  test("omits an empty assumptions list and includes non-empty assumptions", () => {
    const withoutAssumptions = renderPreCallResult(
      resultWithCost(
        { status: "succeeded", result: analysis() },
        estimatedCost({ assumptions: [] }),
      ),
    );
    expect(withoutAssumptions.text).not.toContain("Assumptions:");

    const withAssumptions = renderPreCallResult(
      resultWithCost(
        { status: "succeeded", result: analysis() },
        estimatedCost({ assumptions: ["The design system is reusable."] }),
      ),
    );
    expect(withAssumptions.text).toContain("Assumptions:");
    expect(withAssumptions.text).toContain("- The design system is reusable.");
  });

  test("keeps estimation-disabled rendering byte-identical without a cost section", () => {
    const disabled = result({ status: "succeeded", result: analysis() }, [
      field("goal", "Goal", "Build the product"),
    ]);
    const sameFixture = result({ status: "succeeded", result: analysis() }, [
      field("goal", "Goal", "Build the product"),
    ]);
    const rendered = renderPreCallResult(disabled);
    expect(disabled).not.toHaveProperty("costEstimate");
    expect(rendered).toEqual(renderPreCallResult(sameFixture));
    expect(rendered.text).not.toContain("Preliminary cost estimate");
  });

  test("orders cost unavailability after unavailable analysis", () => {
    const rendered = renderPreCallResult(
      resultWithCost(
        { status: "unavailable", reason: "adapter_error" },
        { status: "unavailable", reason: "invalid_output" },
        [field("goal", "Goal", "Build the product")],
      ),
    );
    expect(rendered.text.indexOf("Analysis unavailable")).toBeGreaterThan(-1);
    expect(rendered.text.indexOf("Preliminary cost estimate")).toBeGreaterThan(
      rendered.text.indexOf("Analysis unavailable"),
    );
  });
});
