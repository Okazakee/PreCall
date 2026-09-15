import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RECIPES_DOCUMENT = join(REPOSITORY_ROOT, "docs", "RECIPES.md");
const WORK_ROOT = join(REPOSITORY_ROOT, "node_modules", ".cache", "precall-recipes");
const TYPESCRIPT_BIN = join(REPOSITORY_ROOT, "node_modules", ".bin", "tsc");
const TYPESCRIPT_BLOCK = /```ts\n([\s\S]*?)\n```/g;

/**
 * Configuration for the generated recipe project.
 *
 * Recipes import the published entrypoints by name so they stay copyable, and the compiler maps
 * those names onto this repository's source entrypoints. That keeps the check offline, independent
 * of `dist`, and still typed by the public API rather than by internal modules.
 */
const RECIPE_TSCONFIG = {
  compilerOptions: {
    target: "ES2022",
    module: "NodeNext",
    moduleResolution: "NodeNext",
    lib: ["ES2022", "DOM"],
    strict: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    noEmit: true,
    skipLibCheck: true,
    types: ["bun-types"],
    paths: {
      precall: [join(REPOSITORY_ROOT, "src", "index.ts")],
      "precall/langchain": [join(REPOSITORY_ROOT, "src", "langchain.ts")],
      "precall/resend": [join(REPOSITORY_ROOT, "src", "resend.ts")],
    },
  },
  include: ["*.ts"],
  exclude: [],
};

function extractTypescriptBlocks(document: string): string[] {
  const blocks: string[] = [];
  for (const match of document.matchAll(TYPESCRIPT_BLOCK)) {
    const source = match[1];
    if (source !== undefined) blocks.push(source);
  }
  return blocks;
}

function failureDetail(result: ReturnType<typeof spawnSync>): string {
  return [result.stdout, result.stderr, result.error?.message]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join("\n");
}

async function typecheckRecipes(blocks: readonly string[]): Promise<void> {
  await mkdir(WORK_ROOT, { recursive: true });
  const names = blocks.map((_, index) => `recipe-${String(index + 1).padStart(2, "0")}.ts`);
  try {
    for (const [index, block] of blocks.entries()) {
      const name = names[index];
      if (name === undefined) continue;
      await writeFile(join(WORK_ROOT, name), `${block}\n`);
    }
    await writeFile(
      join(WORK_ROOT, "tsconfig.json"),
      `${JSON.stringify(RECIPE_TSCONFIG, null, 2)}\n`,
    );
    const result = spawnSync(TYPESCRIPT_BIN, ["--project", WORK_ROOT], {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
    });
    if (result.error === undefined && result.status === 0) return;
    const mapping = names
      .map((name, index) => `docs/RECIPES.md TypeScript block ${index + 1} -> ${name}`)
      .join("\n");
    const detail = failureDetail(result);
    throw new Error(
      `recipe examples did not typecheck:\n${mapping}${detail.length > 0 ? `\n${detail}` : ""}`,
    );
  } finally {
    await rm(WORK_ROOT, { recursive: true, force: true });
  }
}

/**
 * Compile every TypeScript block in `docs/RECIPES.md` against the public API.
 *
 * The recipes are documentation, so they are only trustworthy while they still compile. This keeps
 * copyable snippets honest without committing a second copy of them as example source files.
 */
export async function checkRecipes(): Promise<number> {
  const document = await readFile(RECIPES_DOCUMENT, "utf8");
  const blocks = extractTypescriptBlocks(document);
  if (blocks.length === 0) {
    throw new Error("docs/RECIPES.md must contain at least one TypeScript block");
  }
  const incomplete = blocks.findIndex((block) => !block.includes("import "));
  if (incomplete !== -1) {
    throw new Error(
      `docs/RECIPES.md TypeScript block ${incomplete + 1} must be a complete module with imports`,
    );
  }
  await typecheckRecipes(blocks);
  return blocks.length;
}

if (import.meta.main) {
  const count = await checkRecipes();
  process.stdout.write(`Recipe examples compile against the public API (${count} blocks).\n`);
}
