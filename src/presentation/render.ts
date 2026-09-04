import type { AnalysisResult } from "../analysis/result.js";
import type { JsonValue, NormalizedField } from "../intake/normalize.js";
import type { PreCallResult } from "../result.js";

export type RenderedBrief = { html: string; text: string };

type RenderableItem = { html: string[]; text: string[] };

const UNAVAILABLE_REASON: Record<"no_input" | "adapter_error" | "invalid_output", string> = {
  no_input: "AI analysis was not run because no submitted fields were permitted for AI processing.",
  adapter_error:
    "AI analysis was unavailable for this request. The original inquiry has still been preserved.",
  invalid_output:
    "AI analysis returned an unusable result and was not included. The original inquiry has still been preserved.",
};

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n|\r/g, "\n");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function htmlText(value: string): string {
  return escapeHtml(normalizeLineEndings(value)).replace(/\n/g, "<br>");
}

function jsonString(value: string): string {
  return JSON.stringify(value);
}

function formatStructuredValue(value: JsonValue): string {
  if (value === null) return "null";
  if (typeof value === "string") return jsonString(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Object.is(value, -0) ? "-0" : String(value);
  if (Array.isArray(value)) return `[${value.map(formatStructuredValue).join(", ")}]`;

  const entries: string[] = [];
  for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && Object.hasOwn(descriptor, "value")) {
      entries.push(`${jsonString(key)}: ${formatStructuredValue(descriptor.value as JsonValue)}`);
    }
  }
  return `{${entries.join(", ")}}`;
}

function formatValue(value: JsonValue): string {
  if (typeof value === "string") return value;
  return formatStructuredValue(value);
}

function humanLabel(value: string): string {
  return value
    .split("_")
    .map((word) => (word.length === 0 ? word : `${word[0]?.toUpperCase()}${word.slice(1)}`))
    .join(" ");
}

function section(title: string, body: RenderableItem): RenderableItem {
  return {
    html: [`<section><h2>${htmlText(title)}</h2>`, ...body.html, "</section>"],
    text: [title, ...body.text],
  };
}

function paragraph(value: string): RenderableItem {
  return { html: [`<p>${htmlText(value)}</p>`], text: [normalizeLineEndings(value)] };
}

function list(items: RenderableItem[], ordered = false): RenderableItem {
  const tag = ordered ? "ol" : "ul";
  return {
    html: [`<${tag}>`, ...items.flatMap((item) => [`<li>`, ...item.html, `</li>`]), `</${tag}>`],
    text: items.flatMap((item, itemIndex) =>
      item.text.map(
        (line, lineIndex) =>
          `${lineIndex === 0 ? (ordered ? `${itemIndex + 1}. ` : "- ") : "  "}${line}`,
      ),
    ),
  };
}

function sourceField(field: NormalizedField): RenderableItem {
  const value = formatValue(field.value);
  const structured = typeof field.value === "object" && field.value !== null;
  return {
    html: structured
      ? [`<strong>${htmlText(field.label)}:</strong><pre>${htmlText(value)}</pre>`]
      : [`<p><strong>${htmlText(field.label)}:</strong> ${htmlText(value)}</p>`],
    text: [`${normalizeLineEndings(field.label)}: ${normalizeLineEndings(value)}`],
  };
}

function sourceSection(fields: NormalizedField[]): RenderableItem | undefined {
  const visible = fields.filter((field) => field.includeInOutput === true);
  if (visible.length === 0) return undefined;
  return section("Submitted information", list(visible.map(sourceField)));
}

function successfulSections(analysis: AnalysisResult): RenderableItem[] {
  const sections: RenderableItem[] = [section("Summary", paragraph(analysis.summary))];
  sections.push(
    section("Request clarity", {
      html: [
        `<p><strong>Level:</strong> ${htmlText(humanLabel(analysis.clarity.level))}</p>`,
        `<p><strong>Reason:</strong> ${htmlText(analysis.clarity.reason)}</p>`,
      ],
      text: [
        `Level: ${humanLabel(analysis.clarity.level)}`,
        `Reason: ${normalizeLineEndings(analysis.clarity.reason)}`,
      ],
    }),
  );

  if (analysis.facts.length > 0) {
    sections.push(
      section("Client-stated facts", list(analysis.facts.map((fact) => paragraph(fact.text)))),
    );
  }
  if (analysis.inferences.length > 0) {
    sections.push(
      section(
        "Inferred understanding",
        list(
          analysis.inferences.map((inference) => ({
            html: [
              `<p>${htmlText(inference.text)}</p>`,
              `<p><strong>Confidence:</strong> ${htmlText(humanLabel(inference.confidence))}</p>`,
              `<p><strong>Reason:</strong> ${htmlText(inference.reason)}</p>`,
              ...(inference.needsValidation === undefined
                ? []
                : [
                    `<p><strong>Needs validation:</strong> ${htmlText(inference.needsValidation)}</p>`,
                  ]),
            ],
            text: [
              normalizeLineEndings(inference.text),
              `Confidence: ${humanLabel(inference.confidence)}`,
              `Reason: ${normalizeLineEndings(inference.reason)}`,
              ...(inference.needsValidation === undefined
                ? []
                : [`Needs validation: ${normalizeLineEndings(inference.needsValidation)}`]),
            ],
          })),
        ),
      ),
    );
  }
  if (analysis.assumptions.length > 0) {
    sections.push(
      section(
        "Assumptions",
        list(
          analysis.assumptions.map((assumption) => ({
            html: [
              `<p>${htmlText(assumption.text)}</p>`,
              ...(assumption.impact === undefined
                ? []
                : [`<p><strong>Impact:</strong> ${htmlText(humanLabel(assumption.impact))}</p>`]),
            ],
            text: [
              normalizeLineEndings(assumption.text),
              ...(assumption.impact === undefined
                ? []
                : [`Impact: ${humanLabel(assumption.impact)}`]),
            ],
          })),
        ),
      ),
    );
  }
  if (analysis.unknowns.length > 0) {
    sections.push(
      section(
        "Important unknowns",
        list(
          analysis.unknowns.map((unknown) => ({
            html: [
              `<p>${htmlText(unknown.text)}</p>`,
              `<p><strong>Priority:</strong> ${htmlText(humanLabel(unknown.priority))}</p>`,
              `<p><strong>Why it matters:</strong> ${htmlText(unknown.whyItMatters)}</p>`,
            ],
            text: [
              normalizeLineEndings(unknown.text),
              `Priority: ${humanLabel(unknown.priority)}`,
              `Why it matters: ${normalizeLineEndings(unknown.whyItMatters)}`,
            ],
          })),
        ),
      ),
    );
  }
  if (analysis.risks.length > 0) {
    sections.push(
      section(
        "Risks / complexity drivers",
        list(
          analysis.risks.map((risk) => ({
            html: [
              `<p>${htmlText(risk.text)}</p>`,
              `<p><strong>Reason:</strong> ${htmlText(risk.reason)}</p>`,
              ...(risk.severity === undefined
                ? []
                : [`<p><strong>Severity:</strong> ${htmlText(humanLabel(risk.severity))}</p>`]),
              ...(risk.needsValidation === undefined
                ? []
                : [`<p><strong>Needs validation:</strong> ${htmlText(risk.needsValidation)}</p>`]),
            ],
            text: [
              normalizeLineEndings(risk.text),
              `Reason: ${normalizeLineEndings(risk.reason)}`,
              ...(risk.severity === undefined ? [] : [`Severity: ${humanLabel(risk.severity)}`]),
              ...(risk.needsValidation === undefined
                ? []
                : [`Needs validation: ${normalizeLineEndings(risk.needsValidation)}`]),
            ],
          })),
        ),
      ),
    );
  }
  if (analysis.discoveryQuestions.length > 0) {
    sections.push(
      section(
        "Discovery questions",
        list(
          analysis.discoveryQuestions.map((question) => ({
            html: [
              `<p>${htmlText(question.question)}</p>`,
              `<p><strong>Priority:</strong> ${htmlText(humanLabel(question.priority))}</p>`,
              `<p><strong>Reason:</strong> ${htmlText(question.reason)}</p>`,
            ],
            text: [
              normalizeLineEndings(question.question),
              `Priority: ${humanLabel(question.priority)}`,
              `Reason: ${normalizeLineEndings(question.reason)}`,
            ],
          })),
        ),
      ),
    );
  }

  sections.push(
    section("Preliminary execution path", {
      html: [
        `<p><strong>Status:</strong> ${htmlText(humanLabel(analysis.roadmap.status))}</p>`,
        ...(analysis.roadmap.note === undefined
          ? []
          : [`<p><strong>Note:</strong> ${htmlText(analysis.roadmap.note)}</p>`]),
        list(
          analysis.roadmap.phases.map((phase) => ({
            html: [
              `<p><strong>${htmlText(phase.name)}</strong></p>`,
              `<p>${htmlText(phase.purpose)}</p>`,
            ],
            text: [normalizeLineEndings(phase.name), normalizeLineEndings(phase.purpose)],
          })),
          true,
        ).html.join(""),
      ],
      text: [
        `Status: ${humanLabel(analysis.roadmap.status)}`,
        ...(analysis.roadmap.note === undefined
          ? []
          : [`Note: ${normalizeLineEndings(analysis.roadmap.note)}`]),
        ...list(
          analysis.roadmap.phases.map((phase) => ({
            html: [],
            text: [normalizeLineEndings(phase.name), normalizeLineEndings(phase.purpose)],
          })),
          true,
        ).text,
      ],
    }),
  );
  sections.push(
    section("Confidence / uncertainty", {
      html: [
        `<p><strong>Level:</strong> ${htmlText(humanLabel(analysis.confidence.level))}</p>`,
        `<p><strong>Reason:</strong> ${htmlText(analysis.confidence.reason)}</p>`,
      ],
      text: [
        `Level: ${humanLabel(analysis.confidence.level)}`,
        `Reason: ${normalizeLineEndings(analysis.confidence.reason)}`,
      ],
    }),
  );
  return sections;
}

function unavailableSection(result: PreCallResult): RenderableItem {
  if (result.analysis.status !== "unavailable") {
    throw new Error("unavailableSection requires unavailable analysis");
  }
  return section("Analysis unavailable", paragraph(UNAVAILABLE_REASON[result.analysis.reason]));
}

export function renderPreCallResult(result: PreCallResult): RenderedBrief {
  const sections =
    result.analysis.status === "succeeded"
      ? successfulSections(result.analysis.result)
      : [unavailableSection(result)];
  const source = sourceSection(result.request.fields);
  if (source !== undefined) sections.push(source);

  const html = [
    "<article><h1>Pre-Call Brief</h1>",
    ...sections.flatMap((item) => item.html),
    "</article>",
  ].join("");
  const text = ["Pre-Call Brief", ...sections.flatMap((item) => ["", ...item.text])].join("\n");
  return { html, text };
}
