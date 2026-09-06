import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createReleaseManifest, RELEASE_ARTIFACT_NAME, RELEASE_TOOLCHAIN } from "./release-manifest.ts";
import { readGitSourceBinding } from "./release-source.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

type PackageMetadata = { name?: unknown; version?: unknown };

function requiredOption(name: string): string {
  const index = process.argv.indexOf(name);
  const value = process.argv[index + 1];
  if (index < 0 || value === undefined || value.length === 0) throw new Error(`${name} requires a value`);
  return value;
}

export async function createManifest(tag: string, artifactPath: string, outputPath: string): Promise<void> {
  const metadata = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as PackageMetadata;
  if (typeof metadata.name !== "string" || typeof metadata.version !== "string") {
    throw new Error("package.json must contain name and version before creating a release manifest");
  }
  const artifact = await readFile(artifactPath);
  const manifest = createReleaseManifest({
    schemaVersion: 1,
    package: { name: metadata.name, version: metadata.version },
    source: readGitSourceBinding(tag),
    toolchain: RELEASE_TOOLCHAIN,
    artifact: {
      name: RELEASE_ARTIFACT_NAME,
      bytes: artifact.byteLength,
      sha512: createHash("sha512").update(artifact).digest("hex"),
    },
  });
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

if (import.meta.main) {
  await createManifest(requiredOption("--tag"), requiredOption("--artifact"), requiredOption("--output"));
}
