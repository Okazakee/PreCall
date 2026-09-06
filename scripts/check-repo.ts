import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkReleaseWorkflow } from "./check-release-workflow.ts";
export const EXPECTED_PACKAGE_MANAGER = "bun@1.3.14" as const;

export const REQUIRED_SCRIPTS = [
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
  "release:check",
  "release:dry-run",
  "check",
  "check:repo",
] as const;
export const REQUIRED_FILES = [
  "biome.json",
  ".oxlintrc.json",
  "tsconfig.json",
  "tsdown.config.ts",
  "bun.lock",
  "LICENSE",
  "README.md",
  "src/index.ts",
  "src/precall.ts",
  "scripts/check-package.ts",
  "scripts/check-release.ts",
  "scripts/check-release-tag.ts",
  "scripts/release-manifest.ts",
  "scripts/release-source.ts",
  "scripts/check-release-source.ts",
  "scripts/check-release-workflow.ts",
  "scripts/create-release-manifest.ts",
  "scripts/verify-release-manifest.ts",
  "scripts/release-dry-run.ts",
  ".github/workflows/release.yml",
] as const;
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

type PackageJson = {
  packageManager?: unknown;
  private?: unknown;
  scripts?: unknown;
};

export interface RepositoryCheckResult {
  ok: boolean;
  root: string;
  packageManager: string | null;
  isPrivate: boolean | null;
  scripts: string[];
  missingScripts: string[];
  missingFiles: string[];
  errors: string[];
}

/** Check the files and metadata needed for this repository's public package contract. */
export function checkRepository(rootDirectory: string = REPOSITORY_ROOT): RepositoryCheckResult {
  const root = resolve(rootDirectory);
  const errors: string[] = [];
  const packagePath = join(root, "package.json");
  let packageData: PackageJson | null = null;

  if (!existsSync(packagePath)) {
    errors.push("package.json is missing");
  } else {
    try {
      const parsed: unknown = JSON.parse(readFileSync(packagePath, "utf8"));
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        errors.push("package.json must contain a JSON object");
      } else {
        packageData = parsed as PackageJson;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`package.json is not valid JSON: ${message}`);
    }
  }

  const packageManager =
    typeof packageData?.packageManager === "string" ? packageData.packageManager : null;
  if (packageManager !== EXPECTED_PACKAGE_MANAGER) {
    errors.push(`packageManager must be exactly ${EXPECTED_PACKAGE_MANAGER}`);
  }

  const isPrivate =
    packageData?.private === undefined
      ? false
      : typeof packageData.private === "boolean"
        ? packageData.private
        : null;
  if (isPrivate !== false) errors.push("package.json must not be private");

  const packageScripts = packageData?.scripts;
  const scriptsObject =
    packageScripts && typeof packageScripts === "object" && !Array.isArray(packageScripts)
      ? (packageScripts as Record<string, unknown>)
      : null;
  const scripts = scriptsObject === null ? [] : Object.keys(scriptsObject);
  const missingScripts = REQUIRED_SCRIPTS.filter(
    (name) => typeof scriptsObject?.[name] !== "string" || scriptsObject[name].trim() === "",
  );
  if (scriptsObject === null) errors.push("package.json must define a scripts object");
  else if (missingScripts.length > 0)
    errors.push(`package.json is missing required scripts: ${missingScripts.join(", ")}`);

  const missingFiles = REQUIRED_FILES.filter(
    (relativePath) => !existsSync(join(root, relativePath)),
  );
  if (missingFiles.length > 0) {
    errors.push(`required files are missing: ${missingFiles.join(", ")}`);
  }

  try {
    checkReleaseWorkflow(root);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`release workflow contract failed: ${message}`);
  }

  return {
    ok: errors.length === 0,
    root,
    packageManager,
    isPrivate,
    scripts,
    missingScripts,
    missingFiles,
    errors,
  };
}

function runCli(): void {
  const result = checkRepository();
  if (result.ok) {
    process.stdout.write("Repository contract passed.\n");
    return;
  }

  console.error("Repository contract failed:");
  for (const error of result.errors) console.error(`- ${error}`);
  process.exitCode = 1;
}

if (import.meta.main) runCli();
