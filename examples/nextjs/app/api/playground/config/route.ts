import { readProviderMetadata, saveProviderConfig } from "@/lib/playground/config";
import { isLocalRequest, localOnlyRejection } from "@/lib/playground/local-only";

/**
 * Local provider configuration.
 *
 * GET returns metadata only — provider, base URL, model, and whether a key is stored. The API key
 * itself is never part of a response, a log line, or a rendered page. POST writes the config file
 * with restrictive permissions; an empty `apiKey` keeps the stored one so a developer can retarget
 * the endpoint or model without re-entering the secret.
 *
 * Localhost-only: this route reads and writes credentials, so it must not be reachable from a
 * network address.
 */

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function jsonError(code: string, message: string, status: number): Response {
  return Response.json({ error: message, code }, { status });
}

export async function GET(request: Request): Promise<Response> {
  if (!isLocalRequest(request)) return localOnlyRejection();
  return Response.json(await readProviderMetadata());
}

export async function POST(request: Request): Promise<Response> {
  if (!isLocalRequest(request)) return localOnlyRejection();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid_json", "Request body must be valid JSON.", 400);
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return jsonError("invalid_request", "Request body must be a JSON object.", 400);
  }

  const read = (key: string): unknown => (key in body ? Reflect.get(body, key) : undefined);

  const result = await saveProviderConfig({
    baseUrl: stringOrUndefined(read("baseUrl")) ?? "",
    model: stringOrUndefined(read("model")) ?? "",
    apiKey: stringOrUndefined(read("apiKey")),
    structuredOutput: stringOrUndefined(read("structuredOutput")),
    api: stringOrUndefined(read("api")),
    extraHeaders: read("extraHeaders"),
  });

  if (!result.ok) {
    return jsonError(
      result.code,
      result.message,
      result.code === "config_write_failed" ? 500 : 400,
    );
  }
  return Response.json(result.metadata);
}
