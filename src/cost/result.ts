import { z } from "zod";
import { NonBlankStringSchema } from "../analysis/result.js";

/**
 * Whole non-negative currency amounts. Integer amounts keep every range, sum, and rendered value
 * exactly representable, so no rounding or conversion logic is needed anywhere in the pipeline.
 */
export const CostEstimateAmountSchema = z.number().int().nonnegative();

export const CostEstimateConfidenceLevelSchema = z.enum(["high", "medium", "low"]);

export const CostEstimateConfidenceSchema = z
  .object({
    level: CostEstimateConfidenceLevelSchema,
    reason: NonBlankStringSchema,
  })
  .strict();

export type CostEstimateConfidence = z.infer<typeof CostEstimateConfidenceSchema>;

export const CostEstimateItemSchema = z
  .object({
    name: NonBlankStringSchema,
    minAmount: CostEstimateAmountSchema,
    maxAmount: CostEstimateAmountSchema,
    reason: NonBlankStringSchema,
  })
  .strict()
  .check((ctx) => {
    if (ctx.value.minAmount > ctx.value.maxAmount) {
      ctx.issues.push({
        code: "custom",
        message: "minAmount must not exceed maxAmount",
        input: ctx.value,
      });
    }
  });

export type CostEstimateItem = z.infer<typeof CostEstimateItemSchema>;

/**
 * The untrusted cost-estimate candidate produced by an adapter.
 *
 * The candidate deliberately has no total and no currency: the configured currency and the summed
 * total are core-owned, so a displayed total can never disagree with its itemized breakdown.
 */
export const CostEstimateCandidateSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("estimated"),
      items: z.array(CostEstimateItemSchema).min(1),
      rationale: NonBlankStringSchema,
      assumptions: z.array(NonBlankStringSchema),
      confidence: CostEstimateConfidenceSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("insufficient_information"),
      reason: NonBlankStringSchema,
      missingInformation: z.array(NonBlankStringSchema).min(1),
    })
    .strict(),
]);

export type CostEstimateCandidate = z.infer<typeof CostEstimateCandidateSchema>;

export type CostEstimateTotal = {
  minAmount: number;
  maxAmount: number;
};

export type CostEstimateUnavailableReason =
  | "no_input"
  | "adapter_error"
  | "invalid_output"
  | "not_provided";

/**
 * The core-owned cost-estimate enrichment of a composed PreCall result.
 *
 * `unavailable` reuses the existing provider-neutral analysis reason set plus `not_provided` for an
 * enabled estimation whose adapter returned only the base analysis. No provider error or malformed
 * candidate detail is ever exposed.
 */
export type CostEstimateState =
  | {
      status: "estimated";
      currency: string;
      total: CostEstimateTotal;
      items: CostEstimateItem[];
      rationale: string;
      assumptions: string[];
      confidence: CostEstimateConfidence;
    }
  | {
      status: "insufficient_information";
      reason: string;
      missingInformation: string[];
    }
  | { status: "unavailable"; reason: CostEstimateUnavailableReason };

/**
 * Validate an untrusted cost-estimate candidate and derive the core-owned estimate state.
 *
 * A candidate that does not satisfy the strict cost-estimate contract becomes an explicit
 * `invalid_output` rather than a fabricated or partially repaired estimate. The total is always
 * summed from the validated items.
 */
export function evaluateCostEstimateCandidate(
  candidate: unknown,
  currency: string,
): CostEstimateState {
  const parsed = CostEstimateCandidateSchema.safeParse(candidate);
  if (!parsed.success) return { status: "unavailable", reason: "invalid_output" };

  if (parsed.data.status === "insufficient_information") {
    return {
      status: "insufficient_information",
      reason: parsed.data.reason,
      missingInformation: parsed.data.missingInformation,
    };
  }

  let minAmount = 0;
  let maxAmount = 0;
  for (const item of parsed.data.items) {
    minAmount += item.minAmount;
    maxAmount += item.maxAmount;
  }
  if (!Number.isSafeInteger(minAmount) || !Number.isSafeInteger(maxAmount)) {
    return { status: "unavailable", reason: "invalid_output" };
  }

  return {
    status: "estimated",
    currency,
    total: { minAmount, maxAmount },
    items: parsed.data.items,
    rationale: parsed.data.rationale,
    assumptions: parsed.data.assumptions,
    confidence: parsed.data.confidence,
  };
}
