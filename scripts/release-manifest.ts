import { createHash } from "node:crypto";

import { assertSourceBinding, type SourceBinding } from "./release-source.ts";

export const RELEASE_MANIFEST_NAME = "release-manifest.json" as const;
export const RELEASE_ARTIFACT_NAME = "candidate.tgz" as const;
export const RELEASE_TOOLCHAIN = {
  bun: "1.3.14",
  node: "22.22.0",
  npm: "11.14.1",
} as const;

export type ReleaseManifest = {
  schemaVersion: 1;
  package: { name: string; version: string };
  source: SourceBinding;
  toolchain: { bun: string; node: string; npm: string };
  artifact: { name: typeof RELEASE_ARTIFACT_NAME; bytes: number; sha512: string };
};

const MANIFEST_KEYS = ["schemaVersion", "package", "source", "toolchain", "artifact"] as const;
const PACKAGE_KEYS = ["name", "version"] as const;
const TOOLCHAIN_KEYS = ["bun", "node", "npm"] as const;
const ARTIFACT_KEYS = ["name", "bytes", "sha512"] as const;
const SHA512 = /^[0-9a-f]{128}$/u;

type JsonObject = { [key: string]: unknown };

function assertObject(value: unknown, description: string): asserts value is JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${description} must be an object`);
  }
}

function assertKeys(value: JsonObject, expected: readonly string[], description: string): void {
  const actual = Object.keys(value);
  if (actual.length !== expected.length || expected.some((key) => !actual.includes(key))) {
    throw new Error(`${description} must contain exactly: ${expected.join(", ")}`);
  }
}

function assertString(value: unknown, description: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`${description} must be non-empty`);
}

/** Validate and narrow the canonical release-manifest contract. */
export function assertReleaseManifest(value: unknown): asserts value is ReleaseManifest {
  assertObject(value, "release manifest");
  assertKeys(value, MANIFEST_KEYS, "release manifest");
  if (value.schemaVersion !== 1) throw new Error("release manifest schemaVersion must be 1");

  assertObject(value.package, "release manifest package");
  assertKeys(value.package, PACKAGE_KEYS, "release manifest package");
  assertString(value.package.name, "release manifest package.name");
  assertString(value.package.version, "release manifest package.version");

  assertSourceBinding(value.source);

  assertObject(value.toolchain, "release manifest toolchain");
  assertKeys(value.toolchain, TOOLCHAIN_KEYS, "release manifest toolchain");
  for (const key of TOOLCHAIN_KEYS)
    assertString(value.toolchain[key], `release manifest toolchain.${key}`);

  assertObject(value.artifact, "release manifest artifact");
  assertKeys(value.artifact, ARTIFACT_KEYS, "release manifest artifact");
  if (value.artifact.name !== RELEASE_ARTIFACT_NAME) {
    throw new Error(`release manifest artifact.name must be ${RELEASE_ARTIFACT_NAME}`);
  }
  if (
    typeof value.artifact.bytes !== "number" ||
    !Number.isSafeInteger(value.artifact.bytes) ||
    value.artifact.bytes < 0
  ) {
    throw new Error("release manifest artifact.bytes must be a non-negative safe integer");
  }
  if (typeof value.artifact.sha512 !== "string" || !SHA512.test(value.artifact.sha512)) {
    throw new Error(
      "release manifest artifact.sha512 must be 128 lowercase hexadecimal characters",
    );
  }
}

/** Verify that artifact bytes match the canonical size and SHA-512 in a manifest. */
export function assertArtifactIntegrity(manifest: ReleaseManifest, artifact: Uint8Array): void {
  assertReleaseManifest(manifest);
  const sha512 = createHash("sha512").update(artifact).digest("hex");
  if (artifact.byteLength !== manifest.artifact.bytes || sha512 !== manifest.artifact.sha512) {
    throw new Error("release artifact bytes or SHA-512 do not match release-manifest.json");
  }
}

export function createReleaseManifest(input: ReleaseManifest): ReleaseManifest {
  assertReleaseManifest(input);
  return input;
}

export function parseReleaseManifest(text: string): ReleaseManifest {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error("release manifest is not valid JSON", { cause: error });
  }
  assertReleaseManifest(value);
  return value;
}
