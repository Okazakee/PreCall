import { toJsonSchema } from "@langchain/core/utils/json_schema";
import type { AIAdapter, AnalysisInput } from "precall";
import { createLangChainAIAdapter } from "precall/langchain";
import type { StoredProviderConfig } from "./types";

/**
 * Server-only live provider integration.
 *
 * It builds a consumer-owned `ChatOpenAI` from the locally saved configuration and hands it to the
 * public `precall/langchain` adapter, so PreCall keeps ownership of the prompt, the schema, and
 * the validation boundary. Nothing here reimplements PreCall behaviour, and no credential is ever
 * returned to the browser: the key stays inside this module's process.
 *
 * The extra knobs (`api`, `structuredOutput`, `extraHeaders`) exist because OpenAI-compatible
 * gateways differ in which surface they expose and how they accept a structured-output request.
 * They are generic escape hatches, not a provider registry: an endpoint that needs none of them
 * configures nothing.
 */

type ChatOpenAIConstructor = typeof import("@langchain/openai").ChatOpenAI;

async function loadChatOpenAI(): Promise<ChatOpenAIConstructor> {
  const { ChatOpenAI } = await import("@langchain/openai");
  return ChatOpenAI;
}

export type LiveAdapterOptions = {
  readonly config: StoredProviderConfig;
  readonly signal?: AbortSignal;
  readonly record: (input: AnalysisInput) => void;
};

export function describeLiveProvider(config: StoredProviderConfig): {
  readonly baseUrl: string;
  readonly model: string;
} {
  return { baseUrl: config.baseUrl, model: config.model };
}

/**
 * Create the live adapter.
 *
 * `structuredOutput: "jsonSchema"` implements the adapter's `functionCalling` contract with the
 * JSON-schema response format and drops the `uniqueItems` keyword for transport, because some
 * gateways reject named tool choices or that keyword. The provider-side schema is only a hint:
 * PreCall re-validates every candidate against the real Zod schema.
 */
export async function createLiveAdapter(options: LiveAdapterOptions): Promise<AIAdapter> {
  const { config } = options;
  const ChatOpenAI = await loadChatOpenAI();

  const model = new ChatOpenAI({
    apiKey: config.apiKey,
    model: config.model,
    maxRetries: 0,
    useResponsesApi: config.api === "responses",
    configuration: {
      baseURL: config.baseUrl,
      ...(Object.keys(config.extraHeaders).length === 0
        ? {}
        : { defaultHeaders: { ...config.extraHeaders } }),
    },
  });

  if (config.structuredOutput === "jsonSchema") {
    const requested = model.withStructuredOutput;
    // The cast is deliberate: the overloaded library signature cannot express "forward any schema
    // and options", and this wrapper only forwards them.
    const forward = requested.bind(model) as (
      schema: unknown,
      options?: Record<string, unknown>,
    ) => unknown;
    Object.defineProperty(model, "withStructuredOutput", {
      configurable: true,
      enumerable: false,
      writable: true,
      value: (schema: unknown, structuredOutputOptions?: Record<string, unknown>) =>
        forward(toGatewayStructuredSchema(schema), {
          ...structuredOutputOptions,
          method: "jsonSchema",
        }),
    });
  }

  const adapter = createLangChainAIAdapter({ model });
  return {
    async generateAnalysis(request) {
      options.record(request.input);
      const forwarded =
        options.signal === undefined ? request : { ...request, signal: options.signal };
      return adapter.generateAnalysis(forwarded);
    },
  };
}

const UNSUPPORTED_SCHEMA_KEYWORDS = new Set(["uniqueItems", "$schema"]);

function stripUnsupportedKeywords(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUnsupportedKeywords);
  if (typeof value !== "object" || value === null) return value;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (UNSUPPORTED_SCHEMA_KEYWORDS.has(key)) continue;
    result[key] = stripUnsupportedKeywords(child);
  }
  return result;
}

function toGatewayStructuredSchema(schema: unknown): unknown {
  if (typeof schema !== "object" || schema === null) return schema;
  if (typeof Reflect.get(schema, "safeParse") !== "function") return schema;
  try {
    // LangChain's own converter: the same one its structured-output path uses, so the schema the
    // gateway receives matches what the library would have sent, minus the rejected keyword.
    return stripUnsupportedKeywords(toJsonSchema(schema as never));
  } catch {
    return schema;
  }
}
