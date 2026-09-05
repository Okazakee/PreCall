# CI, Packaging, and Releasing

## Tooling baseline

Current engineering baseline:

- TypeScript;
- Bun package manager/runtime;
- `bun:test`;
- `tsc --noEmit`;
- tsdown;
- Biome;
- Oxlint;
- GitHub Actions;
- packed npm artifact verification.

## Development reproducibility

Pin the Bun development version in project metadata rather than using `latest` in CI.

Conceptually:

```json
{
  "packageManager": "bun@<pinned-version>"
}
```

The supported runtime policy may be broader than the exact development version.

## Local quality commands

The repository should expose predictable commands for:

- formatting;
- non-mutating format/check;
- lint;
- non-mutating CI lint;
- typecheck;
- tests;
- build;
- combined `check`.

Mutating local commands and read-only CI commands should remain separate.

CI must not silently rewrite source.

## First CI workflow

Run on:

- pull requests;
- pushes to the main branch.

Use concurrency cancellation for obsolete runs where appropriate.

### Quality job

The current CI flow is:

```text
checkout
→ setup pinned Bun
→ bun install --frozen-lockfile
→ repository contract check
→ format check
→ lint
→ typecheck
→ bun test
→ build
→ setup Node 22.22.0
→ package:check
```

`package:check` consumes the existing build, packs the actual private package into an OS temporary directory, validates metadata and contents, installs offline into a clean consumer, runs Node and Bun runtime smoke, and compiles a NodeNext TypeScript declaration consumer. It does not publish, run lifecycle scripts, or use network access.

No database, Docker, real AI, or real email service is required for the MVP library.

## Package contract job

The packed package is now a required repository contract, not a future release-only check:

```text
existing dist
→ bun pm pack --ignore-scripts
→ inspect tarball and export metadata
→ offline clean-consumer install
→ Node + Bun public API smoke
→ NodeNext declaration smoke
```

This proves what consumers install, not only the source checkout.

## Runtime smoke

Initial packed-consumer runtime checks:

- Bun;
- Node.

Add:

- Next.js server example/build smoke

once the example exists.

Edge testing is added only when Edge compatibility becomes an actual claim.

## Reference-project practices being adopted

From Blurkit:

- test packed artifacts;
- clean-consumer runtime checks;
- release revalidation;
- tag/version verification before publish.

From MinePanel:

- frozen Bun installs;
- pinned development runtime;
- explicit repository/script contracts;
- tests alongside implementation;
- deterministic external-boundary fakes;
- CI as a first-class repository contract.

Not copied:

- MinePanel's Nest/Postgres/Docker architecture;
- database migration CI;
- Docker-image publishing/scanning;
- project-specific anti-slop rules;
- any infrastructure not relevant to this library.

## Release workflow

Create the release workflow before the first npm publication, not necessarily before the package name/license/registry details exist.

Preferred trigger:

```text
tag vX.Y.Z
```

Release flow:

```text
validate semver tag
→ verify package version matches tag
→ fresh frozen install
→ lint
→ typecheck
→ tests
→ build
→ package validation
→ runtime smoke
→ npm publish
→ GitHub Release
```

A green prior main-branch CI run is evidence, not authorization to skip release validation.

## Publishing

Preferred direction:

- npm;
- trusted publishing / OIDC where supported;
- avoid long-lived publish tokens when possible.

Exact npm package name is not settled.

## Versioning

Use normal semantic versioning.

Before first stable release, breaking changes are expected but should still be documented clearly.

## Git conventions

Conventional Commits are a good default direction, especially if automated changelog/release tooling later benefits from them.

Do not add complex release automation until the package actually needs it.

## Supply-chain posture

Keep dependencies deliberate.

Every dependency should justify:

- what problem it solves;
- runtime impact;
- maintenance burden;
- bundle implications;
- compatibility implications.

Provider SDKs and runtime-specific transports should not automatically contaminate the core import graph.

## Release blockers not yet settled

Before first public publish, explicitly settle:

- permanent product/package name;
- npm package name;
- open-source license;
- repository URL;
- minimum supported Node version;
- exact Bun support policy;
- first real AI transport;
- first real email transport.
