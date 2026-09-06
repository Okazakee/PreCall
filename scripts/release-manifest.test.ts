import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  assertArtifactIntegrity,
  assertReleaseManifest,
  parseReleaseManifest,
  type ReleaseManifest,
} from "./release-manifest.ts";

const manifest: ReleaseManifest = {
  schemaVersion: 1,
  package: { name: "@okazakee/precall", version: "0.1.0" },
  source: { tag: "v0.1.0", commit: "a".repeat(40), mainCommit: "a".repeat(40) },
  toolchain: { bun: "1.3.14", node: "22.22.0", npm: "11.14.1" },
  artifact: { name: "candidate.tgz", bytes: 17, sha512: "a".repeat(128) },
};

describe("release manifest", () => {
  test("accepts and narrows the canonical manifest", () => {
    expect(() => assertReleaseManifest(manifest)).not.toThrow();
    expect(parseReleaseManifest(`${JSON.stringify(manifest)}\n`)).toEqual(manifest);
  });

  test("rejects extra top-level or nested keys", () => {
    expect(() => assertReleaseManifest({ ...manifest, extra: true })).toThrow("exactly");
    expect(() =>
      assertReleaseManifest({ ...manifest, artifact: { ...manifest.artifact, extra: true } }),
    ).toThrow("exactly");
  });

  test("rejects wrong artifact identity, size, and hash encoding", () => {
    expect(() =>
      assertReleaseManifest({ ...manifest, artifact: { ...manifest.artifact, name: "other.tgz" } }),
    ).toThrow("artifact.name");
    expect(() =>
      assertReleaseManifest({ ...manifest, artifact: { ...manifest.artifact, bytes: -1 } }),
    ).toThrow("non-negative");
    expect(() =>
      assertReleaseManifest({
        ...manifest,
        artifact: { ...manifest.artifact, sha512: "A".repeat(128) },
      }),
    ).toThrow("lowercase hexadecimal");
  });

  test("rejects a candidate whose bytes or digest differs from the manifest", () => {
    const artifact = Buffer.from("candidate", "utf8");
    const checked = {
      ...manifest,
      artifact: {
        name: manifest.artifact.name,
        bytes: artifact.byteLength,
        sha512: createHash("sha512").update(artifact).digest("hex"),
      },
    } satisfies ReleaseManifest;
    expect(() => assertArtifactIntegrity(checked, artifact)).not.toThrow();
    expect(() => assertArtifactIntegrity(checked, Buffer.from("tampered", "utf8"))).toThrow(
      "bytes or SHA-512",
    );
  });
});
