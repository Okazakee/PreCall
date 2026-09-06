const SEMVER_TAG =
  /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;

/** Return the semver represented by a release tag, or null for malformed tags. */
export function parseReleaseTag(tag: string): string | null {
  const match = SEMVER_TAG.exec(tag);
  return match?.[0].slice(1) ?? null;
}

/** Verify an exact vX.Y.Z tag/package version pair. */
export function tagMatchesVersion(tag: string, version: string): boolean {
  return parseReleaseTag(tag) === version;
}

export function assertTagMatchesVersion(tag: string, version: string): void {
  const parsed = parseReleaseTag(tag);
  if (parsed === null) throw new Error(`release tag must be a valid semver tag (vX.Y.Z): ${tag}`);
  if (parsed !== version) {
    throw new Error(`release tag ${tag} does not match package version ${version}`);
  }
}
