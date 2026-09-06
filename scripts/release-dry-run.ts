import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function run(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): string {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    env: options.env,
  });
  if (result.error !== undefined || result.status !== 0) {
    const detail = [result.stdout, result.stderr, result.error?.message]
      .filter((value): value is string => value !== undefined && value.length > 0)
      .join("\n");
    throw new Error(`${command} ${args.join(" ")} failed${detail ? `:\n${detail}` : ""}`);
  }
  return result.stdout;
}

async function releaseDryRun(): Promise<void> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "precall-release-dry-run-"));
  const temporaryHome = join(temporaryRoot, "home");
  const temporaryCwd = join(temporaryRoot, "cwd");
  const npmUserConfig = join(temporaryRoot, "user.npmrc");
  const npmGlobalConfig = join(temporaryRoot, "global.npmrc");
  const packDirectory = join(temporaryRoot, "pack");
  try {
    await Promise.all([
      mkdir(temporaryHome),
      mkdir(temporaryCwd),
      mkdir(packDirectory),
      writeFile(npmUserConfig, ""),
      writeFile(npmGlobalConfig, ""),
    ]);
    const npmEnv: NodeJS.ProcessEnv = {
      HOME: temporaryHome,
      NPM_CONFIG_USERCONFIG: npmUserConfig,
      NPM_CONFIG_GLOBALCONFIG: npmGlobalConfig,
      NPM_CONFIG_REGISTRY: "https://registry.npmjs.org",
    };
    if (process.env.PATH !== undefined) npmEnv.PATH = process.env.PATH;
    run("bun", ["run", "release:check"]);
    run("bun", ["run", "build"]);
    const output = run(
      "npm",
      ["pack", root, "--ignore-scripts", "--json", "--pack-destination", packDirectory],
      { cwd: temporaryCwd, env: npmEnv },
    );
    const packed = JSON.parse(output) as Array<{ filename?: unknown }>;
    if (packed.length !== 1 || typeof packed[0]?.filename !== "string") {
      throw new Error("npm pack must produce exactly one candidate tarball");
    }
    const tarball = resolve(packDirectory, packed[0].filename);
    await readFile(tarball);
    run("bun", ["scripts/check-package.ts", tarball]);
    run(
      "npm",
      [
        "publish",
        tarball,
        "--dry-run",
        "--ignore-scripts",
        "--access",
        "public",
        "--provenance",
        "--registry",
        "https://registry.npmjs.org",
      ],
      { cwd: temporaryCwd, env: npmEnv },
    );
    process.stdout.write("npm publish dry-run passed; no package was published.\n");
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

if (import.meta.main) await releaseDryRun();

export { releaseDryRun };
