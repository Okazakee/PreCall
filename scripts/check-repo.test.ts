import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { checkRepository } from "./check-repo.ts";

const expectedScripts = [
  "format",
  "format:check",
  "lint",
  "lint:ci",
  "typecheck",
  "test",
  "test:watch",
  "test:coverage",
  "build",
  "package:check",
  "check",
  "check:repo",
  "live-ai:check",
];

const expectedFiles = [
  "biome.json",
  ".oxlintrc.json",
  "tsconfig.json",
  "tsdown.config.ts",
  "bun.lock",
  "src/index.ts",
  "src/precall.ts",
  "scripts/check-package.ts",
];

test("the repository satisfies its bootstrap contract", () => {
  const result = checkRepository();

  expect(result.ok).toBe(true);
  expect(result.errors).toEqual([]);
  expect(result.packageManager).toBe("bun@1.3.14");
  expect(result.isPrivate).toBe(true);
  expect(result.missingScripts).toEqual([]);
  expect(result.scripts).toHaveLength(expectedScripts.length);
  for (const scriptName of expectedScripts) {
    expect(result.scripts).toContain(scriptName);
  }
  expect(result.missingFiles).toEqual([]);

  for (const relativePath of expectedFiles) {
    expect(existsSync(join(result.root, relativePath))).toBe(true);
  }
});
