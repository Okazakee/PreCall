import { describe, expect, test } from "bun:test";
import { evaluateCostEstimateCandidate } from "./result.js";

type EstimatedCandidate = {
  status: "estimated";
  items: Array<{
    name: string;
    minAmount: number;
    maxAmount: number;
    reason: string;
  }>;
  rationale: string;
  assumptions: string[];
  confidence: { level: "high" | "medium" | "low"; reason: string };
};

function estimatedCandidate(overrides: Partial<EstimatedCandidate> = {}): EstimatedCandidate {
  return {
    status: "estimated",
    items: [
      {
        name: "Frontend implementation",
        minAmount: 2_500,
        maxAmount: 3_500,
        reason: "Build the primary user-facing workflow.",
      },
    ],
    rationale: "The range reflects the current scope and known delivery risks.",
    assumptions: ["The existing brand assets can be reused."],
    confidence: { level: "medium", reason: "The request has a useful but incomplete scope." },
    ...overrides,
  };
}
function withoutKey(value: object, key: string): Record<string, unknown> {
  const copy = { ...value };
  Reflect.deleteProperty(copy, key);
  return copy;
}

const invalidOutput = { status: "unavailable" as const, reason: "invalid_output" as const };

function expectInvalid(candidate: unknown): void {
  expect(evaluateCostEstimateCandidate(candidate, "EUR")).toEqual(invalidOutput);
}

describe("evaluateCostEstimateCandidate", () => {
  test("accepts an estimated candidate and attaches the configured currency", () => {
    const candidate = estimatedCandidate({
      items: [
        {
          name: "Frontend implementation",
          minAmount: 2_500,
          maxAmount: 3_500,
          reason: "Build the primary user-facing workflow.",
        },
        {
          name: "Discovery workshop",
          minAmount: 1_000,
          maxAmount: 1_250,
          reason: "Resolve the remaining product questions.",
        },
      ],
      rationale: "The known work is split between discovery and implementation.",
      assumptions: ["The existing brand assets can be reused.", "One launch platform is in scope."],
      confidence: { level: "high", reason: "The requested workflow is clearly described." },
    });

    expect(evaluateCostEstimateCandidate(candidate, "GBP")).toEqual({
      status: "estimated",
      currency: "GBP",
      total: { minAmount: 3_500, maxAmount: 4_750 },
      items: candidate.items,
      rationale: candidate.rationale,
      assumptions: candidate.assumptions,
      confidence: candidate.confidence,
    });
  });

  test("computes totals from item sums for one, many, and zero-amount items", () => {
    const cases = [
      {
        items: [
          { name: "Single item", minAmount: 250, maxAmount: 750, reason: "One bounded task." },
        ],
        total: { minAmount: 250, maxAmount: 750 },
      },
      {
        items: [
          { name: "First", minAmount: 2_500, maxAmount: 3_500, reason: "First task." },
          { name: "Second", minAmount: 3_000, maxAmount: 4_500, reason: "Second task." },
          { name: "Third", minAmount: 1_000, maxAmount: 1_500, reason: "Third task." },
        ],
        total: { minAmount: 6_500, maxAmount: 9_500 },
      },
      {
        items: [
          { name: "No-cost setup", minAmount: 0, maxAmount: 0, reason: "Already available." },
          { name: "Paid task", minAmount: 100, maxAmount: 200, reason: "Requires implementation." },
        ],
        total: { minAmount: 100, maxAmount: 200 },
      },
    ] as const;

    for (const { items, total } of cases) {
      expect(
        evaluateCostEstimateCandidate(estimatedCandidate({ items: [...items] }), "USD"),
      ).toEqual({
        ...estimatedCandidate({ items: [...items] }),
        currency: "USD",
        total,
      });
    }
  });

  test("rejects a candidate-provided total regardless of its value", () => {
    const totals = [
      { minAmount: 3_500, maxAmount: 4_750 },
      { minAmount: 1, maxAmount: 2 },
      { minAmount: "not numeric", maxAmount: Number.NaN },
    ];

    for (const total of totals) {
      expectInvalid({ ...estimatedCandidate(), total });
    }
  });

  test("rejects malformed candidates with the exact unavailable state", () => {
    const base = estimatedCandidate();
    const baseItem = base.items[0];
    if (baseItem === undefined) throw new Error("expected estimated candidate item");
    const itemWithoutReason = withoutKey(baseItem, "reason");
    const itemWithoutName = withoutKey(baseItem, "name");
    const candidateWithoutConfidence = withoutKey(base, "confidence");
    const candidateWithoutRationale = withoutKey(base, "rationale");
    const invalidCandidates: unknown[] = [
      { ...base, items: [{ ...baseItem, minAmount: 4_000, maxAmount: 3_000 }] },
      { ...base, items: [{ ...baseItem, minAmount: -1 }] },
      { ...base, items: [{ ...baseItem, maxAmount: -1 }] },
      { ...base, items: [{ ...baseItem, minAmount: Number.NaN }] },
      { ...base, items: [{ ...baseItem, minAmount: Number.POSITIVE_INFINITY }] },
      { ...base, items: [{ ...baseItem, maxAmount: Number.NEGATIVE_INFINITY }] },
      { ...base, items: [{ ...baseItem, minAmount: 2_500.5 }] },
      { ...base, items: [itemWithoutReason] },
      { ...base, items: [itemWithoutName] },
      { ...base, items: [{ ...baseItem, name: "" }] },
      { ...base, items: [{ ...baseItem, name: " \t\n" }] },
      { ...base, items: [{ ...baseItem, reason: "" }] },
      { ...base, items: [{ ...baseItem, reason: " \t\n" }] },
      { ...base, rationale: "" },
      { ...base, rationale: " \t\n" },
      { ...base, confidence: { ...base.confidence, reason: "" } },
      { ...base, confidence: { ...base.confidence, reason: " \t\n" } },
      { ...base, items: [] },
      candidateWithoutConfidence,
      { ...base, candidateExtra: true },
      { ...base, items: [{ ...baseItem, itemExtra: true }] },
      { ...base, confidence: { ...base.confidence, confidenceExtra: true } },
      { ...base, status: "unknown" },
      candidateWithoutRationale,
      { status: "insufficient_information", reason: "Need more detail.", missingInformation: [] },
      {
        status: "insufficient_information",
        reason: "Need more detail.",
        missingInformation: [" ", "\t\n"],
      },
      null,
      "candidate",
      [],
      undefined,
    ];

    for (const candidate of invalidCandidates) expectInvalid(candidate);
  });

  test("accepts insufficient information without adding currency or totals", () => {
    const candidate = {
      status: "insufficient_information" as const,
      reason: "The intended launch scope is not known yet.",
      missingInformation: ["Target platform", "Expected launch date"],
    };

    expect(evaluateCostEstimateCandidate(candidate, "EUR")).toEqual(candidate);
  });

  test("preserves an explicitly empty assumptions array", () => {
    const candidate = estimatedCandidate({ assumptions: [] });

    expect(evaluateCostEstimateCandidate(candidate, "EUR")).toEqual({
      ...candidate,
      currency: "EUR",
      total: { minAmount: 2_500, maxAmount: 3_500 },
    });
  });

  test("rejects sums that exceed the safe-integer range", () => {
    expectInvalid(
      estimatedCandidate({
        items: [
          {
            name: "First",
            minAmount: Number.MAX_SAFE_INTEGER,
            maxAmount: Number.MAX_SAFE_INTEGER,
            reason: "First.",
          },
          { name: "Second", minAmount: 1, maxAmount: 1, reason: "Second." },
        ],
      }),
    );
  });

  test("detaches returned nested data from the candidate object graph", () => {
    const estimated = estimatedCandidate();
    const estimatedState = evaluateCostEstimateCandidate(estimated, "EUR");
    const item = estimated.items[0];
    if (item === undefined) throw new Error("expected estimated candidate item");
    item.name = "Mutated name";
    item.reason = "Mutated reason";
    estimated.assumptions.push("Mutated assumption");
    estimated.confidence.reason = "Mutated confidence";

    expect(estimatedState).toEqual({
      status: "estimated",
      currency: "EUR",
      total: { minAmount: 2_500, maxAmount: 3_500 },
      items: [
        {
          name: "Frontend implementation",
          minAmount: 2_500,
          maxAmount: 3_500,
          reason: "Build the primary user-facing workflow.",
        },
      ],
      rationale: "The range reflects the current scope and known delivery risks.",
      assumptions: ["The existing brand assets can be reused."],
      confidence: { level: "medium", reason: "The request has a useful but incomplete scope." },
    });

    const insufficient = {
      status: "insufficient_information" as const,
      reason: "The scope is unclear.",
      missingInformation: ["Target users"],
    };
    const insufficientState = evaluateCostEstimateCandidate(insufficient, "EUR");
    insufficient.missingInformation.push("Launch date");

    expect(insufficientState).toEqual({
      status: "insufficient_information",
      reason: "The scope is unclear.",
      missingInformation: ["Target users"],
    });
  });
});
