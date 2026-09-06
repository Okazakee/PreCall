import { describe, expect, test } from "bun:test";
import {
  assertTagMatchesVersion,
  parseReleaseTag,
  tagMatchesVersion,
} from "./check-release-tag.ts";

describe("release tag validation", () => {
  test("accepts an exact stable vX.Y.Z tag", () => {
    expect(parseReleaseTag("v0.1.0")).toBe("0.1.0");
    expect(tagMatchesVersion("v0.1.0", "0.1.0")).toBe(true);
    expect(() => assertTagMatchesVersion("v0.1.0", "0.1.0")).not.toThrow();
  });

  test("rejects mismatched package versions", () => {
    expect(tagMatchesVersion("v0.1.1", "0.1.0")).toBe(false);
    expect(() => assertTagMatchesVersion("v0.1.1", "0.1.0")).toThrow(
      "does not match package version",
    );
  });

  test("rejects malformed tags", () => {
    for (const tag of ["0.1.0", "v0.1", "v01.2.3", "v0.1.0+build space", "release-v0.1.0"]) {
      expect(parseReleaseTag(tag)).toBeNull();
      expect(() => assertTagMatchesVersion(tag, "0.1.0")).toThrow("valid semver tag");
    }
  });
});
