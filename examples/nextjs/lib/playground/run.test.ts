import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { POST as MODELS_POST } from "@/app/api/playground/models/route";
import { POST as RUN_POST } from "@/app/api/playground/run/route";
import { saveProviderConfig } from "@/lib/playground/config";
import { buildDeterministicAnalysis } from "@/lib/playground/deterministic-adapter";
import { PLAYGROUND_FIXTURES } from "@/lib/playground/fixtures";
import { parseRunBody, runPlaygroundRequest } from "@/lib/playground/run";
import type { PlaygroundFieldDraft } from "@/lib/playground/types";

/**
 * Execution boundary tests.
 *
 * Fake mode is exercised directly. Live mode runs against a local OpenAI-compatible stub so the
 * suite stays deterministic: no test here reaches a real provider, and nothing here needs a real
 * credential.
 */

const DRAFT: readonly PlaygroundFieldDraft[] = PLAYGROUND_FIXTURES[0]?.fields ?? [];

let directory = "";
let originalConfigDirectory: string | undefined;
let originalTimeout: string | undefined;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "precall-playground-run-"));
  originalConfigDirectory = process.env["PRECALL_PLAYGROUND_CONFIG_DIR"];
  originalTimeout = process.env["PRECALL_PLAYGROUND_TIMEOUT_MS"];
  process.env["PRECALL_PLAYGROUND_CONFIG_DIR"] = directory;
  delete process.env["PRECALL_PLAYGROUND_TIMEOUT_MS"];
});

afterEach(async () => {
  if (originalConfigDirectory === undefined) delete process.env["PRECALL_PLAYGROUND_CONFIG_DIR"];
  else process.env["PRECALL_PLAYGROUND_CONFIG_DIR"] = originalConfigDirectory;
  if (originalTimeout === undefined) delete process.env["PRECALL_PLAYGROUND_TIMEOUT_MS"];
  else process.env["PRECALL_PLAYGROUND_TIMEOUT_MS"] = originalTimeout;
  await rm(directory, { recursive: true, force: true });
});

function runRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/api/playground/run", {
    method: "POST",
    headers: { Host: "localhost:3000", "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const BASE_BODY = {
  mode: "fake" as const,
  fields: DRAFT,
  costEstimation: { enabled: false, currency: "EUR" },
  simulateAdapterFailure: false,
  useDefaultFlags: false,
};

type StubRequest = { readonly authorization: string | null; readonly body: unknown };

type Stub = {
  readonly baseUrl: string;
  readonly requests: StubRequest[];
  stop(): void;
};

/** Minimal OpenAI-compatible stub: chat completions with a structured tool call. */
function startStub(options: { readonly failWith?: number } = {}): Stub {
  const requests: StubRequest[] = [];
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(request) {
      const url = new URL(request.url);
      const authorization = request.headers.get("authorization");

      if (url.pathname.endsWith("/models")) {
        requests.push({ authorization, body: null });
        return Response.json({ data: [{ id: "stub-model" }, { id: "second-model" }] });
      }
      const body: unknown = await request.json();
      requests.push({ authorization, body });

      if (options.failWith !== undefined) {
        return Response.json(
          { error: { message: "upstream rejected the request: provider-internal-detail" } },
          { status: options.failWith },
        );
      }

      const fields = (body as { messages?: { content?: string }[] }).messages ?? [];
      const serialized = fields.map((message) => message.content ?? "").join("\n");
      const parsedFields: { key: string; label: string }[] = [];
      for (const match of serialized.matchAll(/"key":"([^"]+)","label":"([^"]+)"/gu)) {
        parsedFields.push({ key: match[1] ?? "", label: match[2] ?? "" });
      }
      const analysis = buildDeterministicAnalysis({
        fields: parsedFields.map((field) => ({
          key: field.key,
          label: field.label,
          value: "stated",
        })),
      });
      return Response.json({
        id: "chatcmpl-stub",
        object: "chat.completion",
        created: 0,
        model: "stub-model",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "",
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: { name: "extract", arguments: JSON.stringify(analysis) },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
    },
  });
  return {
    baseUrl: `http://127.0.0.1:${server.port}/v1`,
    requests,
    stop: () => server.stop(true),
  };
}

test("fake mode performs no external network request", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  // Deliberate double cast: Bun's fetch type carries members a test stub does not implement.
  globalThis.fetch = ((input: RequestInfo | URL) => {
    calls.push(String(input));
    throw new Error("fake mode must not reach the network");
  }) as unknown as typeof globalThis.fetch;

  try {
    const response = await RUN_POST(runRequest(BASE_BODY));
    const payload = (await response.json()) as { diagnostics: { externalProvider: boolean } };
    expect(response.status).toBe(200);
    expect(calls).toEqual([]);
    expect(payload.diagnostics.externalProvider).toBe(false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the real PreCall renderer produces the preview HTML and text", async () => {
  const response = await RUN_POST(runRequest(BASE_BODY));
  const payload = (await response.json()) as {
    email: { html: string; text: string; attachments: { filename: string; content: string }[] };
    delivery: unknown;
    result: { analysis: { status: string } };
  };

  expect(payload.result.analysis.status).toBe("succeeded");
  expect(payload.delivery).toEqual({ status: "sent" });
  expect(payload.email.html).toContain("<article><h1>Pre-Call Brief</h1>");
  expect(payload.email.text.startsWith("Pre-Call Brief")).toBe(true);
  expect(payload.email.attachments[0]?.filename).toBe("submission.json");
  // includeInOutput filtering reaches the attachment, not just the brief.
  expect(payload.email.attachments[0]?.content ?? "").not.toContain("internalNotes");
  expect(payload.email.attachments[0]?.content ?? "").toContain("projectSummary");
});

test("builder flags map onto the resolved policy, and withheld fields never reach the adapter", async () => {
  const response = await RUN_POST(runRequest(BASE_BODY));
  const payload = (await response.json()) as {
    aiInput: { fields: { key: string }[] };
    result: {
      request: {
        fields: { key: string; sendToAI: boolean; includeInOutput: boolean; sensitive: boolean }[];
      };
    };
  };
  const sentKeys = payload.aiInput.fields.map((field) => field.key);
  const policy = new Map(payload.result.request.fields.map((field) => [field.key, field]));

  expect(sentKeys).not.toContain("contactEmail");
  expect(sentKeys).toContain("internalNotes");
  expect(policy.get("contactEmail")).toMatchObject({ sendToAI: false, sensitive: true });
  expect(policy.get("internalNotes")).toMatchObject({ sendToAI: true, includeInOutput: false });
});

test("the privacy-canary fixture never sends its canary to the adapter", async () => {
  const canaryFixture = PLAYGROUND_FIXTURES.find((fixture) => fixture.id === "canary");
  expect(canaryFixture).toBeDefined();
  const fields = canaryFixture?.fields ?? [];
  const canaryValue = fields.find((field) => field.key === "internalContact")?.value ?? "";
  expect(canaryValue.length).toBeGreaterThan(0);

  const response = await RUN_POST(runRequest({ ...BASE_BODY, fields }));
  const payload = (await response.json()) as {
    aiInput: { fields: { key: string; value: unknown }[] };
    result: {
      request: { original: Record<string, string> };
      analysis: unknown;
      costEstimate?: unknown;
      sections?: unknown;
    };
    email: { attachments: { content: string }[] };
  };

  // The canary stays in the authoritative request and never reaches the adapter or the brief.
  const sentKeys = payload.aiInput.fields.map((field) => field.key);
  expect(sentKeys).not.toContain("internalContact");
  expect(sentKeys).not.toContain("internalAccountNotes");
  expect(JSON.stringify(payload.aiInput)).not.toContain(canaryValue);
  // AI-generated values only: the authoritative request is expected to retain the canary.
  expect(
    JSON.stringify({
      analysis: payload.result.analysis,
      costEstimate: payload.result.costEstimate,
      sections: payload.result.sections,
    }),
  ).not.toContain(canaryValue);
  expect(payload.result.request.original.internalContact).toBe(canaryValue);
  expect(payload.email.attachments[0]?.content ?? "").not.toContain("internalAccountNotes");
});

test("the not-sent, not-in-output, and sensitive flags are honored independently", async () => {
  const fields: PlaygroundFieldDraft[] = [
    {
      key: "kept",
      label: "Kept",
      value: "visible everywhere",
      sensitive: false,
      sendToAI: true,
      includeInOutput: true,
    },
    {
      key: "noAi",
      label: "No AI",
      value: "professional eyes only",
      sensitive: false,
      sendToAI: false,
      includeInOutput: true,
    },
    {
      key: "noOutput",
      label: "No output",
      value: "context only",
      sensitive: false,
      sendToAI: true,
      includeInOutput: false,
    },
    {
      key: "sensitiveField",
      label: "Sensitive",
      value: "handled carefully",
      sensitive: true,
      sendToAI: true,
      includeInOutput: true,
    },
  ];
  const response = await RUN_POST(runRequest({ ...BASE_BODY, fields }));
  const payload = (await response.json()) as {
    aiInput: { fields: { key: string }[] };
    result: { request: { original: Record<string, string> } };
    email: { attachments: { content: string }[] };
  };

  expect(payload.aiInput.fields.map((field) => field.key).toSorted()).toEqual([
    "kept",
    "noOutput",
    "sensitiveField",
  ]);
  const attachment = payload.email.attachments[0]?.content ?? "";
  expect(attachment).toContain("noAi");
  expect(attachment).not.toContain("noOutput");
  // The authoritative request keeps every submitted value, including the withheld one.
  expect(payload.result.request.original.noAi).toBe("professional eyes only");
});

test("omitting the flags lets PreCall apply its own defaults", async () => {
  // Only `sensitive` is declared: PreCall then derives sendToAI (false) and includeInOutput (true).
  const fields: readonly PlaygroundFieldDraft[] = [
    {
      key: "contactEmail",
      label: "Contact email",
      value: "private@example.com",
      sensitive: true,
    } as PlaygroundFieldDraft,
  ];
  const response = await RUN_POST(runRequest({ ...BASE_BODY, fields, useDefaultFlags: true }));
  const payload = (await response.json()) as {
    aiInput: { fields: { key: string }[] };
    result: { request: { fields: { key: string; sendToAI: boolean; sensitive: boolean }[] } };
  };

  expect(payload.result.request.fields[0]).toMatchObject({ sensitive: true, sendToAI: false });
  expect(payload.aiInput.fields.map((field) => field.key)).not.toContain("contactEmail");
});

test("malformed intakes produce safe errors and the playground keeps working", async () => {
  const invalidJson = await RUN_POST(
    new Request("http://localhost:3000/api/playground/run", {
      method: "POST",
      headers: { Host: "localhost:3000", "Content-Type": "application/json" },
      body: "{ nope",
    }),
  );
  expect(invalidJson.status).toBe(400);
  expect(((await invalidJson.json()) as { code: string }).code).toBe("invalid_json");

  const noFields = await RUN_POST(runRequest({ ...BASE_BODY, fields: [] }));
  expect(noFields.status).toBe(400);
  expect(((await noFields.json()) as { code: string }).code).toBe("invalid_request");

  const duplicateKeys = await RUN_POST(runRequest({ ...BASE_BODY, fields: [DRAFT[0], DRAFT[0]] }));
  expect(duplicateKeys.status).toBe(400);

  const nothingSubmitted = await RUN_POST(
    runRequest({
      ...BASE_BODY,
      fields: [
        {
          key: "empty",
          label: "Empty",
          value: "",
          sensitive: false,
          sendToAI: true,
          includeInOutput: true,
        },
      ],
    }),
  );
  expect(nothingSubmitted.status).toBe(400);
  expect(((await nothingSubmitted.json()) as { code: string }).code).toBe("invalid_submission");

  // A valid run still works afterwards.
  const recovered = await RUN_POST(runRequest(BASE_BODY));
  expect(recovered.status).toBe(200);
});

test("the adapter-failure switch surfaces as an adapter error, not a PreCall failure", async () => {
  const response = await RUN_POST(runRequest({ ...BASE_BODY, simulateAdapterFailure: true }));
  const payload = (await response.json()) as {
    result: { analysis: unknown; request: { original: unknown } };
    diagnostics: { adapterFailure?: string };
    email: { html: string } | null;
  };

  expect(response.status).toBe(200);
  expect(payload.result.analysis).toEqual({ status: "unavailable", reason: "adapter_error" });
  expect(payload.result.request.original).toEqual(
    Object.fromEntries(
      DRAFT.filter((field) => field.value.trim().length > 0).map((field) => [
        field.key,
        field.value,
      ]),
    ),
  );
  expect(payload.email?.html ?? "").toContain("Pre-Call Brief");
  expect(payload.diagnostics.adapterFailure).toBe("adapter_error");
});

test("cost estimation follows the playground configuration", async () => {
  const disabled = (await (await RUN_POST(runRequest(BASE_BODY))).json()) as {
    result: { costEstimate?: unknown };
  };
  expect(disabled.result.costEstimate).toBeUndefined();

  const enabled = (await (
    await RUN_POST(runRequest({ ...BASE_BODY, costEstimation: { enabled: true, currency: "USD" } }))
  ).json()) as {
    result: {
      costEstimate: {
        status: string;
        currency?: string;
        items: { minAmount: number; maxAmount: number }[];
        total: { minAmount: number; maxAmount: number };
      };
    };
  };
  expect(enabled.result.costEstimate.status).toBe("estimated");
  expect(enabled.result.costEstimate.currency).toBe("USD");
  const items = enabled.result.costEstimate.items;
  expect(enabled.result.costEstimate.total).toEqual({
    minAmount: items.reduce((sum, item) => sum + item.minAmount, 0),
    maxAmount: items.reduce((sum, item) => sum + item.maxAmount, 0),
  });
});

test("live mode refuses to run without configuration instead of falling back", async () => {
  const response = await RUN_POST(runRequest({ ...BASE_BODY, mode: "live" }));
  expect(response.status).toBe(501);
  expect(((await response.json()) as { code: string }).code).toBe("live_not_configured");

  // The engine itself reports it too, so no caller can silently continue.
  const rejection = runPlaygroundRequest({ request: { ...BASE_BODY, mode: "live" } });
  await expect(rejection).rejects.toThrow(/No provider is configured/u);
});

test("live mode runs the configured model, and the adapter input stays privacy-filtered", async () => {
  const stub = startStub();
  try {
    await saveProviderConfig({
      baseUrl: stub.baseUrl,
      model: "stub-model",
      apiKey: "stub-secret-key",
    });

    const response = await RUN_POST(runRequest({ ...BASE_BODY, mode: "live" }));
    const text = await response.text();
    const payload = JSON.parse(text) as {
      result: { analysis: { status: string } };
      diagnostics: {
        mode: string;
        externalProvider: boolean;
        provider?: { baseUrl: string; model: string };
      };
    };

    expect(response.status).toBe(200);
    expect(payload.result.analysis.status).toBe("succeeded");
    expect(payload.diagnostics.mode).toBe("live");
    expect(payload.diagnostics.externalProvider).toBe(true);
    expect(payload.diagnostics.provider).toEqual({ baseUrl: stub.baseUrl, model: "stub-model" });

    // The provider saw the key, server-side only, and never the withheld field.
    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0]?.authorization).toBe("Bearer stub-secret-key");
    expect(JSON.stringify(stub.requests[0]?.body)).not.toContain("ops@harbourline.example");
    // ...and the credential never reached the browser.
    expect(text).not.toContain("stub-secret-key");
    expect(text).not.toContain("Bearer");
  } finally {
    stub.stop();
  }
});

test("the models route uses the stored credential server-side and returns identifiers only", async () => {
  const stub = startStub();
  try {
    await saveProviderConfig({
      baseUrl: stub.baseUrl,
      model: "stub-model",
      apiKey: "stub-secret-key",
    });

    const response = await MODELS_POST(
      new Request("http://localhost:3000/api/playground/models", {
        method: "POST",
        headers: { Host: "localhost:3000" },
      }),
    );
    const text = await response.text();

    expect(response.status).toBe(200);
    expect((JSON.parse(text) as { models: string[] }).models).toContain("stub-model");
    // The provider saw the stored credential; the browser never does.
    expect(stub.requests.some((entry) => entry.authorization === "Bearer stub-secret-key")).toBe(
      true,
    );
    expect(text).not.toContain("stub-secret-key");
    expect(text).not.toContain("Bearer");
  } finally {
    stub.stop();
  }
});

test("a provider error is sanitized and classified as an adapter error", async () => {
  const stub = startStub({ failWith: 500 });
  try {
    await saveProviderConfig({
      baseUrl: stub.baseUrl,
      model: "stub-model",
      apiKey: "stub-secret-key",
    });

    const response = await RUN_POST(runRequest({ ...BASE_BODY, mode: "live" }));
    const text = await response.text();
    const payload = JSON.parse(text) as {
      result: { analysis: unknown; request: { original: unknown } };
      diagnostics: { adapterFailure?: string; externalProvider: boolean };
    };

    expect(response.status).toBe(200);
    expect(payload.result.analysis).toEqual({ status: "unavailable", reason: "adapter_error" });
    expect(payload.diagnostics.adapterFailure).toBe("adapter_error");
    expect(payload.diagnostics.externalProvider).toBe(true);
    // The inquiry survives, and no provider detail or credential reaches the browser.
    expect(payload.result.request.original).not.toBeUndefined();
    expect(text).not.toContain("provider-internal-detail");
    expect(text).not.toContain("stub-secret-key");
    expect(text).not.toContain("Bearer");
  } finally {
    stub.stop();
  }
});

test("credentials in the server environment never appear in a response", async () => {
  const sentinels = {
    MODEL_GATEWAY_API_KEY: "sentinel-gateway-key",
    PROVIDER_API_TOKEN: "sentinel-provider-token",
    EXAMPLE_SERVICE_SECRET: "sentinel-service-secret",
  };
  const previous = Object.fromEntries(Object.keys(sentinels).map((key) => [key, process.env[key]]));
  Object.assign(process.env, sentinels);

  try {
    const responses = await Promise.all([
      RUN_POST(runRequest(BASE_BODY)),
      RUN_POST(runRequest({ ...BASE_BODY, simulateAdapterFailure: true })),
      RUN_POST(runRequest({ ...BASE_BODY, mode: "live" })),
      RUN_POST(runRequest({ ...BASE_BODY, fields: [] })),
    ]);
    for (const response of responses) {
      const text = await response.text();
      expect(text).not.toContain("sentinel-");
    }
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("non-local requests cannot run the engine", async () => {
  const response = await RUN_POST(
    new Request("http://evil.example/api/playground/run", {
      method: "POST",
      headers: { Host: "evil.example", "Content-Type": "application/json" },
      body: JSON.stringify(BASE_BODY),
    }),
  );
  expect(response.status).toBe(403);
  expect(((await response.json()) as { code: string }).code).toBe("not_local");
});

test("the same submission produces the same brief twice in fake mode", async () => {
  const first = (await (await RUN_POST(runRequest(BASE_BODY))).json()) as {
    result: { analysis: unknown };
    email: { html: string };
  };
  const second = (await (await RUN_POST(runRequest(BASE_BODY))).json()) as {
    result: { analysis: unknown };
    email: { html: string };
  };
  expect(second.result.analysis).toEqual(first.result.analysis);
  expect(second.email.html).toBe(first.email.html);
});

test("the run body parser rejects shapes it cannot trust", () => {
  expect(parseRunBody(null)).toMatchObject({ ok: false, code: "invalid_request" });
  expect(parseRunBody({ mode: "other", fields: DRAFT })).toMatchObject({
    ok: false,
    code: "invalid_request",
  });
  expect(
    parseRunBody({ mode: "fake", fields: [{ key: "a", label: "", value: "" }] }),
  ).toMatchObject({
    ok: false,
    code: "invalid_request",
  });
  expect(
    parseRunBody({
      mode: "fake",
      fields: DRAFT,
      costEstimation: { enabled: true, currency: "eur" },
    }),
  ).toMatchObject({ ok: false, code: "invalid_request" });
  expect(parseRunBody({ mode: "fake", fields: DRAFT })).toMatchObject({ ok: true });
});
