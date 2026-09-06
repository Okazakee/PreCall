import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertArtifactIntegrity, parseReleaseManifest, RELEASE_TOOLCHAIN } from "./release-manifest.ts";
import { assertSourceTagVersion, readGitSourceBinding, sourceBindingsEqual } from "./release-source.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
type PackageMetadata = { name?: unknown; version?: unknown };

function requiredOption(name: string): string {
  const index = process.argv.indexOf(name);
  const value = process.argv[index + 1];
  if (index < 0 || value === undefined || value.length === 0) throw new Error(`${name} requires a value`);
  return value;
}

export async function verifyReleaseManifest(
  tag: string,
  manifestPath: string,
  artifactPath: string,
): Promise<void> {
  const manifest = parseReleaseManifest(await readFile(manifestPath, "utf8"));
  const metadata = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as PackageMetadata;
  const artifactDirectory = dirname(manifestPath);
  const entries = (await readdir(artifactDirectory)).sort();
  const expectedEntries = ["candidate.tgz", "release-manifest.json"];
  if (entries.length !== expectedEntries.length || entries.some((entry, index) => entry !== expectedEntries[index])) {
    throw new Error("release artifact directory must contain only candidate.tgz and release-manifest.json");
  }
  if (basename(artifactPath) !== "candidate.tgz") {
    throw new Error("release artifact path must name candidate.tgz");
  }
  if (basename(manifestPath) !== "release-manifest.json") {
    throw new Error("release manifest path must name release-manifest.json");
  }
  if (resolve(dirname(artifactPath)) !== resolve(artifactDirectory)) {
    throw new Error("release artifact and manifest must be in the same directory");
  }
  if (manifest.package.name !== metadata.name || manifest.package.version !== metadata.version) {
    throw new Error("release manifest package identity does not match package.json");
  }
  if (
    manifest.toolchain.bun !== RELEASE_TOOLCHAIN.bun ||
    manifest.toolchain.node !== RELEASE_TOOLCHAIN.node ||
    manifest.toolchain.npm !== RELEASE_TOOLCHAIN.npm
  ) {
    throw new Error("release manifest toolchain does not match the pinned release toolchain");
  }
  assertSourceTagVersion(manifest.source, manifest.package.version);
  const source = readGitSourceBinding(tag);
  if (!sourceBindingsEqual(source, manifest.source)) {
    throw new Error("release manifest source does not match the freshly checked-out tag and origin/main");
  }
  assertArtifactIntegrity(manifest, await readFile(artifactPath));
  process.stdout.write("Release manifest, source identity, and artifact integrity passed.\n");
}

if (import.meta.main) {
  await verifyReleaseManifest(requiredOption("--tag"), requiredOption("--manifest"), requiredOption("--artifact"));
}
