import { z } from "zod";
import type { CostEstimationConfig } from "../cost/config.js";
import type { CostEstimateState } from "../cost/result.js";
import { evaluateCostEstimateCandidate } from "../cost/result.js";
import type { JsonValue } from "../intake/normalize.js";
import type { AnalysisInput } from "./input.js";
import { cloneJsonCompatibleValue } from "./input.js";
import { type AnalysisResult, AnalysisResultSchema } from "./result.js";
import type {
  AnalysisSectionState,
  AnalysisSectionUnavailableReason,
  ResolvedAnalysisConfiguration,
} from "./sections.js";

export interface AIAdapter {
  generateAnalysis(request: AIAnalysisRequest): Promise<unknown>;
}
export type AIAnalysisSection = {
  readonly key: string;
  readonly instructions: string;
  readonly outputSchema: JsonValue;
};

export type AIAnalysisConfiguration = {
  readonly sections: readonly AIAnalysisSection[];
};

export interface AIAnalysisRequest {
  input: AnalysisInput;
  signal?: AbortSignal;
  costEstimation?: CostEstimationConfig;
  analysis?: AIAnalysisConfiguration;
}

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
  costEstimate?: CostEstimateState;
  sections?: Record<string, AnalysisSectionState>;
};

function sectionStates(
  configuration: ResolvedAnalysisConfiguration,
  reason: AnalysisSectionUnavailableReason,
): Record<string, AnalysisSectionState> {
  const states = Object.create(null) as Record<string, AnalysisSectionState>;
  for (const section of configuration.sections) {
    states[section.key] = { title: section.title, status: "unavailable", reason };
  }
  return states;
}

function failedExecution(
  code: AnalysisUnavailableReason,
  costEstimation: CostEstimationConfig | undefined,
  analysisConfiguration: ResolvedAnalysisConfiguration | undefined,
): AnalysisExecution {
  const analysis: AnalysisExecutionResult = { status: "unavailable", code };
  const result: AnalysisExecution =
    costEstimation === undefined
      ? { analysis }
      : { analysis, costEstimate: { status: "unavailable", reason: code } };
  if (analysisConfiguration !== undefined)
    result.sections = sectionStates(analysisConfiguration, code);
  return result;
}

function copySafeSectionRecord(value: unknown): Record<string, unknown> | null | undefined {
  if (value === undefined) return undefined;
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const result = Object.create(null) as Record<string, unknown>;
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") return null;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !Object.hasOwn(descriptor, "value") ||
        Object.hasOwn(descriptor, "get") ||
        Object.hasOwn(descriptor, "set")
      ) {
        return null;
      }
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        value: descriptor.value,
        writable: true,
      });
    }
    return result;
  } catch {
    return null;
  }
}

function candidateSchema(
  costEstimation: CostEstimationConfig | undefined,
  analysisConfiguration: ResolvedAnalysisConfiguration | undefined,
) {
  if (costEstimation !== undefined && analysisConfiguration !== undefined) {
    return AnalysisResultSchema.safeExtend({
      costEstimate: z.unknown().optional(),
      sections: z.unknown().optional(),
    });
  }

  if (costEstimation !== undefined) return AnalysisWithCostEstimateCandidateSchema;
  if (analysisConfiguration !== undefined) {
    return AnalysisResultSchema.safeExtend({ sections: z.unknown().optional() });
  }
  return AnalysisResultSchema;
}

export async function runAnalysis(
  adapter: AIAdapter,
  input: AnalysisInput,
  signal?: AbortSignal,
  costEstimation?: CostEstimationConfig,
  analysisConfiguration?: ResolvedAnalysisConfiguration,
): Promise<AnalysisExecution> {
  signal?.throwIfAborted();

  if (input.fields.length === 0) {
    return failedExecution("no_input", costEstimation, analysisConfiguration);
  }

  const request: AIAnalysisRequest = signal === undefined ? { input } : { input, signal };
  if (costEstimation !== undefined) request.costEstimation = costEstimation;
  if (analysisConfiguration !== undefined)
    request.analysis = analysisConfiguration.adapterConfiguration;

  try {
    const output = await adapter.generateAnalysis(request);
    signal?.throwIfAborted();
    if (costEstimation === undefined && analysisConfiguration === undefined) {
      const parsed = AnalysisResultSchema.safeParse(output);
      signal?.throwIfAborted();
      return parsed.success
        ? { analysis: { status: "succeeded", result: parsed.data } }
        : failedExecution("invalid_output", undefined, undefined);
    }

    const parsedEnvelope = candidateSchema(costEstimation, analysisConfiguration).safeParse(output);
    signal?.throwIfAborted();
    if (!parsedEnvelope.success)
      return failedExecution("invalid_output", costEstimation, analysisConfiguration);

    const envelope = parsedEnvelope.data as Record<string, unknown>;
    const costCandidate = costEstimation === undefined ? undefined : envelope.costEstimate;
    const sectionCandidate = analysisConfiguration === undefined ? undefined : envelope.sections;
    const analysisCandidate = { ...envelope };
    delete analysisCandidate.costEstimate;
    delete analysisCandidate.sections;
    const parsedAnalysis = AnalysisResultSchema.safeParse(analysisCandidate);
    signal?.throwIfAborted();
    if (!parsedAnalysis.success)
      return failedExecution("invalid_output", costEstimation, analysisConfiguration);

    const execution: AnalysisExecution = {
      analysis: { status: "succeeded", result: parsedAnalysis.data },
    };
    if (costEstimation !== undefined) {
      execution.costEstimate =
        costCandidate === undefined
          ? { status: "unavailable", reason: "not_provided" }
          : evaluateCostEstimateCandidate(costCandidate, costEstimation.currency);
      signal?.throwIfAborted();
    }

    if (analysisConfiguration !== undefined) {
      const states = Object.create(null) as Record<string, AnalysisSectionState>;
      const safeSectionRecord = copySafeSectionRecord(sectionCandidate);
      signal?.throwIfAborted();
      for (const section of analysisConfiguration.sections) {
        signal?.throwIfAborted();
        if (safeSectionRecord === undefined) {
          states[section.key] = {
            title: section.title,
            status: "unavailable",
            reason: "not_provided",
          };
          continue;
        }
        if (safeSectionRecord === null) {
          states[section.key] = {
            title: section.title,
            status: "unavailable",
            reason: "invalid_output",
          };
          continue;
        }
        const candidate = Object.hasOwn(safeSectionRecord, section.key)
          ? safeSectionRecord[section.key]
          : undefined;
        signal?.throwIfAborted();
        if (candidate === undefined) {
          states[section.key] = {
            title: section.title,
            status: "unavailable",
            reason: "not_provided",
          };
          continue;
        }
        try {
          const parsed = section.schema.safeParse(candidate);
          signal?.throwIfAborted();
          if (!parsed.success) {
            states[section.key] = {
              title: section.title,
              status: "unavailable",
              reason: "invalid_output",
            };
            continue;
          }
          const value = cloneJsonCompatibleValue(parsed.data);
          signal?.throwIfAborted();
          states[section.key] = { title: section.title, status: "succeeded", value };
        } catch {
          signal?.throwIfAborted();
          states[section.key] = {
            title: section.title,
            status: "unavailable",
            reason: "invalid_output",
          };
        }
      }
      signal?.throwIfAborted();
      execution.sections = states;
    }
    return execution;
  } catch {
    signal?.throwIfAborted();
    return failedExecution("adapter_error", costEstimation, analysisConfiguration);
  }
}
