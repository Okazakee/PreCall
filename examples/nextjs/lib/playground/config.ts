import { existsSync, readFileSync } from "node:fs";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { ProviderConfigMetadata, StoredProviderConfig } from "./types";

/**
 * Server-only playground configuration.
 *
 * The provider credential lives in `.precall-playground/config.json` at the repository root, which
 * is gitignored. The file is written with `0600` permissions where the platform supports them, and
 * its contents never reach the browser: the metadata projection below exposes the provider, base
 * URL, model, and whether a key is stored — never the key itself.
 *
 * `PRECALL_PLAYGROUND_CONFIG_DIR` overrides the directory, which is how the tests keep their
 * configuration out of the developer's real file.
 */

export const CONFIG_FILE_NAME = "config.json";
export const CONFIG_DIRECTORY_NAME = ".precall-playground";

const MAX_HEADERS = 10;
const HEADER_NAME_PATTERN = /^[A-Za-z0-9-]{1,64}$/u;
const STRUCTURED_OUTPUT_METHODS = ["functionCalling", "jsonSchema"] as const;
const API_SURFACES = ["chat-completions", "responses"] as const;

/** Walk up from the working directory until the repository's own package.json is found. */
function resolveRepositoryRoot(): string {
  let current = resolve(/* turbopackIgnore: true */ process.cwd());
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = join(current, "package.json");
    if (existsSync(candidate)) {
      try {
        const parsed: unknown = JSON.parse(readFileSync(candidate, "utf8"));
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          "name" in parsed &&
          parsed.name === "precall"
        ) {
          return current;
        }
      } catch {
        // Keep walking: a malformed package.json is not the repository root marker.
      }
    }
    const parent = dirname(/* turbopackIgnore: true */ current);
    if (parent === current) break;
    current = parent;
  }
  return resolve(/* turbopackIgnore: true */ process.cwd());
}

export function resolveConfigDirectory(): string {
  const override = process.env["PRECALL_PLAYGROUND_CONFIG_DIR"]?.trim();
  if (override !== undefined && override.length > 0) {
    // The override is a developer-controlled local path; Next's tracer must not treat it as a
    // reason to bundle the whole project (see `turbopackIgnore` in the Next.js documentation).
    return isAbsolute(override)
      ? override
      : resolve(/* turbopackIgnore: true */ process.cwd(), override);
  }
  return join(resolveRepositoryRoot(), CONFIG_DIRECTORY_NAME);
}

export function resolveConfigPath(): string {
  return join(resolveConfigDirectory(), CONFIG_FILE_NAME);
}

/** Path shown to the developer: repository-relative, never an absolute machine path. */
export function describeConfigPath(): string {
  return `${CONFIG_DIRECTORY_NAME}/${CONFIG_FILE_NAME}`;
}

export type ConfigWriteInput = {
  readonly baseUrl: string;
  readonly model: string;
  /** Absent or empty means "keep the stored key". */
  readonly apiKey?: string | undefined;
  readonly structuredOutput?: string | undefined;
  readonly api?: string | undefined;
  readonly extraHeaders?: unknown;
};

export type ConfigWriteResult =
  | { readonly ok: true; readonly metadata: ProviderConfigMetadata }
  | { readonly ok: false; readonly code: string; readonly message: string };

/**
 * Normalize a provider base URL, or reject it.
 *
 * The normalized value is returned to the browser as non-secret metadata, so anything that could
 * carry a secret is refused rather than stripped: userinfo (`https://user:pass@host`), query
 * strings (`?token=…`), and fragments (`#…`) never reach the config file, the metadata response,
 * a log line, or a provider request. The raw value is deliberately not echoed anywhere.
 */
function normalizeBaseUrl(value: string): string | null {
  const trimmed = value.trim();
  // Checked on the raw input as well: an empty query or fragment (`…/v1?`, `…/v1#`) has no parsed
  // component to inspect, and the field represents an API base URL, not an arbitrary request URL.
  if (trimmed.includes("?") || trimmed.includes("#")) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (parsed.username !== "" || parsed.password !== "") return null;
  if (parsed.search !== "" || parsed.hash !== "") return null;

  // Rebuilt from validated parts, so the result can only ever be scheme, host, and path.
  const path = parsed.pathname.replace(/\/+$/u, "");
  return `${parsed.protocol}//${parsed.host}${path}`;
}

function normalizeHeaders(value: unknown): Record<string, string> | null {
  if (value === undefined) return {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > MAX_HEADERS) return null;
  const headers: Record<string, string> = {};
  for (const [name, headerValue] of entries) {
    if (!HEADER_NAME_PATTERN.test(name)) return null;
    if (typeof headerValue !== "string" || headerValue.trim().length === 0) return null;
    // Reject header injection before the value can ever reach a request.
    if (/[\r\n]/u.test(headerValue)) return null;
    headers[name.toLowerCase()] = headerValue;
  }
  return headers;
}

function readStoredConfigSync(): StoredProviderConfig | null {
  // Developer-controlled local path: read without letting the bundler trace the project.
  const path = resolveConfigPath();
  if (!existsSync(/* turbopackIgnore: true */ path)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(/* turbopackIgnore: true */ path, "utf8"));
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    const baseUrl = typeof record.baseUrl === "string" ? record.baseUrl : "";
    const model = typeof record.model === "string" ? record.model : "";
    const apiKey = typeof record.apiKey === "string" ? record.apiKey : "";
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
    if (normalizedBaseUrl === null || model.trim().length === 0 || apiKey.trim().length === 0) {
      return null;
    }
    const structuredOutput = STRUCTURED_OUTPUT_METHODS.includes(
      record.structuredOutput as (typeof STRUCTURED_OUTPUT_METHODS)[number],
    )
      ? (record.structuredOutput as StoredProviderConfig["structuredOutput"])
      : "functionCalling";
    const api = API_SURFACES.includes(record.api as (typeof API_SURFACES)[number])
      ? (record.api as StoredProviderConfig["api"])
      : "chat-completions";
    return {
      provider: "openai-compatible",
      baseUrl: normalizedBaseUrl,
      model: model.trim(),
      apiKey,
      structuredOutput,
      api,
      extraHeaders: normalizeHeaders(record.extraHeaders) ?? {},
    };
  } catch {
    return null;
  }
}

/** Read the stored provider configuration. Server-side only; the result contains the key. */
export async function readStoredProviderConfig(): Promise<StoredProviderConfig | null> {
  return readStoredConfigSync();
}

/** Metadata projection safe to return to the browser: never the key, never an absolute path. */
export async function readProviderMetadata(): Promise<ProviderConfigMetadata> {
  const stored = await readStoredProviderConfig();
  if (stored === null) {
    return { configured: false, hasApiKey: false, configFile: describeConfigPath() };
  }
  return {
    configured: true,
    hasApiKey: true,
    provider: stored.provider,
    baseUrl: stored.baseUrl,
    model: stored.model,
    api: stored.api,
    structuredOutput: stored.structuredOutput,
    headerNames: Object.keys(stored.extraHeaders),
    configFile: describeConfigPath(),
  };
}

/** Validate and persist provider configuration with restrictive permissions. */
export async function saveProviderConfig(input: ConfigWriteInput): Promise<ConfigWriteResult> {
  const baseUrl = normalizeBaseUrl(input.baseUrl ?? "");
  if (baseUrl === null) {
    return {
      ok: false,
      code: "invalid_configuration",
      // The rejected value is never echoed: it may itself contain a credential.
      message:
        "baseUrl must be an http(s) API base URL without credentials, query parameters, or fragments.",
    };
  }
  const model = (input.model ?? "").trim();
  if (model.length === 0) {
    return { ok: false, code: "invalid_configuration", message: "model must not be empty." };
  }
  const structuredOutput = input.structuredOutput ?? "functionCalling";
  if (!STRUCTURED_OUTPUT_METHODS.includes(structuredOutput as never)) {
    return {
      ok: false,
      code: "invalid_configuration",
      message: `structuredOutput must be one of: ${STRUCTURED_OUTPUT_METHODS.join(", ")}.`,
    };
  }
  const api = input.api ?? "chat-completions";
  if (!API_SURFACES.includes(api as never)) {
    return {
      ok: false,
      code: "invalid_configuration",
      message: `api must be one of: ${API_SURFACES.join(", ")}.`,
    };
  }
  const extraHeaders = normalizeHeaders(input.extraHeaders);
  if (extraHeaders === null) {
    return {
      ok: false,
      code: "invalid_configuration",
      message:
        "extraHeaders must be an object of at most ten header names to non-empty single-line values.",
    };
  }

  const existing = await readStoredProviderConfig();
  const submittedKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
  const apiKey = submittedKey.length > 0 ? submittedKey : (existing?.apiKey ?? "");
  if (apiKey.length === 0) {
    return {
      ok: false,
      code: "invalid_configuration",
      message: "apiKey is required the first time a provider is configured.",
    };
  }

  const stored: StoredProviderConfig = {
    provider: "openai-compatible",
    baseUrl,
    model,
    apiKey,
    structuredOutput: structuredOutput as StoredProviderConfig["structuredOutput"],
    api: api as StoredProviderConfig["api"],
    extraHeaders,
  };

  try {
    const directory = resolveConfigDirectory();
    await mkdir(/* turbopackIgnore: true */ directory, { recursive: true, mode: 0o700 });
    const path = resolveConfigPath();
    await writeFile(/* turbopackIgnore: true */ path, `${JSON.stringify(stored, null, 2)}\n`, {
      mode: 0o600,
    });
    await chmod(/* turbopackIgnore: true */ path, 0o600).catch(() => {
      // Platforms without POSIX permissions (for example Windows) simply keep the default.
    });
  } catch {
    return {
      ok: false,
      code: "config_write_failed",
      message: "The local configuration file could not be written.",
    };
  }

  return { ok: true, metadata: await readProviderMetadata() };
}
