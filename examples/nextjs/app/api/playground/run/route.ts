import { IntakeValidationError } from "precall";
import { isLocalRequest, localOnlyRejection } from "@/lib/playground/local-only";
import {
  PlaygroundConfigurationError,
  parseRunBody,
  runPlaygroundRequest,
} from "@/lib/playground/run";

/**
 * Playground execution boundary.
 *
 * The browser posts the dummy intake, the field policy, the cost settings, and the execution mode;
 * this route validates the envelope, runs the public PreCall API server-side, and returns the
 * inspection payload. Provider credentials are read from the local configuration file inside the
 * server only, and no credential is part of the response.
 *
 * Local developer tooling: localhost-only, unauthenticated by design. Adding authentication, rate
 * limiting, or abuse controls is the first step before any hosted use.
 */

function jsonError(code: string, message: string, status: number): Response {
  return Response.json({ error: message, code }, { status });
}

function statusForCode(code: string): number {
  switch (code) {
    case "live_not_configured":
      return 501;
    case "config_write_failed":
      return 500;
    default:
      return 400;
  }
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

export async function POST(request: Request): Promise<Response> {
  if (!isLocalRequest(request)) return localOnlyRejection();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid_json", "Request body must be valid JSON.", 400);
  }

  const parsed = parseRunBody(body);
  if (!parsed.ok) return jsonError(parsed.code, parsed.message, statusForCode(parsed.code));

  try {
    return Response.json(await runPlaygroundRequest({ request: parsed.request }));
  } catch (error) {
    // PreCall's intake boundary reports a stable code the developer can act on directly.
    if (error instanceof IntakeValidationError) {
      return jsonError(error.code, error.message, 400);
    }
    if (error instanceof PlaygroundConfigurationError) {
      return jsonError(error.code, error.message, statusForCode(error.code));
    }
    if (isTimeout(error)) {
      return jsonError(
        "timeout",
        "The provider did not answer before the playground timeout. Raise PRECALL_PLAYGROUND_TIMEOUT_MS or pick a faster model.",
        504,
      );
    }
    // Anything else is a server-side defect: the browser gets a generic message, never a stack
    // trace, an environment value, or a provider response body.
    return jsonError(
      "internal_error",
      "The playground failed to run this submission. Check the server logs.",
      500,
    );
  }
}
