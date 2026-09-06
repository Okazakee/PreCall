import { spawnSync } from "node:child_process";
import { assertTagMatchesVersion, parseReleaseTag } from "./check-release-tag.ts";

export type SourceBinding = {
  tag: string;
  commit: string;
  mainCommit: string;
};

const COMMIT = /^[0-9a-f]{40}$/u;
const SOURCE_KEYS = ["tag", "commit", "mainCommit"] as const;

type RecordValue = Record<string, unknown>;

function assertExactKeys(value: RecordValue, keys: readonly string[], description: string): void {
  const actual = Object.keys(value);
  if (actual.length !== keys.length || keys.some((key) => !actual.includes(key))) {
    throw new Error(`${description} must contain exactly: ${keys.join(", ")}`);
  }
}

/** Validate the immutable source identity carried by a release manifest. */
export function assertSourceBinding(value: unknown): asserts value is SourceBinding {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("release source binding must be an object");
  }
  const record = value as RecordValue;
  assertExactKeys(record, SOURCE_KEYS, "release source binding");
  if (typeof record.tag !== "string" || parseReleaseTag(record.tag) === null) {
    throw new Error("release source tag must be a valid vX.Y.Z semver tag");
  }
  for (const [name, commit] of [
    ["commit", record.commit],
    ["mainCommit", record.mainCommit],
  ] as const) {
    if (typeof commit !== "string" || !COMMIT.test(commit)) {
      throw new Error(`release source ${name} must be a 40-character lowercase commit SHA`);
    }
  }
}

/** Return whether two already-validated source identities are exactly equal. */
export function sourceBindingsEqual(left: SourceBinding, right: SourceBinding): boolean {
  return (
    left.tag === right.tag && left.commit === right.commit && left.mainCommit === right.mainCommit
  );
}

/** Assert that a tag commit, checkout, and fetched main commit are one source identity. */
export function assertSourceCommits(source: SourceBinding): void {
  assertSourceBinding(source);
  if (source.commit !== source.mainCommit) {
    throw new Error(
      `release source is not main: tag commit ${source.commit} differs from origin/main ${source.mainCommit}`,
    );
  }
}

function git(cwd: string, ref: string): string {
  const result = spawnSync("git", ["rev-parse", ref], { cwd, encoding: "utf8" });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(`git rev-parse ${ref} failed`, { cause: result.error });
  }
  const value = result.stdout.trim();
  if (!COMMIT.test(value)) throw new Error(`git rev-parse ${ref} did not return a full commit SHA`);
  return value;
}

/** Read the tag, checked-out HEAD, and fetched origin/main identities from a checkout. */
export function readGitSourceBinding(tag: string, cwd = process.cwd()): SourceBinding {
  if (parseReleaseTag(tag) === null) throw new Error(`invalid release tag: ${tag}`);
  const source = {
    tag,
    commit: git(cwd, `refs/tags/${tag}^{commit}`),
    mainCommit: git(cwd, "refs/remotes/origin/main"),
  };
  const head = git(cwd, "HEAD");
  if (source.commit !== head) {
    throw new Error(
      `release tag ${tag} commit ${source.commit} differs from checked-out HEAD ${head}`,
    );
  }
  assertSourceCommits(source);
  return source;
}

export function assertSourceTagVersion(source: SourceBinding, version: string): void {
  assertSourceBinding(source);
  assertTagMatchesVersion(source.tag, version);
}
