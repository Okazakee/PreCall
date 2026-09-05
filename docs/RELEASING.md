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

## Optional AI integration package contract

The first built-in AI integration is optional and exported from `./langchain`. It uses direct `@langchain/core@1.2.9` model abstractions plus the `langsmith` trace-context boundary; consumers provide compatible optional peers and the concrete provider package/model instance. Neither peer is imported by the root entrypoint.

Packed-package verification must continue to prove:

- the root import and custom `AIAdapter`/`EmailTransport` flow work without optional provider packages;
- the explicit `./langchain` subpath imports with compatible `@langchain/core` and `langsmith` peers installed;
- Node and Bun runtime imports succeed;
- NodeNext TypeScript declarations compile;
- root and integration runtime/declaration files are present;
- source, tests, docs, temporary consumers, secrets, and media are absent.

The live AI harness is not part of `check`, CI, or package validation. It requires explicit opt-in and credentials and may never run during normal release validation.

## Optional Resend integration package contract

The first built-in email integration is optional and exported from `./resend`. It uses no Resend SDK dependency; consumers receive `createResendEmailTransport({ apiKey, from })` and retain the provider-neutral `EmailTransport` contract.

Packed-package verification must prove:

- the root consumer works without LangChain or Resend dependencies;
- `./langchain` works with its optional peers;
- `./resend` imports under Node, Bun, and NodeNext TypeScript;
- the tarball contains the Resend runtime/declaration entrypoints but no source, tests, docs, temporary files, secrets, or media;
- the Resend adapter uses the fixed official endpoint and does not expose arbitrary endpoint configuration.

`live-email:check` is excluded from `check`, CI, and package validation. It requires explicit opt-in and credentials and was not run as part of ordinary validation.
