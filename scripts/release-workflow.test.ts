import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL("..", import.meta.url)));
const workflow = readFileSync(join(root, ".github/workflows/release.yml"), "utf8");

function count(value: string, pattern: RegExp): number {
  return [...value.matchAll(pattern)].length;
}

test("release workflow binds both jobs to complete source history", () => {
  const githubRefName = "GITHUB_REF_NAME";
  expect(count(workflow, /fetch-depth:\s*0/gu)).toBe(2);
  expect(count(workflow, /refs\/heads\/main:refs\/remotes\/origin\/main/gu)).toBe(2);
  expect(count(workflow, /check-release-source\.ts --tag/gu)).toBe(2);
  expect(workflow).toContain(`refs/tags/\${${githubRefName}}:refs/tags/\${${githubRefName}}`);
});

test("release workflow uses the repository npm CLI without bootstrap installs", () => {
  expect(workflow).toContain("./node_modules/npm/bin/npm-cli.js");
  expect(workflow).not.toMatch(/npm\s+install/gu);
  expect(workflow).not.toContain("RUNNER_TEMP/npm-prefix");
  expect(workflow).not.toMatch(/npm\s+i\b/gu);
});

test("release workflow uploads and publishes only the inspected candidate", () => {
  expect(workflow).toContain("release-manifest.json");
  expect(workflow).toContain("candidate.tgz");
  expect(workflow).not.toContain("candidate.tgz.sha512");
  expect(workflow).toContain("verify-release-manifest.ts");
  expect(workflow).toContain('publish "$RUNNER_TEMP/release-artifact/candidate.tgz"');
  expect(count(workflow, /npm-cli\.js\s+pack/gu)).toBe(1);
});
