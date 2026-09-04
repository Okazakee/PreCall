import type { AnalysisInput } from "./input.js";
import { type AnalysisResult, AnalysisResultSchema } from "./result.js";

export interface AIAdapter {
  generateAnalysis(request: AIAnalysisRequest): Promise<unknown>;
}

export interface AIAnalysisRequest {
  input: AnalysisInput;
  signal?: AbortSignal;
}

export type AnalysisExecutionResult =
  | { status: "succeeded"; result: AnalysisResult }
  | { status: "unavailable"; code: "no_input" | "adapter_error" | "invalid_output" };

export async function runAnalysis(
  adapter: AIAdapter,
  input: AnalysisInput,
  signal?: AbortSignal,
): Promise<AnalysisExecutionResult> {
  signal?.throwIfAborted();

  if (input.fields.length === 0) {
    return { status: "unavailable", code: "no_input" };
  }

  const request: AIAnalysisRequest = signal === undefined ? { input } : { input, signal };

  try {
    const output = await adapter.generateAnalysis(request);
    signal?.throwIfAborted();

    const parsed = AnalysisResultSchema.safeParse(output);
    signal?.throwIfAborted();
    return parsed.success
      ? { status: "succeeded", result: parsed.data }
      : { status: "unavailable", code: "invalid_output" };
  } catch {
    signal?.throwIfAborted();
    return { status: "unavailable", code: "adapter_error" };
  }
}
