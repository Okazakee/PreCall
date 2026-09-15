import type { AIAdapter, AnalysisInput, AnalysisResult } from "precall";

/**
 * Deterministic stand-in adapter.
 *
 * It is rule-based on purpose: the playground proves the integration boundary, the renderer, and
 * the privacy filtering without a provider, and it is the default execution mode. PreCall still
 * validates whatever it returns against the canonical analysis contract.
 */

const FULL_CONTEXT_KEYS = ["projectSummary", "goals", "budget", "timeline"] as const;

function clip(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

function collect(input: AnalysisInput): {
  values: Map<string, string>;
  labels: Map<string, string>;
} {
  const values = new Map<string, string>();
  const labels = new Map<string, string>();
  for (const field of input.fields) {
    labels.set(field.key, field.label);
    if (typeof field.value === "string" && field.value.trim().length > 0) {
      values.set(field.key, field.value.trim());
    }
  }
  return { values, labels };
}

export function buildDeterministicAnalysis(input: AnalysisInput): AnalysisResult {
  const { values, labels } = collect(input);
  const missing = FULL_CONTEXT_KEYS.filter((key) => !values.has(key));
  const missingLabels = missing.map((key) => labels.get(key) ?? key);
  const company = values.get("business") ?? "An unnamed prospect";
  const summary = values.get("projectSummary");

  const facts: AnalysisResult["facts"] = [];
  for (const field of input.fields) {
    if (typeof field.value !== "string" || field.value.trim().length === 0) continue;
    facts.push({
      text: `${field.label}: ${clip(field.value.trim(), 240)}`,
      sourceFieldKeys: [field.key],
    });
  }

  const inferences: AnalysisResult["inferences"] = [];
  const budget = values.get("budget");
  if (budget !== undefined) {
    inferences.push({
      text: `The stated budget range (${clip(budget, 120)}) is context the client chose to share, not an agreed figure.`,
      confidence: "medium",
      reason: "The range was given without any scope breakdown.",
      basedOnFieldKeys: ["budget"],
      needsValidation: "Confirm what the range is expected to cover.",
    });
  }
  const timeline = values.get("timeline");
  if (timeline !== undefined) {
    inferences.push({
      text: `The desired timeline (${clip(timeline, 120)}) suggests a planning conversation rather than an emergency.`,
      confidence: "low",
      reason: "Only the requested timing was given, with no dependencies stated.",
      basedOnFieldKeys: ["timeline"],
    });
  }

  const assumptions: AnalysisResult["assumptions"] = [];
  if (summary !== undefined) {
    assumptions.push({
      text: "The summary is an informal description, not a confirmed specification.",
      impact: "medium",
    });
  }

  const unknowns: AnalysisResult["unknowns"] = missing.map((key) => ({
    text: `The ${labels.get(key) ?? key} was not provided.`,
    priority: key === "budget" || key === "projectSummary" ? "critical" : "important",
    whyItMatters: "It changes what the call should focus on and what can be prepared at all.",
  }));

  const risks: AnalysisResult["risks"] = missing.map((key) => ({
    text: `The inquiry does not state the ${labels.get(key) ?? key}, so preparation would be guesswork.`,
    reason: `The ${labels.get(key) ?? key} field was omitted or withheld from AI processing.`,
    severity: key === "budget" || key === "projectSummary" ? "high" : "medium",
  }));

  const discoveryQuestions: AnalysisResult["discoveryQuestions"] = missing.map((key) => ({
    question: `What should we plan around for the ${labels.get(key) ?? key}?`,
    priority: key === "budget" || key === "projectSummary" ? "critical" : "important",
    reason: `The inquiry does not state the ${labels.get(key) ?? key}.`,
  }));
  if (summary !== undefined) {
    discoveryQuestions.push({
      question: "What would make this project a success three months after launch?",
      priority: "important",
      reason: "The inquiry describes a request but not an outcome to measure.",
    });
  }

  const roadmapStatus =
    missing.length === 0
      ? "available"
      : missing.length <= 2
        ? "limited"
        : "insufficient_information";
  const roadmap: AnalysisResult["roadmap"] = {
    status: roadmapStatus,
    phases: [
      { name: "Discovery call", purpose: "Confirm the request, constraints, and who decides." },
      { name: "Scope confirmation", purpose: "Turn the confirmed request into an agreed scope." },
      {
        name: "Delivery planning",
        purpose: "Sequence the work once scope and constraints are agreed.",
      },
    ],
  };
  if (missing.length > 0) {
    roadmap.note = `Preliminary only: ${missingLabels.join(", ")} still missing from the inquiry.`;
  }

  const confidenceLevel =
    summary === undefined
      ? "insufficient_information"
      : missing.length === 0
        ? "high"
        : missing.length <= 2
          ? "medium"
          : "low";

  return {
    summary:
      summary === undefined
        ? `${company} submitted an inquiry without a project summary.`
        : `${company}: ${clip(summary, 200)}`,
    clarity: {
      level: missing.length === 0 ? "high" : missing.length <= 2 ? "medium" : "low",
      reason:
        missing.length === 0
          ? "The inquiry states the request, the goals, a budget range, and a timeline."
          : `The inquiry does not state: ${missingLabels.join(", ")}.`,
    },
    facts,
    inferences,
    assumptions,
    unknowns,
    risks,
    discoveryQuestions,
    roadmap,
    confidence: {
      level: confidenceLevel,
      reason:
        summary === undefined
          ? "The inquiry does not describe the project itself."
          : `Based on ${facts.length} stated items, with ${missing.length} essential items still missing.`,
    },
  };
}

/** Deterministic cost candidate: enough context produces a cautious range, otherwise a refusal. */
export function buildDeterministicCostCandidate(input: AnalysisInput): unknown {
  const { values, labels } = collect(input);
  const missing = FULL_CONTEXT_KEYS.filter((key) => !values.has(key));
  if (missing.length > 0) {
    return {
      status: "insufficient_information",
      reason:
        "The inquiry does not describe enough of the work, the constraints, or the expected outcome to itemize a range.",
      missingInformation: missing.map((key) => `The ${labels.get(key) ?? key} of the inquiry.`),
    };
  }
  return {
    status: "estimated",
    items: [
      {
        name: "Discovery and scoping",
        minAmount: 2000,
        maxAmount: 4000,
        reason: "Confirming the request, the constraints, and the decision path.",
      },
      {
        name: "Implementation",
        minAmount: 6000,
        maxAmount: 12000,
        reason: "Building the agreed scope, which the inquiry describes only at a high level.",
      },
      {
        name: "Rollout and support",
        minAmount: 1500,
        maxAmount: 3000,
        reason: "Launch preparation, handover, and early support.",
      },
    ],
    rationale: "A preliminary itemization for discussion before discovery, not a commitment.",
    assumptions: ["The stated scope stays stable and no new systems of record are introduced."],
    confidence: {
      level: "low",
      reason: "No scope breakdown, integration detail, or acceptance criteria were provided.",
    },
  };
}

/**
 * Deterministic adapter with the same instrumentation the live one has: it records the fields
 * PreCall permitted, and it can throw on demand so the AI-unavailable path stays exercisable.
 */
export function createDeterministicAdapter(options: {
  readonly record: (input: AnalysisInput) => void;
  readonly failOnPurpose: boolean;
}): AIAdapter {
  return {
    async generateAnalysis({ input, costEstimation }) {
      options.record(input);
      if (options.failOnPurpose) {
        throw new Error("simulated adapter failure (playground developer switch)");
      }
      const analysis = buildDeterministicAnalysis(input);
      return costEstimation === undefined
        ? analysis
        : { ...analysis, costEstimate: buildDeterministicCostCandidate(input) };
    },
  };
}
