import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const WORKFLOW_PATH = ".github/workflows/release.yml";

function occurrences(value: string, pattern: RegExp): number {
  return [...value.matchAll(pattern)].length;
}

/** Assert release workflow behavior without pinning its full YAML formatting. */
export function assertReleaseWorkflow(workflow: string): void {
  if (occurrences(workflow, /fetch-depth:\s*0/gu) !== 2) {
    throw new Error("release workflow must use full-history checkout in validation and publish");
  }
  if (occurrences(workflow, /refs\/heads\/main:refs\/remotes\/origin\/main/gu) !== 2) {
    throw new Error("release workflow must fetch origin/main in validation and publish");
  }
  if (occurrences(workflow, /check-release-source\.ts --tag/gu) !== 2) {
    throw new Error("release workflow must check source identity in validation and publish");
  }
  if (!workflow.includes("release-manifest.json") || !workflow.includes("candidate.tgz")) {
    throw new Error("release workflow must carry candidate.tgz and release-manifest.json");
  }
  if (!workflow.includes("./node_modules/npm/bin/npm-cli.js") || /npm\s+install/gu.test(workflow)) {
    throw new Error("release workflow must use the repository npm CLI without npm installation");
  }
  if (workflow.includes("RUNNER_TEMP/npm-prefix") || /npm\s+i\b/gu.test(workflow)) {
    throw new Error("release workflow must not use a temporary or global npm bootstrap");
  }
  if (workflow.includes("candidate.tgz.sha512") || occurrences(workflow, /npm-cli\.js\s+pack/gu) !== 1) {
    throw new Error("release workflow must pack exactly one candidate and upload the canonical manifest");
  }
  if (!workflow.includes("verify-release-manifest.ts")) {
    throw new Error("release workflow must verify manifest and artifact identity before publish");
  }
}

export function checkReleaseWorkflow(rootDirectory: string): void {
  assertReleaseWorkflow(readFileSync(join(resolve(rootDirectory), WORKFLOW_PATH), "utf8"));
}

if (import.meta.main) {
  checkReleaseWorkflow(resolve(import.meta.dir, ".."));
  process.stdout.write("Release workflow contract passed.\n");
}
