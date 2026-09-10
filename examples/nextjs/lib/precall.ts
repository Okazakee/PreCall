import type {
  AIAdapter,
  AnalysisInput,
  AnalysisResult,
  DeliveryOutcome,
  EmailDeliveryRequest,
  EmailTransport,
  FieldDefinition,
  PreCallResult,
} from "precall";
import { createPrecall } from "precall";

/**
 * Server-only example module.
 *
 * Everything trusted lives here: the field privacy policy, the AI boundary, and the delivery
 * recipient. The browser only ever sends a structured submission, and PreCall validates it before
 * any of this configuration is applied.
 *
 * Both external boundaries are deterministic stand-ins, so the example runs without credentials,
 * network AI calls, or email. They implement the same public extension interfaces a production
 * consumer would implement with a real provider.
 */

const FIELDS = [
  {
    key: "company",
    label: "Company or contact",
    description: "Who is asking.",
    sendToAI: true,
    includeInOutput: true,
  },
  {
    key: "projectSummary",
    label: "Project summary",
    description: "What the client says they need, in their own words.",
    sendToAI: true,
    includeInOutput: true,
  },
  {
    key: "goals",
    label: "Goals for the call",
    description: "What the client wants to settle during the call.",
    sendToAI: true,
    includeInOutput: true,
  },
  {
    key: "budget",
    label: "Budget range",
    description:
      "Any budget range the client is willing to share. Treated as context for the brief, never as a quotation.",
    sendToAI: true,
    includeInOutput: true,
  },
  {
    key: "timeline",
    label: "Desired timeline",
    description: "When the client wants the work to happen.",
    sendToAI: true,
    includeInOutput: true,
  },
  {
    key: "contactEmail",
    label: "Contact email",
    description: "Follow-up address for the professional.",
    // `sensitive: true` already defaults `sendToAI` to false; both flags are explicit here
    // because this field is the example's "retained but never sent to AI" demonstration.
    sensitive: true,
    sendToAI: false,
    includeInOutput: true,
  },
  {
    key: "internalNotes",
    label: "Internal note",
    description:
      "Context for the AI-assisted brief only. Never part of the professional-facing brief or the submission.json attachment.",
    sendToAI: true,
    includeInOutput: false,
  },
] satisfies readonly FieldDefinition[];

const SUBMISSION_KEYS: readonly string[] = FIELDS.map((field) => field.key);

const DEFAULT_RECIPIENT = "discovery@example.com";

/** The trusted professional recipient is server configuration, never client input. */
function resolveRecipient(): string {
  const configured = process.env.PRECALL_EXAMPLE_RECIPIENT?.trim();
  return configured !== undefined && configured.length > 0 ? configured : DEFAULT_RECIPIENT;
}

const REQUIRED_CONTEXT = [
  {
    key: "projectSummary",
    label: "project summary",
    unknownPriority: "critical",
    discoveryPriority: "critical",
    riskSeverity: "high",
    whyItMatters: "Without it there is nothing concrete to prepare for.",
    risk: "The request itself is undescribed, so any preparation would be guesswork.",
  },
  {
    key: "goals",
    label: "goals for the call",
    unknownPriority: "important",
    discoveryPriority: "important",
    riskSeverity: "medium",
    whyItMatters: "It decides whether the call should focus on outcomes or on feasibility.",
    risk: "The purpose of the call is unstated, so the conversation may drift.",
  },
  {
    key: "budget",
    label: "budget range",
    unknownPriority: "critical",
    discoveryPriority: "critical",
    riskSeverity: "high",
    whyItMatters: "It changes which delivery options are worth preparing at all.",
    risk: "No budget range was given, so effort expectations may not match what the client has in mind.",
  },
  {
    key: "timeline",
    label: "desired timeline",
    unknownPriority: "important",
    discoveryPriority: "important",
    riskSeverity: "medium",
    whyItMatters: "It affects sequencing and whether a phased delivery is realistic.",
    risk: "No timeline was given, so urgency and sequencing are unknown.",
  },
] as const;

const FACT_KEYS = ["company", "projectSummary", "goals", "budget", "timeline"] as const;

const CONTEXT_NOTE_KEY = "internalNotes";

function clip(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

/**
 * A deterministic stand-in for a real analysis adapter.
 *
 * It is rule-based on purpose: the example proves the integration boundary, not model quality.
 * The returned value is an unvalidated candidate; PreCall still validates it against its
 * canonical analysis contract before it becomes a result.
 */
function buildAnalysis(input: AnalysisInput): AnalysisResult {
  const stated = new Map<string, string>();
  const labels = new Map<string, string>();
  for (const field of input.fields) {
    labels.set(field.key, field.label);
    if (typeof field.value === "string" && field.value.trim().length > 0) {
      stated.set(field.key, field.value.trim());
    }
  }

  const company = stated.get("company") ?? "An unnamed prospect";
  const summary = stated.get("projectSummary");
  const missing = REQUIRED_CONTEXT.filter((item) => !stated.has(item.key));
  const missingLabels = missing.map((item) => item.label);

  const facts: AnalysisResult["facts"] = [];
  for (const key of FACT_KEYS) {
    const value = stated.get(key);
    const label = labels.get(key);
    if (value === undefined || label === undefined) continue;
    facts.push({ text: `${label}: ${clip(value, 240)}`, sourceFieldKeys: [key] });
  }

  const inferences: AnalysisResult["inferences"] = [];
  const budget = stated.get("budget");
  if (budget !== undefined) {
    inferences.push({
      text: `The stated budget range (${clip(budget, 120)}) is a constraint the client chose to share, not an agreed figure.`,
      confidence: "medium",
      reason: "The range was given without any scope breakdown.",
      basedOnFieldKeys: ["budget"],
      needsValidation: "Confirm what the range is expected to cover.",
    });
  }
  const timeline = stated.get("timeline");
  if (timeline !== undefined) {
    inferences.push({
      text: `The desired timeline (${clip(timeline, 120)}) suggests advance planning rather than an emergency.`,
      confidence: "low",
      reason: "Only the requested timing was given, with no dependencies or constraints.",
      basedOnFieldKeys: ["timeline"],
    });
  }
  if (stated.has(CONTEXT_NOTE_KEY)) {
    inferences.push({
      text: "Context supplied outside the professional-facing fields is background, not client-confirmed fact.",
      confidence: "medium",
      reason: "Part of the permitted analysis input is deliberately excluded from the brief.",
      basedOnFieldKeys: [CONTEXT_NOTE_KEY],
    });
  }

  const assumptions: AnalysisResult["assumptions"] = [];
  if (summary !== undefined) {
    assumptions.push({
      text: "The summary is an informal description, not a confirmed specification.",
      impact: "medium",
    });
  }

  const unknowns: AnalysisResult["unknowns"] = missing.map((item) => ({
    text: `The ${item.label} was not provided.`,
    priority: item.unknownPriority,
    whyItMatters: item.whyItMatters,
  }));

  const risks: AnalysisResult["risks"] = missing.map((item) => ({
    text: item.risk,
    reason: `The ${item.label} was omitted from the inquiry.`,
    severity: item.riskSeverity,
  }));

  const discoveryQuestions: AnalysisResult["discoveryQuestions"] = missing.map((item) => ({
    question: `What should we plan around for the ${item.label}?`,
    priority: item.discoveryPriority,
    reason: `The inquiry does not state the ${item.label}.`,
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
      {
        name: "Discovery call",
        purpose: "Confirm the request, the constraints, and who is involved.",
      },
      {
        name: "Scope confirmation",
        purpose: "Turn the confirmed request into an agreed written scope.",
      },
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

function createDeterministicAdapter(aiInputKeys: string[]): AIAdapter {
  return {
    async generateAnalysis({ input }) {
      // Recording the projected keys makes the `sendToAI` filtering visible in the demo response.
      aiInputKeys.push(...input.fields.map((field) => field.key));
      return buildAnalysis(input);
    },
  };
}

type CapturedEmail = {
  recipient: string;
  subject: string;
  attachments: EmailDeliveryRequest["email"]["attachments"];
};

/** A deterministic transport that reports success and never leaves the process. */
function createCapturingTransport(captured: CapturedEmail[]): EmailTransport {
  return {
    async send({ recipient, email }) {
      captured.push({
        recipient,
        subject: email.subject,
        attachments: email.attachments,
      });
    },
  };
}

export type DemoField = PreCallResult["request"]["fields"][number];

export type DemoResponse = {
  analysis: PreCallResult["analysis"];
  aiInputKeys: string[];
  fields: DemoField[];
  delivery: {
    outcome: DeliveryOutcome;
    recipient: string;
    subject: string;
    attachmentFilenames: string[];
  };
  professionalAttachment?: {
    filename: string;
    contentType: string;
    content: string;
  };
};

/**
 * Convert untrusted HTTP JSON into the structured submission PreCall accepts.
 *
 * Only configured field keys are copied, and only non-empty strings survive. Unknown keys are
 * dropped rather than forwarded, and no client value can influence field policy, adapters, or the
 * delivery recipient.
 */
export function projectSubmission(body: unknown): Record<string, string> | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;

  const source = body as Record<string, unknown>;
  const submission: Record<string, string> = {};
  for (const key of SUBMISSION_KEYS) {
    const value = source[key];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) submission[key] = trimmed;
  }
  return submission;
}

/** Run one deterministic submission through the public PreCall API. */
export async function runDemoSubmission(submission: Record<string, string>): Promise<DemoResponse> {
  const aiInputKeys: string[] = [];
  const captured: CapturedEmail[] = [];
  const recipient = resolveRecipient();
  const precall = createPrecall({
    ai: createDeterministicAdapter(aiInputKeys),
    fields: FIELDS,
  });

  const { result, delivery } = await precall.submit({
    submission,
    transport: createCapturingTransport(captured),
    recipient,
  });

  const email = captured[0];
  const attachment = email?.attachments[0];

  return {
    analysis: result.analysis,
    aiInputKeys,
    fields: result.request.fields,
    delivery: {
      outcome: delivery,
      recipient: email?.recipient ?? recipient,
      subject: email?.subject ?? "Pre-Call Brief",
      attachmentFilenames: email?.attachments.map((item) => item.filename) ?? [],
    },
    ...(attachment === undefined
      ? {}
      : {
          professionalAttachment: {
            filename: attachment.filename,
            contentType: attachment.contentType,
            content: new TextDecoder().decode(attachment.bytes),
          },
        }),
  };
}
