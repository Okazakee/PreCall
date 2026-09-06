import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertArchive } from "./check-package.ts";

const root = resolve(join(fileURLToPath(import.meta.url), "../.."));

test("rejects an unexpected npm archive entry", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "precall-package-archive-test-"));
  const packageRoot = join(temporaryRoot, "package");
  const archive = join(temporaryRoot, "unexpected.tgz");
  try {
    await mkdir(join(packageRoot, "dist"), { recursive: true });
    await Promise.all(
      ["package.json", "README.md", "LICENSE"].map((file) =>
        cp(join(root, file), join(packageRoot, file)),
      ),
    );
    const distEntries = await readdir(join(root, "dist"));
    await Promise.all(
      distEntries.map((file) => cp(join(root, "dist", file), join(packageRoot, "dist", file))),
    );
    await writeFile(join(packageRoot, ".npmrc"), "registry=https://evil.example\n");

    execFileSync("tar", [
      "-czf",
      archive,
      "--no-recursion",
      "-C",
      temporaryRoot,
      "package/package.json",
      "package/README.md",
      "package/LICENSE",
      ...distEntries.map((file) => `package/dist/${file}`),
      "package/.npmrc",
    ]);

    expect(() => assertArchive(archive, distEntries)).toThrow("unexpected entries");
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
