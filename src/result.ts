import { cloneJsonValue, createAnalysisInput } from "./analysis/input.js";
import type { AnalysisResult } from "./analysis/result.js";
import { type AIAdapter, runAnalysis } from "./analysis/run.js";
import type { JsonValue, NormalizedField, NormalizedSubmission } from "./intake/normalize.js";

export type RequestSnapshot = {
  original: Record<string, JsonValue>;
  fields: NormalizedField[];
};

export type AnalysisState =
  | { status: "succeeded"; result: AnalysisResult }
  | { status: "unavailable"; reason: "no_input" | "adapter_error" | "invalid_output" };

export type PreCallResult = {
  request: RequestSnapshot;
  analysis: AnalysisState;
};

function defineData(target: object, key: string, value: JsonValue): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

function snapshotRequest(normalized: NormalizedSubmission): RequestSnapshot {
  const original = Object.create(null) as Record<string, JsonValue>;
  for (const key of Object.keys(normalized.original)) {
    const descriptor = Object.getOwnPropertyDescriptor(normalized.original, key);
    if (descriptor === undefined || !Object.hasOwn(descriptor, "value")) {
      throw new TypeError("normalized original must contain data properties");
    }
    defineData(original, key, cloneJsonValue(descriptor.value as JsonValue));
  }

  const fields: NormalizedField[] = [];
  for (const field of normalized.fields) {
    const snapshot: NormalizedField = {
      key: field.key,
      label: field.label,
      value: cloneJsonValue(field.value),
      sensitive: field.sensitive,
      sendToAI: field.sendToAI,
      includeInOutput: field.includeInOutput,
    };
    if (field.description !== undefined) snapshot.description = field.description;
    fields.push(snapshot);
  }

  return { original, fields };
}

export async function processNormalizedSubmission(
  adapter: AIAdapter,
  normalized: NormalizedSubmission,
  signal?: AbortSignal,
): Promise<PreCallResult> {
  signal?.throwIfAborted();
  const request = snapshotRequest(normalized);
  const input = createAnalysisInput(request);
  const execution = await runAnalysis(adapter, input, signal);

  const analysis: AnalysisState =
    execution.status === "succeeded"
      ? { status: "succeeded", result: execution.result }
      : { status: "unavailable", reason: execution.code };
  return { request, analysis };
}
