import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  type AnalysisResult,
  AnalysisResultSchema,
  ConfidenceSchema,
  FactSchema,
  InferenceSchema,
  RoadmapSchema,
} from "./result.js";

const representative: AnalysisResult = {
  summary:
    "A small fitness business wants a mobile app for class booking and membership management, but important operational details remain unresolved.",
  clarity: {
    level: "medium",
    reason:
      "The desired customer outcome is clear, while systems, rules, ownership, and timing need discovery.",
  },
  facts: [
    {
      text: "The client operates a small fitness business.",
      sourceFieldKeys: ["business"],
    },
    {
      text: "Customers should be able to book classes and manage memberships.",
      sourceFieldKeys: ["goal"],
    },
    {
      text: "iPhone and Android are preferred platforms.",
      sourceFieldKeys: ["platforms"],
    },
    {
      text: "The business already has a website.",
      sourceFieldKeys: ["website"],
    },
    {
      text: "The stated budget is around €15k.",
      sourceFieldKeys: ["budget"],
    },
    {
      text: "The client would like to launch fairly soon.",
      sourceFieldKeys: ["timing"],
    },
  ],
  inferences: [
    {
      text: "Existing booking or membership systems may need to integrate with the new app.",
      confidence: "medium",
      reason:
        "The existing website and operational goals suggest that current workflows or systems may already hold relevant data.",
      basedOnFieldKeys: ["website", "goal"],
      needsValidation:
        "Identify the systems currently used for customers, memberships, bookings, and payments.",
    },
    {
      text: "Class availability and capacity rules are likely important to the booking experience.",
      confidence: "medium",
      reason:
        "Class booking normally depends on schedules, capacity, and cancellation or waitlist rules, none of which are specified.",
      basedOnFieldKeys: ["goal"],
    },
  ],
  assumptions: [
    {
      text: "The existing website may remain in use during the initial mobile-app rollout.",
      impact: "medium",
    },
  ],
  unknowns: [
    {
      text: "The current booking and membership workflow is not specified.",
      priority: "critical",
      whyItMatters: "The current workflow determines scope, migration needs, and integration risk.",
    },
    {
      text: "The meaning of managing memberships is not specified.",
      priority: "important",
      whyItMatters:
        "Membership changes, renewals, payments, and access rules could materially change the solution.",
    },
    {
      text: "The actual launch date and budget flexibility are unknown.",
      priority: "important",
      whyItMatters:
        "Timing and budget constraints affect scope and the feasibility of supporting two mobile platforms.",
    },
  ],
  risks: [
    {
      text: "Unknown booking and membership rules could create significant rework.",
      reason:
        "The request names the desired outcomes without defining operational rules or current systems.",
      severity: "medium",
      needsValidation:
        "Map the current customer, booking, membership, and payment workflows before estimating implementation scope.",
    },
    {
      text: "Supporting two mobile platforms may exceed the initial scope if the budget is fixed.",
      reason:
        "The budget and launch timing are stated broadly while platform coverage is already expected.",
      severity: "medium",
    },
  ],
  discoveryQuestions: [
    {
      question: "How are bookings and memberships handled today?",
      priority: "critical",
      reason: "The current workflow is the primary input to scope and integration decisions.",
    },
    {
      question: "What does manage memberships mean operationally for staff and customers?",
      priority: "critical",
      reason:
        "The phrase could include very different account, payment, renewal, and access requirements.",
    },
    {
      question: "What date does fairly soon mean, and is the €15k budget a hard ceiling?",
      priority: "important",
      reason:
        "Concrete timing and budget constraints are needed to frame a responsible delivery path.",
    },
  ],
  roadmap: {
    status: "limited",
    note: "Begin with discovery and current-system assessment before committing to a two-platform implementation scope.",
    phases: [
      {
        name: "Discovery",
        purpose:
          "Clarify users, workflows, booking rules, membership operations, constraints, and success criteria.",
      },
      {
        name: "Existing-system assessment",
        purpose:
          "Identify current website, booking, membership, and payment systems and their integration boundaries.",
      },
      {
        name: "Scope definition",
        purpose:
          "Choose an initial mobile scope that fits validated priorities, timing, and budget constraints.",
      },
    ],
  },
  confidence: {
    level: "medium",
    reason:
      "The business goal and broad constraints are known, but operational and technical details remain unverified.",
  },
};

const vagueResult: AnalysisResult = {
  summary: "The request needs clarification before a meaningful implementation plan can be made.",
  clarity: {
    level: "low",
    reason: "The desired outcome, users, and constraints are not stated.",
  },
  facts: [],
  inferences: [],
  assumptions: [],
  unknowns: [],
  risks: [],
  discoveryQuestions: [
    {
      question: "What outcome should this work achieve, and for whom?",
      priority: "critical",
      reason: "The intended outcome is necessary to evaluate any possible approach.",
    },
  ],
  roadmap: {
    status: "insufficient_information",
    phases: [
      {
        name: "Discovery",
        purpose: "Collect the missing outcome, audience, constraints, and success criteria.",
      },
    ],
  },
  confidence: {
    level: "insufficient_information",
    reason: "There is not enough grounded input to infer a responsible implementation path.",
  },
};

function minimalResult(): AnalysisResult {
  return {
    summary: "A valid minimal result.",
    clarity: { level: "high", reason: "The request is sufficiently clear." },
    facts: [],
    inferences: [],
    assumptions: [],
    unknowns: [],
    risks: [],
    discoveryQuestions: [],
    roadmap: {
      status: "limited",
      phases: [{ name: "Review", purpose: "Review the available information." }],
    },
    confidence: { level: "low", reason: "Only a minimal amount of information was supplied." },
  };
}

describe("AnalysisResultSchema", () => {
  test("accepts a complete representative result without changing it", () => {
    expect(AnalysisResultSchema.parse(representative)).toEqual(representative);
  });

  test("accepts a vague request as discovery-only without invented architecture", () => {
    const parsed = AnalysisResultSchema.parse(vagueResult);
    expect(parsed).toEqual(vagueResult);
    expect(parsed.facts).toEqual([]);
    expect(parsed.inferences).toEqual([]);
    expect(parsed.roadmap.status).toBe("insufficient_information");
    expect(Object.keys(parsed.roadmap.phases[0] as object)).toEqual(["name", "purpose"]);
  });

  test("accepts the minimal shape with empty arrays and omitted optional fields", () => {
    const minimal = minimalResult();
    expect(AnalysisResultSchema.parse(minimal)).toEqual(minimal);
    expect(AnalysisResultSchema.parse(minimal).roadmap.note).toBeUndefined();
  });

  test("preserves surrounding whitespace in accepted semantic text", () => {
    const padded = minimalResult();
    padded.summary = "  Keep these spaces.  ";
    padded.clarity.reason = "  Still clear.\n";
    const firstPhase = padded.roadmap.phases[0];
    if (firstPhase === undefined) throw new Error("test fixture is missing its roadmap phase");
    firstPhase.purpose = "\tPreserve this padding. ";
    expect(AnalysisResultSchema.parse(padded)).toEqual(padded);
  });

  test("rejects malformed roots and missing required root fields", () => {
    const minimal = minimalResult();
    for (const value of [null, "result", [], {}, { ...minimal, summary: undefined }]) {
      expect(AnalysisResultSchema.safeParse(value).success).toBe(false);
    }
  });

  test("rejects malformed nested values and bad enums", () => {
    const minimal = minimalResult();
    const malformed = [
      { ...minimal, clarity: null },
      { ...minimal, facts: "facts" },
      { ...minimal, roadmap: null },
      { ...minimal, clarity: { level: "certain", reason: "Reason." } },
      {
        ...minimal,
        inferences: [
          {
            text: "Inference.",
            confidence: "certain",
            reason: "Reason.",
            basedOnFieldKeys: ["basis"],
          },
        ],
      },
      { ...minimal, assumptions: [{ text: "Assumption.", impact: "urgent" }] },
      { ...minimal, unknowns: [{ text: "Unknown.", priority: "normal", whyItMatters: "Reason." }] },
      { ...minimal, risks: [{ text: "Risk.", reason: "Reason.", severity: "urgent" }] },
      {
        ...minimal,
        discoveryQuestions: [{ question: "Question?", priority: "normal", reason: "Reason." }],
      },
      { ...minimal, roadmap: { ...minimal.roadmap, status: "planned" } },
      { ...minimal, confidence: { level: "certain", reason: "Reason." } },
      {
        ...minimal,
        facts: [{ text: "Fact.", sourceFieldKeys: ["field"], extra: true }],
      },
    ];
    for (const value of malformed)
      expect(AnalysisResultSchema.safeParse(value).success).toBe(false);
  });

  test("rejects empty or duplicate provenance keys while retaining key text exactly", () => {
    const validFact = { text: "Fact.", sourceFieldKeys: [" field ", "second"] };
    expect(FactSchema.parse(validFact)).toEqual(validFact);
    expect(FactSchema.safeParse({ text: "Fact.", sourceFieldKeys: [] }).success).toBe(false);
    expect(FactSchema.safeParse({ text: "Fact.", sourceFieldKeys: ["same", "same"] }).success).toBe(
      false,
    );
    expect(
      InferenceSchema.safeParse({
        text: "Inference.",
        confidence: "low",
        reason: "Reason.",
        basedOnFieldKeys: ["basis", "basis"],
      }).success,
    ).toBe(false);
    expect(
      InferenceSchema.safeParse({
        text: "Inference.",
        confidence: "low",
        reason: "Reason.",
        basedOnFieldKeys: [" \t"],
      }).success,
    ).toBe(false);
  });

  test("accepts a high-cardinality all-unique provenance array", () => {
    const sourceFieldKeys = Array.from({ length: 10_000 }, (_, index) => `field-${index}`);
    const fact = { text: "Fact.", sourceFieldKeys };

    expect(FactSchema.parse(fact)).toEqual(fact);
  });

  test("requires a roadmap phase and its required fields", () => {
    expect(RoadmapSchema.safeParse({ status: "available", phases: [] }).success).toBe(false);
    expect(
      RoadmapSchema.safeParse({ status: "available", phases: [{ name: "Phase" }] }).success,
    ).toBe(false);
    expect(
      RoadmapSchema.safeParse({
        status: "available",
        phases: [{ name: "Phase", purpose: "Purpose", estimate: "1 week" }],
      }).success,
    ).toBe(false);
  });

  test("rejects whitespace-only strings and null optionals", () => {
    const minimal = minimalResult();
    const values = [
      { ...minimal, summary: " \t\n" },
      { ...minimal, clarity: { level: "high", reason: "\n " } },
      {
        ...minimal,
        assumptions: [{ text: "Assumption.", impact: null }],
      },
      {
        ...minimal,
        roadmap: { ...minimal.roadmap, note: null },
      },
      {
        ...minimal,
        risks: [{ text: "Risk.", reason: "Reason.", needsValidation: " " }],
      },
    ];
    for (const value of values) expect(AnalysisResultSchema.safeParse(value).success).toBe(false);
  });
  test("rejects unknown keys at the root and every nested object", () => {
    const minimal = minimalResult();
    const values = [
      { ...minimal, research: "none" },
      { ...minimal, provider: "local" },
      { ...minimal, clarity: { ...minimal.clarity, model: "x" } },
      { ...minimal, facts: [{ text: "Fact.", sourceFieldKeys: ["field"], model: "x" }] },
      {
        ...minimal,
        inferences: [
          {
            text: "Inference.",
            confidence: "low",
            reason: "Reason.",
            basedOnFieldKeys: ["field"],
            model: "x",
          },
        ],
      },
      { ...minimal, assumptions: [{ text: "Assumption.", processing: "done" }] },
      {
        ...minimal,
        unknowns: [{ text: "Unknown.", priority: "minor", whyItMatters: "Reason.", usage: 1 }],
      },
      { ...minimal, risks: [{ text: "Risk.", reason: "Reason.", provider: "x" }] },
      {
        ...minimal,
        discoveryQuestions: [
          { question: "Question?", priority: "secondary", reason: "Reason.", model: "x" },
        ],
      },
      {
        ...minimal,
        roadmap: {
          ...minimal.roadmap,
          note: "Note.",
          phases: [{ name: "P", purpose: "P", pricing: 1 }],
        },
      },
      { ...minimal, confidence: { ...minimal.confidence, usage: 1 } },
    ];
    for (const value of values) expect(AnalysisResultSchema.safeParse(value).success).toBe(false);
  });

  test("emits JSON Schema for strict objects and provenance constraints", () => {
    const json = z.toJSONSchema(AnalysisResultSchema) as Record<string, unknown>;
    expect(json.type).toBe("object");
    expect(json.additionalProperties).toBe(false);
    expect(json.required).toEqual([
      "summary",
      "clarity",
      "facts",
      "inferences",
      "assumptions",
      "unknowns",
      "risks",
      "discoveryQuestions",
      "roadmap",
      "confidence",
    ]);

    const properties = json.properties as Record<string, Record<string, unknown>>;
    const clarity = properties.clarity;
    const roadmap = properties.roadmap;
    const facts = properties.facts;
    const inferences = properties.inferences;
    if (
      clarity === undefined ||
      roadmap === undefined ||
      facts === undefined ||
      inferences === undefined
    ) {
      throw new Error("test fixture is missing JSON Schema properties");
    }
    expect(clarity.additionalProperties).toBe(false);
    expect(roadmap.additionalProperties).toBe(false);
    expect(roadmap).toMatchObject({
      required: ["status", "phases"],
      properties: {
        phases: { minItems: 1 },
      },
    });

    const factsItems = facts.items;
    if (typeof factsItems !== "object" || factsItems === null) {
      throw new Error("test fixture is missing the fact item schema");
    }
    const factSchema = factsItems as Record<string, unknown>;
    const factProperties = factSchema.properties as Record<string, Record<string, unknown>>;
    const sourceFieldKeys = factProperties.sourceFieldKeys;
    if (sourceFieldKeys === undefined) {
      throw new Error("test fixture is missing fact provenance schema");
    }
    expect(factSchema.additionalProperties).toBe(false);
    expect(sourceFieldKeys).toMatchObject({
      minItems: 1,
      uniqueItems: true,
    });
    const sourceItems = sourceFieldKeys.items;
    if (typeof sourceItems !== "object" || sourceItems === null) {
      throw new Error("test fixture is missing fact provenance item schema");
    }
    expect((sourceItems as Record<string, unknown>).pattern).toBe("\\S");

    const inferenceItems = inferences.items;
    if (typeof inferenceItems !== "object" || inferenceItems === null) {
      throw new Error("test fixture is missing the inference item schema");
    }
    const inferenceProperties = (inferenceItems as Record<string, unknown>).properties as Record<
      string,
      Record<string, unknown>
    >;
    const basedOnFieldKeys = inferenceProperties.basedOnFieldKeys;
    if (basedOnFieldKeys === undefined) {
      throw new Error("test fixture is missing inference provenance schema");
    }
    expect(basedOnFieldKeys).toMatchObject({ minItems: 1, uniqueItems: true });
  });

  test("keeps confidence levels separate from clarity and exact enum sets", () => {
    expect(
      ConfidenceSchema.safeParse({ level: "insufficient_information", reason: "Unknown." }).success,
    ).toBe(true);
    expect(ConfidenceSchema.safeParse({ level: "medium", reason: "Known." }).success).toBe(true);
    expect(
      ConfidenceSchema.safeParse({
        level: "insufficient_information",
        reason: "Unknown.",
        extra: true,
      }).success,
    ).toBe(false);
  });
});
