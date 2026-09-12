import { z } from "zod";
import type { CostEstimationConfig } from "../cost/config.js";
import type { CostEstimateState } from "../cost/result.js";
import { evaluateCostEstimateCandidate } from "../cost/result.js";
import type { AnalysisInput } from "./input.js";
import { type AnalysisResult, AnalysisResultSchema } from "./result.js";

export interface AIAdapter {
  generateAnalysis(request: AIAnalysisRequest): Promise<unknown>;
}

export interface AIAnalysisRequest {
  input: AnalysisInput;
  signal?: AbortSignal;
  /**
   * Present only when the configured facade enabled cost estimation. The adapter may then return a
   * `costEstimate` candidate alongside the base analysis; every other request contract is
   * unchanged.
   */
  costEstimation?: CostEstimationConfig;
}

/**
 * The optional extended candidate: the canonical analysis plus an untrusted cost-estimate member.
 *
 * The cost member is intentionally `unknown` here so a malformed estimate cannot invalidate an
 * otherwise valid analysis at either the provider or the core boundary; the core validates it
 * separately against the strict cost-estimate contract.
 */
export const AnalysisWithCostEstimateCandidateSchema = AnalysisResultSchema.safeExtend({
  costEstimate: z.unknown().optional(),
});

export type AnalysisWithCostEstimateCandidate = z.infer<
  typeof AnalysisWithCostEstimateCandidateSchema
>;

export type AnalysisUnavailableReason = "no_input" | "adapter_error" | "invalid_output";

export type AnalysisExecutionResult =
  | { status: "succeeded"; result: AnalysisResult }
  | { status: "unavailable"; code: AnalysisUnavailableReason };

export type AnalysisExecution = {
  analysis: AnalysisExecutionResult;
  /** Present only when cost estimation was enabled for this request. */
  costEstimate?: CostEstimateState;
};

function failedExecution(
  code: AnalysisUnavailableReason,
  costEstimation: CostEstimationConfig | undefined,
): AnalysisExecution {
  const analysis: AnalysisExecutionResult = { status: "unavailable", code };
  return costEstimation === undefined
    ? { analysis }
    : { analysis, costEstimate: { status: "unavailable", reason: code } };
}

export async function runAnalysis(
  adapter: AIAdapter,
  input: AnalysisInput,
  signal?: AbortSignal,
  costEstimation?: CostEstimationConfig,
): Promise<AnalysisExecution> {
  signal?.throwIfAborted();

  if (input.fields.length === 0) {
    return failedExecution("no_input", costEstimation);
  }

  const request: AIAnalysisRequest = signal === undefined ? { input } : { input, signal };
  if (costEstimation !== undefined) request.costEstimation = costEstimation;

  try {
    const output = await adapter.generateAnalysis(request);
    signal?.throwIfAborted();

    if (costEstimation === undefined) {
      const parsed = AnalysisResultSchema.safeParse(output);
      signal?.throwIfAborted();
      return parsed.success
        ? { analysis: { status: "succeeded", result: parsed.data } }
        : failedExecution("invalid_output", undefined);
    }

    const combined = AnalysisWithCostEstimateCandidateSchema.safeParse(output);
    signal?.throwIfAborted();
    if (!combined.success) return failedExecution("invalid_output", costEstimation);

    const { costEstimate: candidate, ...analysisCandidate } = combined.data;
    const parsed = AnalysisResultSchema.safeParse(analysisCandidate);
    signal?.throwIfAborted();
    if (!parsed.success) return failedExecution("invalid_output", costEstimation);

    return {
      analysis: { status: "succeeded", result: parsed.data },
      costEstimate:
        candidate === undefined
          ? { status: "unavailable", reason: "not_provided" }
          : evaluateCostEstimateCandidate(candidate, costEstimation.currency),
    };
  } catch {
    signal?.throwIfAborted();
    return failedExecution("adapter_error", costEstimation);
  }
}
