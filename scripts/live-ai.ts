import { createLangChainAIAdapter } from "../src/langchain.js";
import { createPrecall } from "../src/precall.js";

const enabled = process.env.PRECALL_LIVE_AI === "1";

if (import.meta.main) {
  if (!enabled) {
    process.stdout.write("Live AI check skipped; set PRECALL_LIVE_AI=1 to opt in.\n");
  } else {
    const provider = process.env.PRECALL_LIVE_AI_PROVIDER;
    const modelName = process.env.PRECALL_LIVE_AI_MODEL;
    const apiKey = process.env.PRECALL_LIVE_AI_API_KEY;

    if (
      provider !== "openai" ||
      modelName === undefined ||
      modelName.trim() === "" ||
      apiKey === undefined ||
      apiKey.trim() === ""
    ) {
      process.stderr.write(
        "Live AI check requires PRECALL_LIVE_AI_PROVIDER=openai, PRECALL_LIVE_AI_MODEL, and PRECALL_LIVE_AI_API_KEY.\n",
      );
      process.exitCode = 2;
    } else {
      try {
        // Load the provider only after explicit opt-in so the default harness is offline.
        const { ChatOpenAI } = await import("@langchain/openai");
        const model = new ChatOpenAI({
          apiKey,
          model: modelName,
          maxRetries: 0,
          configuration: { baseURL: "https://api.openai.com/v1" },
        });
        const ai = createLangChainAIAdapter({ model });
        const precall = createPrecall({
          ai,
          fields: [
            { key: "business", label: "Business", sendToAI: true },
            { key: "goal", label: "Goal", sendToAI: true },
            { key: "platform", label: "Platform", sendToAI: true },
            { key: "website", label: "Existing website", sendToAI: true },
            { key: "budget", label: "Budget", sendToAI: true },
            { key: "timing", label: "Timing", sendToAI: true },
          ],
        });
        const result = await precall.process({
          submission: {
            business: "A small fitness business",
            goal: "Customers should book classes and manage memberships.",
            platform: "iPhone and Android preferred.",
            website: "Existing website.",
            budget: "Budget around €15k.",
            timing: "Launch fairly soon.",
          },
        });
        if (result.analysis.status !== "succeeded") {
          process.stderr.write("Live AI check returned an unavailable analysis.\n");
          process.exitCode = 1;
        } else {
          const analysis = result.analysis.result;
          if (
            analysis.facts.length === 0 ||
            analysis.inferences.some((inference) => inference.basedOnFieldKeys.length === 0) ||
            analysis.roadmap.phases.length === 0 ||
            analysis.confidence.level.length === 0
          ) {
            process.stderr.write("Live AI check returned an incomplete analysis.\n");
            process.exitCode = 1;
          } else {
            process.stdout.write("Live AI check passed.\n");
          }
        }
      } catch {
        process.stderr.write("Live AI check failed.\n");
        process.exitCode = 1;
      }
    }
  }
}
