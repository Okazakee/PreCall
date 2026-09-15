import type { DeliveryOutcome, PreCallResult } from "precall";

/**
 * Types shared by the playground's browser code and its server routes.
 *
 * Everything here is browser-safe: the provider credential type is deliberately server-only and
 * lives with the configuration module instead.
 */

export type StructuredOutputMethod = "functionCalling" | "jsonSchema";
export type ApiSurface = "chat-completions" | "responses";

/** Provider configuration as stored on disk. Server-only: it contains the credential. */
export type StoredProviderConfig = {
  readonly provider: "openai-compatible";
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKey: string;
  readonly structuredOutput: StructuredOutputMethod;
  readonly api: ApiSurface;
  readonly extraHeaders: Record<string, string>;
};

/** What the browser is allowed to know about the stored provider configuration. */
export type ProviderConfigMetadata = {
  readonly configured: boolean;
  readonly hasApiKey: boolean;
  readonly provider?: string;
  readonly baseUrl?: string;
  readonly model?: string;
  readonly api?: ApiSurface;
  readonly structuredOutput?: StructuredOutputMethod;
  /** Header names only. Values never leave the server. */
  readonly headerNames?: readonly string[];
  /** Repository-relative path of the local config file, for developer orientation. */
  readonly configFile: string;
};

export type PlaygroundAnalysisMode = "fake" | "live";

/** A field the developer edits in the dummy-intake builder. */
export type PlaygroundFieldDraft = {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly sensitive: boolean;
  readonly sendToAI: boolean;
  readonly includeInOutput: boolean;
};

export type PlaygroundRunRequest = {
  readonly mode: PlaygroundAnalysisMode;
  readonly fields: readonly PlaygroundFieldDraft[];
  readonly costEstimation: { readonly enabled: boolean; readonly currency: string };
  /** Advanced escape hatch: a raw JSON submission used instead of the builder fields. */
  readonly rawSubmission?: unknown;
  readonly rawFields?: unknown;
  readonly simulateAdapterFailure: boolean;
  /**
   * Omit every privacy flag so PreCall applies its own defaults (sendToAI follows `sensitive`,
   * includeInOutput defaults to true). The builder sends explicit flags otherwise.
   */
  readonly useDefaultFlags: boolean;
};

export type PlaygroundAiInput = {
  readonly invocations: number;
  readonly fields: readonly {
    readonly key: string;
    readonly label: string;
    readonly value: unknown;
  }[];
};

export type PlaygroundEmail = {
  readonly recipient: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly attachments: readonly {
    readonly filename: string;
    readonly contentType: string;
    readonly content: string;
  }[];
};

export type PlaygroundDiagnostics = {
  readonly mode: PlaygroundAnalysisMode;
  readonly externalProvider: boolean;
  readonly provider?: { readonly baseUrl: string; readonly model: string };
  readonly elapsedMs: number;
  readonly analysisStatus: string;
  readonly adapterFailure?: string;
  readonly timeoutMs: number;
};

export type PlaygroundRunResponse = {
  readonly result: PreCallResult;
  readonly aiInput: PlaygroundAiInput;
  readonly email: PlaygroundEmail | null;
  readonly emailError: "rendering_failed" | null;
  readonly delivery: DeliveryOutcome | null;
  readonly diagnostics: PlaygroundDiagnostics;
};

export type PlaygroundModelsResponse = {
  readonly models: readonly string[];
  readonly note?: string;
};
