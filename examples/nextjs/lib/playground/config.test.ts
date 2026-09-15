import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GET, POST } from "@/app/api/playground/config/route";
import { POST as MODELS_POST } from "@/app/api/playground/models/route";
import {
  readProviderMetadata,
  readStoredProviderConfig,
  saveProviderConfig,
} from "@/lib/playground/config";

/**
 * Configuration boundary tests.
 *
 * The provider file is redirected to a temporary directory, so these tests never read or write the
 * developer's real `.precall-playground/config.json`.
 */

let directory = "";
let originalDirectory: string | undefined;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "precall-playground-config-"));
  originalDirectory = process.env["PRECALL_PLAYGROUND_CONFIG_DIR"];
  process.env["PRECALL_PLAYGROUND_CONFIG_DIR"] = directory;
});

afterEach(async () => {
  if (originalDirectory === undefined) delete process.env["PRECALL_PLAYGROUND_CONFIG_DIR"];
  else process.env["PRECALL_PLAYGROUND_CONFIG_DIR"] = originalDirectory;
  await rm(directory, { recursive: true, force: true });
});

function localRequest(body?: unknown): Request {
  return new Request("http://localhost:3000/api/playground/config", {
    method: body === undefined ? "GET" : "POST",
    headers: { Host: "localhost:3000", "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test("the repository ignores the local configuration directory", async () => {
  const result = Bun.spawnSync({
    cmd: ["git", "check-ignore", "--quiet", ".precall-playground/config.json"],
    cwd: join(import.meta.dir, "..", "..", "..", ".."),
  });
  expect(result.exitCode).toBe(0);
});

test("an empty configuration reports itself as unconfigured", async () => {
  const metadata = await readProviderMetadata();
  expect(metadata.configured).toBe(false);
  expect(metadata.hasApiKey).toBe(false);
  expect(metadata.configFile).toBe(".precall-playground/config.json");
  expect(await readStoredProviderConfig()).toBeNull();
});

test("saving stores the provider, and the file is written with restrictive permissions", async () => {
  const result = await saveProviderConfig({
    baseUrl: "https://gateway.example.com/v1/",
    model: "some-model",
    apiKey: "test-key-value",
    structuredOutput: "jsonSchema",
    api: "responses",
  });
  expect(result.ok).toBe(true);

  const stored = await readStoredProviderConfig();
  expect(stored).toMatchObject({
    baseUrl: "https://gateway.example.com/v1",
    model: "some-model",
    structuredOutput: "jsonSchema",
    api: "responses",
  });

  const path = join(directory, "config.json");
  const mode = (await stat(path)).mode & 0o777;
  // POSIX platforms: 0600. Windows reports a different mask, so only POSIX is asserted.
  if (process.platform !== "win32") expect(mode).toBe(0o600);
  // The file on disk does hold the key, which is exactly why it must never be committed.
  expect(await readFile(path, "utf8")).toContain("test-key-value");
});

test("saving without a key keeps the stored one, and the first save requires it", async () => {
  const missingKey = await saveProviderConfig({
    baseUrl: "https://gateway.example.com/v1",
    model: "m",
  });
  expect(missingKey).toMatchObject({ ok: false, code: "invalid_configuration" });

  await saveProviderConfig({
    baseUrl: "https://gateway.example.com/v1",
    model: "first",
    apiKey: "first-key",
  });
  const updated = await saveProviderConfig({
    baseUrl: "https://gateway.example.com/v1",
    model: "second",
  });
  expect(updated.ok).toBe(true);

  const stored = await readStoredProviderConfig();
  expect(stored?.model).toBe("second");
  expect(stored?.apiKey).toBe("first-key");
});

test("invalid configuration values are rejected with actionable codes", async () => {
  expect(await saveProviderConfig({ baseUrl: "not-a-url", model: "m", apiKey: "k" })).toMatchObject(
    {
      ok: false,
      code: "invalid_configuration",
    },
  );
  expect(
    await saveProviderConfig({ baseUrl: "ftp://example.com", model: "m", apiKey: "k" }),
  ).toMatchObject({ ok: false, code: "invalid_configuration" });
  expect(
    await saveProviderConfig({ baseUrl: "https://x.example/v1", model: "  ", apiKey: "k" }),
  ).toMatchObject({ ok: false, code: "invalid_configuration" });
  expect(
    await saveProviderConfig({
      baseUrl: "https://x.example/v1",
      model: "m",
      apiKey: "k",
      extraHeaders: { "x-test": "line\r\ninjection" },
    }),
  ).toMatchObject({ ok: false, code: "invalid_configuration" });
});

test("a base URL carrying credentials, a query, or a fragment can never be persisted", async () => {
  const rejected = [
    "https://user:pass@example.com/v1",
    "https://user@example.com/v1",
    "https://example.com/v1?token=secret",
    "https://example.com/v1?",
    "https://example.com/v1#fragment",
    "https://example.com/v1#",
  ];

  for (const baseUrl of rejected) {
    const result = await saveProviderConfig({
      baseUrl,
      model: "some-model",
      apiKey: "some-key",
    });

    expect(result).toMatchObject({ ok: false, code: "invalid_configuration" });
    // The rejection never echoes the value: it may itself contain a credential.
    if (!result.ok) {
      expect(result.message).toBe(
        "baseUrl must be an http(s) API base URL without credentials, query parameters, or fragments.",
      );
      // Nothing from the rejected input is echoed back.
      expect(result.message).not.toContain("example.com");
      expect(result.message).not.toContain("user:pass");
      expect(result.message).not.toContain("token=secret");
    }

    // Nothing was written, so nothing can be reflected through the metadata projection.
    const metadata = await readProviderMetadata();
    expect(metadata.configured).toBe(false);
    expect(metadata.baseUrl).toBeUndefined();
    expect(JSON.stringify(metadata)).not.toContain("pass@");
    expect(JSON.stringify(metadata)).not.toContain("token=secret");
  }

  // A valid configuration still saves afterwards.
  const saved = await saveProviderConfig({
    baseUrl: "https://example.com/v1",
    model: "some-model",
    apiKey: "some-key",
  });
  expect(saved.ok).toBe(true);
});

test("a rejected save leaves an existing configuration untouched", async () => {
  await saveProviderConfig({
    baseUrl: "https://gateway.example.com/v1",
    model: "kept-model",
    apiKey: "kept-key",
  });

  const rejected = await saveProviderConfig({
    baseUrl: "https://attacker.invalid/v1?token=secret",
    model: "replacement-model",
    apiKey: "replacement-key",
  });
  expect(rejected).toMatchObject({ ok: false, code: "invalid_configuration" });

  const stored = await readStoredProviderConfig();
  expect(stored?.baseUrl).toBe("https://gateway.example.com/v1");
  expect(stored?.model).toBe("kept-model");
  expect(stored?.apiKey).toBe("kept-key");
});

test("a hand-edited config file with a credential-bearing base URL is not reflected as metadata", async () => {
  await writeFile(
    join(directory, "config.json"),
    `${JSON.stringify(
      {
        provider: "openai-compatible",
        baseUrl: "https://user:pass@example.com/v1",
        model: "hand-edited",
        apiKey: "hand-edited-key",
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );

  const metadata = await readProviderMetadata();
  expect(metadata.configured).toBe(false);
  expect(JSON.stringify(metadata)).not.toContain("pass@");
  expect(await readStoredProviderConfig()).toBeNull();
});

test("a stored credential is reused only while the provider origin is unchanged", async () => {
  await saveProviderConfig({
    baseUrl: "https://provider-a.example/v1",
    model: "model-one",
    apiKey: "secret-for-provider-a",
  });

  // Same origin, different model.
  expect(
    await saveProviderConfig({ baseUrl: "https://provider-a.example/v1", model: "model-two" }),
  ).toMatchObject({ ok: true });
  expect((await readStoredProviderConfig())?.apiKey).toBe("secret-for-provider-a");
  expect((await readStoredProviderConfig())?.model).toBe("model-two");

  // Same origin, different API path.
  expect(
    await saveProviderConfig({
      baseUrl: "https://provider-a.example/v1/openai",
      model: "model-two",
    }),
  ).toMatchObject({ ok: true });
  expect((await readStoredProviderConfig())?.apiKey).toBe("secret-for-provider-a");

  // Different hostname.
  const otherHost = await saveProviderConfig({
    baseUrl: "https://provider-b.example/v1",
    model: "model-two",
  });
  expect(otherHost).toMatchObject({ ok: false, code: "invalid_configuration" });
  if (!otherHost.ok) {
    expect(otherHost.message).toBe("A new API key is required when the provider origin changes.");
    expect(otherHost.message).not.toContain("provider-b");
    expect(otherHost.message).not.toContain("secret-for-provider-a");
  }

  // Different port.
  expect(
    await saveProviderConfig({ baseUrl: "https://provider-a.example:8443/v1", model: "model-two" }),
  ).toMatchObject({
    ok: false,
    code: "invalid_configuration",
  });

  // Same host and port, different scheme (https -> http would unencrypted-send the credential).
  expect(
    await saveProviderConfig({ baseUrl: "http://127.0.0.1:8443/v1", model: "model-two" }),
  ).toMatchObject({
    ok: false,
    code: "invalid_configuration",
  });

  // Every rejection left the stored credential and destination intact.
  const stored = await readStoredProviderConfig();
  expect(stored?.baseUrl).toBe("https://provider-a.example/v1/openai");
  expect(stored?.apiKey).toBe("secret-for-provider-a");
});

test("supplying a new key is always accepted, including on a new origin", async () => {
  await saveProviderConfig({
    baseUrl: "https://provider-a.example/v1",
    model: "model-one",
    apiKey: "secret-for-provider-a",
  });

  const moved = await saveProviderConfig({
    baseUrl: "https://provider-b.example/v1",
    model: "model-one",
    apiKey: "secret-for-provider-b",
  });
  expect(moved.ok).toBe(true);
  expect((await readStoredProviderConfig())?.apiKey).toBe("secret-for-provider-b");
});

test("plain HTTP is accepted only for loopback providers", async () => {
  const loopback = ["http://127.0.0.1:8080/v1", "http://localhost:8080/v1", "http://[::1]:8080/v1"];
  for (const baseUrl of loopback) {
    expect(
      await saveProviderConfig({ baseUrl, model: "local-model", apiKey: "local-key" }),
    ).toMatchObject({ ok: true });
    expect((await readStoredProviderConfig())?.baseUrl).toBe(baseUrl);
  }

  const remoteHttp = [
    "http://remote-provider.example/v1",
    "http://10.1.2.3:8080/v1",
    "http://192.168.1.10:1234/v1",
  ];
  for (const baseUrl of remoteHttp) {
    const result = await saveProviderConfig({
      baseUrl,
      model: "remote-model",
      apiKey: "remote-key",
    });
    expect(result).toMatchObject({ ok: false, code: "invalid_configuration" });
    if (!result.ok) {
      expect(result.message).toBe(
        "baseUrl must use https unless the host is loopback; a credential must not be sent over plain HTTP to a remote provider.",
      );
      expect(result.message).not.toContain("remote-provider");
      expect(result.message).not.toContain("10.1.2.3");
    }
  }

  // HTTPS to a remote host stays allowed — with a credential, because the origin changes.
  expect(
    await saveProviderConfig({
      baseUrl: "https://remote-provider.example/v1",
      model: "remote-model",
      apiKey: "remote-key",
    }),
  ).toMatchObject({ ok: true });
});

test("the config GET never returns the API key", async () => {
  await saveProviderConfig({
    baseUrl: "https://gateway.example.com/v1",
    model: "some-model",
    apiKey: "secret-sentinel-key",
    extraHeaders: { "x-session": "secret-header-value" },
  });

  const response = await GET(localRequest());
  const text = await response.text();

  expect(response.status).toBe(200);
  expect(text).not.toContain("secret-sentinel-key");
  expect(text).not.toContain("secret-header-value");
  const payload = JSON.parse(text) as Record<string, unknown>;
  expect(payload).toMatchObject({
    configured: true,
    hasApiKey: true,
    provider: "openai-compatible",
    baseUrl: "https://gateway.example.com/v1",
    model: "some-model",
  });
  expect(payload).not.toHaveProperty("apiKey");
  expect(JSON.stringify(payload.headerNames)).toBe('["x-session"]');
});

test("the config POST never echoes the submitted key and persists what it accepts", async () => {
  const response = await POST(
    localRequest({
      baseUrl: "http://127.0.0.1:8080/v1",
      model: "local-model",
      apiKey: "posted-secret-key",
    }),
  );
  const text = await response.text();

  expect(response.status).toBe(200);
  expect(text).not.toContain("posted-secret-key");
  expect((await readStoredProviderConfig())?.apiKey).toBe("posted-secret-key");
  expect((await readStoredProviderConfig())?.baseUrl).toBe("http://127.0.0.1:8080/v1");
});

test("non-local requests are refused, including on the models route", async () => {
  const hostile = new Request("http://evil.example/api/playground/config", {
    method: "GET",
    headers: { Host: "evil.example" },
  });
  const hostileGet = await GET(hostile);
  expect(hostileGet.status).toBe(403);
  expect((await hostileGet.json()).code).toBe("not_local");

  const hostileOrigin = new Request("http://localhost:3000/api/playground/config", {
    method: "GET",
    headers: { Host: "localhost:3000", Origin: "https://evil.example" },
  });
  expect((await GET(hostileOrigin)).status).toBe(403);

  const modelsPost = await MODELS_POST(
    new Request("http://evil.example/api/playground/models", {
      method: "POST",
      headers: { Host: "10.1.2.3:3000" },
    }),
  );
  expect(modelsPost.status).toBe(403);

  // Values that are not genuine loopback names are refused, including wildcard binds.
  for (const host of [
    "0.0.0.0:3000",
    "[::]:3000",
    "192.168.1.10:3000",
    "playground.example",
    "127.0.0.1.evil.example:3000",
  ]) {
    const guarded = await GET(
      new Request("http://localhost:3000/api/playground/config", {
        method: "GET",
        headers: { Host: host },
      }),
    );
    expect(guarded.status).toBe(403);
  }

  // Genuine loopback names are served.
  for (const host of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000"]) {
    const allowed = await GET(
      new Request("http://localhost:3000/api/playground/config", {
        method: "GET",
        headers: { Host: host },
      }),
    );
    expect(allowed.status).toBe(200);
  }
});

test("the models route reports a missing configuration instead of guessing", async () => {
  const response = await MODELS_POST(localRequest({}));
  expect(response.status).toBe(501);
  expect((await response.json()).code).toBe("live_not_configured");
});
