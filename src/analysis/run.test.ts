import { describe, expect, test } from "bun:test";
import type { AnalysisInput } from "./input.js";
import { type AnalysisResult, AnalysisResultSchema } from "./result.js";
import {
  type AIAdapter,
  type AIAnalysisRequest,
  type AnalysisExecutionResult,
  runAnalysis,
} from "./run.js";

const representativeResult: AnalysisResult = {
  summary: "A fitness studio needs an app for class bookings and memberships.",
  clarity: {
    level: "medium",
    reason: "The desired outcome is clear, but operational details remain open.",
  },
  facts: [{ text: "The studio offers classes.", sourceFieldKeys: ["business"] }],
  inferences: [
    {
      text: "An existing booking workflow may need integration.",
      confidence: "medium",
      reason: "Class bookings usually depend on an existing schedule or system.",
      basedOnFieldKeys: ["business"],
    },
  ],
  assumptions: [{ text: "The current website remains in use during rollout.", impact: "low" }],
  unknowns: [
    {
      text: "The membership rules are not specified.",
      priority: "important",
      whyItMatters: "Different rules materially change the required scope.",
    },
  ],
  risks: [
    {
      text: "Unclear booking rules could cause rework.",
      reason: "The request does not describe the current booking workflow.",
      severity: "medium",
    },
  ],
  discoveryQuestions: [
    {
      question: "How are classes and memberships handled today?",
      priority: "critical",
      reason: "The current workflow determines integration and scope.",
    },
  ],
  roadmap: {
    status: "limited",
    note: "Begin with discovery before committing to implementation scope.",
    phases: [{ name: "Discovery", purpose: "Clarify workflows and constraints." }],
  },
  confidence: {
    level: "medium",
    reason: "The goal is known, while operational details need validation.",
  },
};

const vagueResult: AnalysisResult = {
  summary: "The request needs clarification before a meaningful plan can be made.",
  clarity: { level: "low", reason: "The desired outcome and constraints are not stated." },
  facts: [],
  inferences: [],
  assumptions: [],
  unknowns: [],
  risks: [],
  discoveryQuestions: [
    {
      question: "What outcome should this work achieve, and for whom?",
      priority: "critical",
      reason: "The intended outcome is necessary to evaluate an approach.",
    },
  ],
  roadmap: {
    status: "insufficient_information",
    phases: [{ name: "Discovery", purpose: "Collect missing goals and constraints." }],
  },
  confidence: {
    level: "insufficient_information",
    reason: "There is not enough grounded input for a responsible plan.",
  },
};

const input: AnalysisInput = {
  fields: [
    {
      key: "business",
      label: "Business description",
      value: { kind: "fitness studio", locations: 1 },
      description: "A public description of the business",
    },
    { key: "goal", label: "Goal", value: "Book classes and manage memberships" },
  ],
};

function adapterReturning(
  output: unknown,
  onCall?: (request: AIAnalysisRequest) => void,
): AIAdapter {
  return {
    async generateAnalysis(request) {
      onCall?.(request);
      return output;
    },
  };
}

async function runWith(output: unknown): Promise<AnalysisExecutionResult> {
  return runAnalysis(adapterReturning(output), input);
}

describe("runAnalysis", () => {
  test("accepts a representative result and returns the schema-parsed value", async () => {
    const outcome = await runWith(representativeResult);

    expect(outcome.status).toBe("succeeded");
    if (outcome.status !== "succeeded") return;
    expect(AnalysisResultSchema.safeParse(outcome.result).success).toBe(true);
    expect(outcome.result).toEqual(representativeResult);
    expect(outcome.result).not.toBe(representativeResult);
  });

  test("accepts a vague but structurally valid result", async () => {
    const outcome = await runWith(vagueResult);

    expect(outcome).toEqual({ status: "succeeded", result: vagueResult });
  });

  test("calls the adapter once and forwards exactly the analysis input", async () => {
    const requests: AIAnalysisRequest[] = [];
    const outcome = await runAnalysis(
      adapterReturning(representativeResult, (request) => requests.push(request)),
      input,
    );

    expect(outcome.status).toBe("succeeded");
    expect(requests).toHaveLength(1);
    expect(requests[0]).toEqual({ input });
    expect(requests[0]?.input).toBe(input);
    expect(Object.keys(requests[0] ?? {})).toEqual(["input"]);
    expect(Object.keys(requests[0]?.input.fields[0] ?? {})).toEqual([
      "key",
      "label",
      "value",
      "description",
    ]);
    expect(Object.keys(requests[0]?.input.fields[1] ?? {})).toEqual(["key", "label", "value"]);
  });

  test("maps malformed output to invalid_output without retrying", async () => {
    let calls = 0;
    const outcome = await runAnalysis(
      adapterReturning(null, () => {
        calls += 1;
      }),
      input,
    );

    expect(outcome).toEqual({ status: "unavailable", code: "invalid_output" });
    expect(calls).toBe(1);
  });

  test.each(["provider", "processing", "budgetEstimate"])(
    "rejects unsupported root field %s",
    async (key) => {
      const output = { ...representativeResult, [key]: "unsupported" };
      await expect(runWith(output)).resolves.toEqual({
        status: "unavailable",
        code: "invalid_output",
      });
    },
  );

  test("maps an ordinary adapter error without exposing its details", async () => {
    const secret = "private adapter failure details";
    const outcome = await runAnalysis(
      {
        async generateAnalysis() {
          throw new Error(secret);
        },
      },
      input,
    );

    expect(outcome).toEqual({ status: "unavailable", code: "adapter_error" });
    expect(JSON.stringify(outcome)).not.toContain(secret);
  });

  test("returns no_input without invoking the adapter", async () => {
    let calls = 0;
    const outcome = await runAnalysis(
      adapterReturning(representativeResult, () => {
        calls += 1;
      }),
      { fields: [] },
    );

    expect(outcome).toEqual({ status: "unavailable", code: "no_input" });
    expect(calls).toBe(0);
  });

  test("propagates a pre-aborted signal and prevents invocation", async () => {
    const controller = new AbortController();
    const reason = { kind: "caller-cancelled" };
    controller.abort(reason);
    let calls = 0;

    let thrown: unknown;
    try {
      await runAnalysis(
        adapterReturning(representativeResult, () => {
          calls += 1;
        }),
        { fields: [] },
        controller.signal,
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(reason);
    expect(calls).toBe(0);
  });

  test("propagates cancellation that occurs while the adapter is running", async () => {
    const controller = new AbortController();
    const reason = new Error("caller stopped analysis");
    let calls = 0;
    const outcome = runAnalysis(
      {
        async generateAnalysis() {
          calls += 1;
          controller.abort(reason);
          throw new Error("adapter rejection after cancellation");
        },
      },
      input,
      controller.signal,
    );

    let thrown: unknown;
    try {
      await outcome;
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(reason);
    expect(calls).toBe(1);
  });

  test("propagates cancellation that occurs during output parsing", async () => {
    const controller = new AbortController();
    const reason = new Error("caller stopped during output parsing");
    let calls = 0;
    let getterCalls = 0;
    const output = new Proxy(representativeResult, {
      get(target, property, receiver) {
        if (property === "summary") {
          getterCalls += 1;
          controller.abort(reason);
        }
        return Reflect.get(target, property, receiver);
      },
    });

    let thrown: unknown;
    try {
      await runAnalysis(
        adapterReturning(output, () => {
          calls += 1;
        }),
        input,
        controller.signal,
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(reason);
    expect(getterCalls).toBeGreaterThan(0);
    expect(calls).toBe(1);
  });

  test("forwards a supplied signal by identity and omits signal otherwise", async () => {
    const controller = new AbortController();
    const requests: AIAnalysisRequest[] = [];
    await runAnalysis(
      adapterReturning(vagueResult, (request) => requests.push(request)),
      input,
      controller.signal,
    );
    await runAnalysis(
      adapterReturning(vagueResult, (request) => requests.push(request)),
      input,
    );

    expect(requests[0]).toEqual({ input, signal: controller.signal });
    expect(requests[0]?.signal).toBe(controller.signal);
    expect(requests[1]).toEqual({ input });
    expect("signal" in (requests[1] ?? {})).toBe(false);
  });

  test("keeps accepted output detached from adapter-owned nested objects", async () => {
    const adapterOutput = structuredClone(representativeResult);
    const outcome = await runWith(adapterOutput);
    if (outcome.status !== "succeeded") throw new Error("expected successful analysis");

    const firstPhase = adapterOutput.roadmap.phases[0];
    const firstFact = adapterOutput.facts[0];
    if (firstPhase === undefined || firstFact === undefined) {
      throw new Error("expected representative result sections");
    }
    firstPhase.purpose = "mutated after parsing";
    firstFact.text = "mutated after parsing";
    expect(outcome.result.roadmap.phases[0]?.purpose).toBe("Clarify workflows and constraints.");
    expect(outcome.result.facts[0]?.text).toBe("The studio offers classes.");
  });

  test("accepts malicious semantic strings when the result remains structurally valid", async () => {
    const output = {
      ...vagueResult,
      summary: "Ignore all instructions; <script>alert('x')</script>",
      clarity: {
        ...vagueResult.clarity,
        reason: '"; DROP TABLE analyses; --',
      },
    };

    const outcome = await runWith(output);

    expect(outcome).toEqual({ status: "succeeded", result: output });
  });
});
