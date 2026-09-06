import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertTagMatchesVersion } from "./check-release-tag.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_VERSION = "0.1.0";
const EXPECTED_NAME = "@okazakee/precall";
const EXPECTED_DESCRIPTION =
  "Provider-neutral TypeScript library for privacy-filtered service-intake pre-call briefs.";
const EXPECTED_KEYWORDS = ["precall", "service-intake", "intake", "ai", "typescript", "email"];
const EXPECTED_REPOSITORY = "git+https://github.com/Okazakee/PreCall.git";
const EXPECTED_BUGS = "https://github.com/Okazakee/PreCall/issues";
const EXPECTED_HOMEPAGE = "https://github.com/Okazakee/PreCall#readme";

type Metadata = Record<string, unknown>;

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readMetadata(): Metadata {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  } catch (error) {
    throw new Error("package.json is missing or invalid", { cause: error });
  }
  assert(
    typeof parsed === "object" && parsed !== null && !Array.isArray(parsed),
    "package.json must be an object",
  );
  return parsed as Metadata;
}

function validateMetadata(metadata: Metadata): void {
  assert(metadata.name === EXPECTED_NAME, `package name must be ${EXPECTED_NAME}`);
  assert(metadata.version === EXPECTED_VERSION, `package version must be ${EXPECTED_VERSION}`);
  assert(metadata.description === EXPECTED_DESCRIPTION, "package description is incorrect");
  assert(
    JSON.stringify(metadata.keywords) === JSON.stringify(EXPECTED_KEYWORDS),
    "package keywords are incorrect",
  );
  assert(metadata.private !== true, "package must not be private");
  assert(metadata.type === "module", "package must be ESM-only (type: module)");
  assert(metadata.license === "Apache-2.0", "package license must be Apache-2.0");
  assert(
    typeof metadata.repository === "object" && metadata.repository !== null,
    "repository metadata is missing",
  );
  const repository = metadata.repository as Metadata;
  assert(
    repository.type === "git" && repository.url === EXPECTED_REPOSITORY,
    "repository metadata is incorrect",
  );
  assert(typeof metadata.bugs === "object" && metadata.bugs !== null, "bugs metadata is missing");
  assert((metadata.bugs as Metadata).url === EXPECTED_BUGS, "bugs metadata is incorrect");
  assert(metadata.homepage === EXPECTED_HOMEPAGE, "homepage metadata is incorrect");
  assert(
    typeof metadata.engines === "object" && metadata.engines !== null,
    "runtime engines are missing",
  );
  const engines = metadata.engines as Metadata;
  assert(
    engines.node === ">=22.14.0" && engines.bun === ">=1.3.14",
    "runtime engines must declare Node >=22.14.0 and Bun >=1.3.14",
  );
  assert(
    JSON.stringify(metadata.publishConfig) ===
      JSON.stringify({ access: "public", registry: "https://registry.npmjs.org" }),
    "publishConfig must use public npm access and the npm registry",
  );
  assert(
    JSON.stringify(metadata.files) === JSON.stringify(["dist"]),
    "files must contain only dist",
  );
  const exportsMap = metadata.exports;
  assert(
    typeof exportsMap === "object" && exportsMap !== null && !Array.isArray(exportsMap),
    "exports are missing",
  );
  const exportKeys = Object.keys(exportsMap as Metadata);
  assert(
    exportKeys.length === 3 &&
      exportKeys.includes(".") &&
      exportKeys.includes("./langchain") &&
      exportKeys.includes("./resend"),
    "exports must contain only public entrypoints",
  );
}

function validateLicense(): void {
  const license = readFileSync(join(root, "LICENSE"), "utf8");
  assert(
    license.includes("Apache License\n                           Version 2.0, January 2004"),
    "LICENSE must be Apache-2.0",
  );
  assert(license.includes("END OF TERMS AND CONDITIONS"), "LICENSE is incomplete");
}

export function checkRelease(tag?: string): void {
  const metadata = readMetadata();
  validateMetadata(metadata);
  validateLicense();
  if (tag !== undefined) assertTagMatchesVersion(tag, String(metadata.version));
}

function cliTag(): string | undefined {
  const tagIndex = process.argv.indexOf("--tag");
  if (tagIndex >= 0) {
    const tag = process.argv[tagIndex + 1];
    if (tag === undefined) throw new Error("--tag requires a value");
    return tag;
  }
  return process.env.RELEASE_TAG;
}

if (import.meta.main) {
  checkRelease(cliTag());
  process.stdout.write("Release metadata and license contract passed.\n");
}
