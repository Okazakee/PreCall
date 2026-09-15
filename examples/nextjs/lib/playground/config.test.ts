import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
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
});

test("the models route reports a missing configuration instead of guessing", async () => {
  const response = await MODELS_POST(localRequest({}));
  expect(response.status).toBe(501);
  expect((await response.json()).code).toBe("live_not_configured");
});
