import { readStoredProviderConfig } from "@/lib/playground/config";
import { isLocalRequest, localOnlyRejection } from "@/lib/playground/local-only";
import type { PlaygroundModelsResponse } from "@/lib/playground/types";

/**
 * Model discovery for the configured provider.
 *
 * This calls the provider's OpenAI-compatible `/models` endpoint with the stored key, server-side,
 * and returns only model identifiers. A provider that does not expose `/models` produces a
 * non-fatal note: manual model entry always remains available, so nothing here is required for a
 * run.
 *
 * Localhost-only, like the rest of the playground's configuration surface.
 */

const MODELS_TIMEOUT_MS = 20_000;

export async function POST(request: Request): Promise<Response> {
  if (!isLocalRequest(request)) return localOnlyRejection();

  const stored = await readStoredProviderConfig();
  if (stored === null) {
    return Response.json(
      {
        error: "No provider is configured yet, so no model list can be fetched.",
        code: "live_not_configured",
      },
      { status: 501 },
    );
  }

  const endpoint = `${stored.baseUrl.replace(/\/+$/u, "")}/models`;
  try {
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${stored.apiKey}`,
        ...stored.extraHeaders,
      },
      signal: AbortSignal.timeout(MODELS_TIMEOUT_MS),
    });
    if (!response.ok) {
      return Response.json({
        models: [],
        note: `The provider answered HTTP ${response.status} for /models. Enter the model id manually.`,
      } satisfies PlaygroundModelsResponse);
    }
    const payload: unknown = await response.json();
    const data =
      typeof payload === "object" && payload !== null && "data" in payload
        ? Reflect.get(payload, "data")
        : undefined;
    const models = Array.isArray(data)
      ? data
          .map((entry) =>
            typeof entry === "object" && entry !== null && "id" in entry
              ? Reflect.get(entry, "id")
              : undefined,
          )
          .filter((id): id is string => typeof id === "string")
          .toSorted()
      : [];
    return Response.json({
      models,
      ...(models.length === 0
        ? { note: "The provider returned no models. Enter the model id manually." }
        : {}),
    } satisfies PlaygroundModelsResponse);
  } catch {
    // Every failure here is non-fatal by design: manual entry is the guaranteed path.
    return Response.json({
      models: [],
      note: "The model list could not be fetched. Enter the model id manually.",
    } satisfies PlaygroundModelsResponse);
  }
}
