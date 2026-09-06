import { readFile } from "node:fs/promises";
import { parseReleaseManifest } from "./release-manifest.ts";
import { readGitSourceBinding, sourceBindingsEqual } from "./release-source.ts";

function requiredOption(name: string): string {
  const index = process.argv.indexOf(name);
  const value = process.argv[index + 1];
  if (index < 0 || value === undefined || value.length === 0)
    throw new Error(`${name} requires a value`);
  return value;
}

export async function checkReleaseSource(tag: string, manifestPath?: string): Promise<void> {
  const source = readGitSourceBinding(tag);
  if (manifestPath !== undefined) {
    const manifest = parseReleaseManifest(await readFile(manifestPath, "utf8"));
    if (!sourceBindingsEqual(source, manifest.source)) {
      throw new Error(
        "release manifest source does not match the tag, HEAD, and origin/main checkout",
      );
    }
  }
  process.stdout.write(
    `Release source binding passed: ${source.tag} ${source.commit} (origin/main ${source.mainCommit}).\n`,
  );
}

if (import.meta.main) {
  const tag = requiredOption("--tag");
  const manifestIndex = process.argv.indexOf("--manifest");
  await checkReleaseSource(tag, manifestIndex >= 0 ? requiredOption("--manifest") : undefined);
}
