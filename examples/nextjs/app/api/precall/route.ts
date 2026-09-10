import { IntakeValidationError } from "precall";
import { projectSubmission, runDemoSubmission } from "@/lib/precall";

/**
 * The framework boundary belongs to this application: it reads an HTTP request, converts the
 * untrusted JSON body into a structured submission, and hands that submission to PreCall.
 * PreCall itself sees no `Request`, `NextRequest`, or React value.
 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const submission = projectSubmission(body);
  if (submission === null) {
    return Response.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }

  try {
    return Response.json(await runDemoSubmission(submission));
  } catch (error) {
    if (error instanceof IntakeValidationError) {
      return Response.json({ error: error.message, code: error.code }, { status: 400 });
    }
    throw error;
  }
}
