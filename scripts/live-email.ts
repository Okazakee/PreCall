import type { AnalysisResult } from "../src/analysis/result.js";
import { createPrecall } from "../src/index.js";
import { createResendEmailTransport } from "../src/resend.js";

const enabled = process.env.PRECALL_LIVE_EMAIL === "1";

function configured(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}

const syntheticAnalysis: AnalysisResult = {
  summary: "Synthetic live email integration check.",
  clarity: { level: "high", reason: "The deterministic live harness fixture is complete." },
  facts: [{ text: "The fixture is synthetic.", sourceFieldKeys: ["business"] }],
  inferences: [],
  assumptions: [],
  unknowns: [],
  risks: [],
  discoveryQuestions: [],
  roadmap: {
    status: "available",
    phases: [{ name: "Verification", purpose: "Confirm the live email mapping." }],
  },
  confidence: { level: "high", reason: "Every fixture value is controlled by the harness." },
};

if (import.meta.main) {
  if (!enabled) {
    process.stdout.write("Live email check skipped; set PRECALL_LIVE_EMAIL=1 to opt in.\n");
  } else {
    const apiKey = process.env.PRECALL_LIVE_EMAIL_API_KEY;
    const from = process.env.PRECALL_LIVE_EMAIL_FROM;
    const to = process.env.PRECALL_LIVE_EMAIL_TO;

    if (!configured(apiKey) || !configured(from) || !configured(to)) {
      process.stderr.write(
        "Live email check requires PRECALL_LIVE_EMAIL_API_KEY, PRECALL_LIVE_EMAIL_FROM, and PRECALL_LIVE_EMAIL_TO.\n",
      );
      process.exitCode = 2;
    } else {
      try {
        const precall = createPrecall({
          ai: { generateAnalysis: async () => syntheticAnalysis },
          fields: [
            { key: "business", label: "Business", sendToAI: true },
            { key: "goal", label: "Goal", sendToAI: true },
          ],
        });
        const result = await precall.process({
          submission: {
            business: "Synthetic PreCall live email fixture",
            goal: "Verify rendered HTML, text, and submission attachment",
          },
        });
        const outcome = await precall.deliver({
          result,
          transport: createResendEmailTransport({ apiKey, from }),
          recipient: to,
        });
        if (outcome.status !== "sent") throw new Error("delivery did not succeed");
        process.stdout.write("Live email check passed.\n");
      } catch {
        process.stderr.write("Live email check failed.\n");
        process.exitCode = 1;
      }
    }
  }
}
