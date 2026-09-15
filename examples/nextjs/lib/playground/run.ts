import type {
  AIAdapter,
  AnalysisInput,
  DeliveryOutcome,
  EmailDeliveryRequest,
  EmailTransport,
  FieldDefinition,
  PreCallResult,
  SubmissionAttachment,
} from "precall";
import { createPrecall } from "precall";
import { readStoredProviderConfig } from "./config";
import { createDeterministicAdapter } from "./deterministic-adapter";
import { createLiveAdapter } from "./live-adapter";
import type {
  PlaygroundEmail,
  PlaygroundFieldDraft,
  PlaygroundRunRequest,
  PlaygroundRunResponse,
  StoredProviderConfig,
} from "./types";

/**
 * Server-only playground engine.
 *
 * It validates the developer's request, builds the trusted side (field definitions from the dummy
 * form, cost configuration, adapter), runs the public PreCall API, and returns one inspection
 * payload. Fake mode never touches the network; live mode uses the locally saved provider
 * configuration and never falls back to fake mode silently.
 */

export const PLAYGROUND_RECIPIENT = "discovery@example.com";
export const DEFAULT_TIMEOUT_MS = 180_000;
const MAX_FIELDS = 25;
const MAX_VALUE_LENGTH = 20_000;

export type ParsedRunBody =
  | { readonly ok: true; readonly request: PlaygroundRunRequest }
  | { readonly ok: false; readonly code: string; readonly message: string };

export function resolveTimeoutMs(): number {
  const raw = process.env["PRECALL_PLAYGROUND_TIMEOUT_MS"]?.trim();
  if (raw === undefined || raw.length === 0) return DEFAULT_TIMEOUT_MS;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function readBoolean(source: object, key: string, fallback: boolean): boolean {
  if (!(key in source)) return fallback;
  const value = Reflect.get(source, key);
  return typeof value === "boolean" ? value : fallback;
}

function parseFields(value: unknown): readonly PlaygroundFieldDraft[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_FIELDS) return null;
  const fields: PlaygroundFieldDraft[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return null;
    const key = "key" in entry ? entry.key : undefined;
    const label = "label" in entry ? entry.label : undefined;
    const fieldValue = "value" in entry ? entry.value : "";
    if (typeof key !== "string" || key.length === 0 || seen.has(key)) return null;
    if (typeof label !== "string" || label.trim().length === 0) return null;
    if (typeof fieldValue !== "string" || fieldValue.length > MAX_VALUE_LENGTH) return null;
    seen.add(key);
    fields.push({
      key,
      label,
      value: fieldValue,
      sensitive: readBoolean(entry, "sensitive", false),
      sendToAI: readBoolean(entry, "sendToAI", true),
      includeInOutput: readBoolean(entry, "includeInOutput", true),
    });
  }
  return fields;
}

/** Validate the untrusted run body. Field definitions are re-validated by PreCall as well. */
export function parseRunBody(body: unknown): ParsedRunBody {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, code: "invalid_request", message: "Request body must be a JSON object." };
  }

  const mode = "mode" in body ? body.mode : "fake";
  if (mode !== "fake" && mode !== "live") {
    return { ok: false, code: "invalid_request", message: 'mode must be "fake" or "live".' };
  }

  const fields = parseFields("fields" in body ? body.fields : undefined);
  if (fields === null) {
    return {
      ok: false,
      code: "invalid_request",
      message:
        "fields must be one to twenty-five entries of { key, label, value, sensitive?, sendToAI?, includeInOutput? } with unique keys.",
    };
  }

  const costSource = "costEstimation" in body ? body.costEstimation : undefined;
  let costEstimation = { enabled: false, currency: "EUR" };
  if (typeof costSource === "object" && costSource !== null && !Array.isArray(costSource)) {
    const currency = "currency" in costSource ? costSource.currency : "EUR";
    if (typeof currency !== "string" || !/^[A-Z]{3}$/u.test(currency)) {
      return {
        ok: false,
        code: "invalid_request",
        message: "costEstimation.currency must be three uppercase ASCII letters.",
      };
    }
    costEstimation = { enabled: readBoolean(costSource, "enabled", false), currency };
  }

  const request: PlaygroundRunRequest = {
    mode,
    fields,
    costEstimation,
    simulateAdapterFailure: readBoolean(body, "simulateAdapterFailure", false),
    useDefaultFlags: readBoolean(body, "useDefaultFlags", false),
    ...("rawSubmission" in body ? { rawSubmission: body.rawSubmission } : {}),
    ...("rawFields" in body ? { rawFields: body.rawFields } : {}),
  };
  return { ok: true, request };
}

/** Builder fields become trusted PreCall field definitions and one normalized submission. */
export function buildFacadeInputs(request: PlaygroundRunRequest): {
  readonly fields: readonly FieldDefinition[];
  readonly submission: unknown;
} {
  if (request.rawSubmission !== undefined) {
    return {
      fields: Array.isArray(request.rawFields)
        ? (request.rawFields as readonly FieldDefinition[])
        : request.fields.map(toFieldDefinition),
      submission: request.rawSubmission,
    };
  }
  const submission: Record<string, string> = {};
  for (const field of request.fields) {
    if (field.value.trim().length === 0) continue;
    submission[field.key] = field.value;
  }
  return {
    fields: request.fields.map((field) =>
      // `sensitive` is a property of the field the developer declared; sendToAI and includeInOutput
      // are the flags whose defaults PreCall resolves (sendToAI follows sensitive).
      request.useDefaultFlags
        ? { key: field.key, label: field.label, sensitive: field.sensitive }
        : toFieldDefinition(field),
    ),
    submission,
  };
}

function toFieldDefinition(field: PlaygroundFieldDraft): FieldDefinition {
  return {
    key: field.key,
    label: field.label,
    sensitive: field.sensitive,
    sendToAI: field.sendToAI,
    includeInOutput: field.includeInOutput,
  };
}

type CapturedEmail = { readonly request: EmailDeliveryRequest };

function createCapturingTransport(captured: CapturedEmail[]): EmailTransport {
  return {
    async send(request) {
      captured.push({ request });
    },
  };
}

function decodeAttachment(
  attachment: SubmissionAttachment,
): PlaygroundEmail["attachments"][number] {
  return {
    filename: attachment.filename,
    contentType: attachment.contentType,
    content: new TextDecoder().decode(attachment.bytes),
  };
}

export type RunEngineOptions = {
  readonly request: PlaygroundRunRequest;
  /** Injectable for tests: replaces the live provider factory. */
  readonly createLiveAdapterOverride?: (options: {
    readonly config: StoredProviderConfig;
    readonly signal: AbortSignal;
    readonly record: (input: AnalysisInput) => void;
  }) => Promise<AIAdapter>;
};

export async function runPlaygroundRequest(
  options: RunEngineOptions,
): Promise<PlaygroundRunResponse> {
  const { request } = options;
  const started = performance.now();
  const timeoutMs = resolveTimeoutMs();
  const signal = AbortSignal.timeout(timeoutMs);
  const recorded: AnalysisInput["fields"] = [];
  const captured: CapturedEmail[] = [];
  const record = (input: AnalysisInput): void => {
    for (const field of input.fields) {
      recorded.push({ key: field.key, label: field.label, value: field.value });
    }
  };

  const { fields, submission } = buildFacadeInputs(request);
  let adapter: AIAdapter;
  let provider: { baseUrl: string; model: string } | undefined;

  if (request.mode === "live") {
    const stored = await readStoredProviderConfig();
    if (stored === null) {
      throw new PlaygroundConfigurationError(
        "live_not_configured",
        "No provider is configured. Save a base URL, model, and API key first.",
      );
    }
    provider = { baseUrl: stored.baseUrl, model: stored.model };
    adapter =
      options.createLiveAdapterOverride === undefined
        ? await createLiveAdapter({ config: stored, signal, record })
        : await options.createLiveAdapterOverride({ config: stored, signal, record });
  } else {
    adapter = createDeterministicAdapter({
      record,
      failOnPurpose: request.simulateAdapterFailure,
    });
  }

  const precall = createPrecall({
    ai: adapter,
    fields,
    ...(request.costEstimation.enabled
      ? { costEstimation: { currency: request.costEstimation.currency } }
      : {}),
  });

  const result: PreCallResult = await precall.process({ submission, signal });

  let email: PlaygroundEmail | null = null;
  let delivery: DeliveryOutcome | null = null;
  let emailError: PlaygroundRunResponse["emailError"] = null;
  try {
    delivery = await precall.deliver({
      result,
      recipient: PLAYGROUND_RECIPIENT,
      transport: createCapturingTransport(captured),
    });
  } catch {
    // The deterministic renderer is not expected to throw; if it ever does, the analysis result is
    // still returned and the failure is reported as a rendering problem rather than hidden.
    emailError = "rendering_failed";
  }

  const delivered = captured[0];
  if (delivered !== undefined) {
    email = {
      recipient: delivered.request.recipient,
      subject: delivered.request.email.subject,
      html: delivered.request.email.html,
      text: delivered.request.email.text,
      attachments: delivered.request.email.attachments.map(decodeAttachment),
    };
  }

  const adapterFailure = recorded.length > 0 && result.analysis.status !== "succeeded";
  return {
    result,
    aiInput: { invocations: recorded.length > 0 ? 1 : 0, fields: recorded },
    email,
    emailError,
    delivery,
    diagnostics: {
      mode: request.mode,
      externalProvider: request.mode === "live",
      ...(provider === undefined ? {} : { provider }),
      elapsedMs: Math.round(performance.now() - started),
      analysisStatus: result.analysis.status,
      ...(adapterFailure && result.analysis.status === "unavailable"
        ? { adapterFailure: result.analysis.reason }
        : {}),
      timeoutMs,
    },
  };
}

/** A configuration problem the developer can fix, reported separately from an intake failure. */
export class PlaygroundConfigurationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PlaygroundConfigurationError";
    this.code = code;
  }
}
