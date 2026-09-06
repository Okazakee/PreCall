import type { AIAdapter } from "./analysis/run.js";
import type { DeliveryOutcome, EmailTransport } from "./delivery.js";
import { deliverPreCallResult } from "./delivery.js";
import {
  normalizeSubmissionWithConfiguration,
  resolveIntakeConfiguration,
} from "./intake/normalize.js";
import type { FieldDefinition, IntakeLimitOverrides } from "./intake/schema.js";
import type { EmailPackagingOptions } from "./presentation/email.js";
import { type PreCallResult, processNormalizedSubmission } from "./result.js";

export type PrecallConfig = {
  ai: AIAdapter;
  fields: readonly FieldDefinition[];
  limits?: IntakeLimitOverrides;
};

export type ProcessRequest = {
  submission: unknown;
  signal?: AbortSignal;
};

export type DeliverRequest = {
  result: PreCallResult;
  transport: EmailTransport;
  recipient: string;
  email?: EmailPackagingOptions;
  signal?: AbortSignal;
};

export type SubmitRequest = {
  submission: unknown;
  transport: EmailTransport;
  recipient: string;
  email?: EmailPackagingOptions;
  signal?: AbortSignal;
};

export type SubmitOutcome = {
  result: PreCallResult;
  delivery: DeliveryOutcome;
};

export interface Precall {
  process(request: ProcessRequest): Promise<PreCallResult>;
  deliver(request: DeliverRequest): Promise<DeliveryOutcome>;
  submit(request: SubmitRequest): Promise<SubmitOutcome>;
}

export function createPrecall(config: PrecallConfig): Precall {
  const ai = config.ai;
  if (
    (typeof ai !== "object" && typeof ai !== "function") ||
    ai === null ||
    typeof ai.generateAnalysis !== "function"
  ) {
    throw new TypeError("ai.generateAnalysis must be callable");
  }

  const intake = resolveIntakeConfiguration(config.fields, config.limits);

  const precall: Precall = {
    async process(request: ProcessRequest): Promise<PreCallResult> {
      const signal = request.signal;
      signal?.throwIfAborted();
      const submission = request.submission;
      const normalized = normalizeSubmissionWithConfiguration(intake, submission);
      return processNormalizedSubmission(ai, normalized, signal);
    },
    deliver(request: DeliverRequest): Promise<DeliveryOutcome> {
      return deliverPreCallResult(
        request.transport,
        request.recipient,
        request.result,
        request.email,
        request.signal,
      );
    },
    async submit(request: SubmitRequest): Promise<SubmitOutcome> {
      const result = await precall.process(request);
      const delivery = await precall.deliver({ ...request, result });
      return { result, delivery };
    },
  };
  return precall;
}
