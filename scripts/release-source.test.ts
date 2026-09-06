import { describe, expect, test } from "bun:test";
import {
  assertSourceBinding,
  assertSourceCommits,
  type SourceBinding,
  sourceBindingsEqual,
} from "./release-source.ts";

const commit = "a".repeat(40);
const otherCommit = "b".repeat(40);
const source: SourceBinding = { tag: "v0.1.0", commit, mainCommit: commit };

describe("release source binding", () => {
  test("accepts one exact tag, commit, and main identity", () => {
    expect(() => assertSourceBinding(source)).not.toThrow();
    expect(() => assertSourceCommits(source)).not.toThrow();
    expect(sourceBindingsEqual(source, { ...source })).toBe(true);
  });

  test("rejects a tag that is not semver or a partial commit", () => {
    expect(() => assertSourceBinding({ ...source, tag: "release" })).toThrow("valid vX.Y.Z");
    expect(() => assertSourceBinding({ ...source, commit: "a" })).toThrow("40-character");
  });

  test("rejects a tag commit that differs from fetched origin/main", () => {
    expect(() => assertSourceCommits({ ...source, mainCommit: otherCommit })).toThrow(
      "differs from origin/main",
    );
  });
});
