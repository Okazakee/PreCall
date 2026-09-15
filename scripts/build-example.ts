import { rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXAMPLE_ROOT = join(REPOSITORY_ROOT, "examples", "nextjs");

async function run(command: readonly string[], cwd: string): Promise<void> {
  const child = Bun.spawn([...command], { cwd, stdio: ["inherit", "inherit", "inherit"] });
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed with exit code ${exitCode}`);
  }
}

/**
 * Build this repository's package and install the example that consumes it.
 *
 * The example depends on the package by path, so the library build has to exist before the
 * example is installed, and the example's `node_modules` is removed first: Bun materializes a
 * local directory dependency as files, so an existing install would keep the `dist` it was
 * created from instead of the one that was just built.
 *
 * This is also the install step a deployment platform needs, because `dist` is never committed.
 */
export async function prepareExample(): Promise<void> {
  await run(["bun", "run", "build"], REPOSITORY_ROOT);
  await rm(join(EXAMPLE_ROOT, "node_modules"), { recursive: true, force: true });
  await run(["bun", "install", "--frozen-lockfile"], EXAMPLE_ROOT);
}

/** Prepare the example and run its own test suite plus the production Next.js build. */
export async function buildExample(): Promise<void> {
  await prepareExample();
  await run(["bun", "run", "test"], EXAMPLE_ROOT);
  await run(["bun", "run", "build"], EXAMPLE_ROOT);
}

if (import.meta.main) {
  if (process.argv.includes("--prepare")) {
    await prepareExample();
    process.stdout.write("Next.js example dependencies prepared.\n");
  } else {
    await buildExample();
    process.stdout.write("Next.js example build passed.\n");
  }
}
