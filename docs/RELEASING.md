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

`package:check` consumes the existing build, packs the actual public package into an OS temporary directory with npm, validates metadata and contents, installs offline into a clean consumer, runs Node and Bun runtime smoke, and compiles a NodeNext TypeScript declaration consumer. It does not publish, run lifecycle scripts, or use network access.

No database, Docker, real AI, or real email service is required for the MVP library.

## Package contract job

The packed-package contract is now a required repository contract, not a future release-only check:

```text
existing dist
→ npm pack --ignore-scripts
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

The exact public package name is `precall`.

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

## Settled release decisions

The first public package decisions are settled: PreCall / `precall`, Apache-2.0, version 0.1.0, Node.js >=22.14.0, Bun >=1.3.14, and optional LangChain/Resend integrations. The one-time unscoped bootstrap `precall@0.1.0-bootstrap.0` has been published under the `bootstrap` dist-tag; final `precall@0.1.0` remains unpublished. npm also assigned `latest` to the bootstrap, which must be corrected before final release.

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
## Public release contract

The release target is **`precall` 0.1.0**, hosted by the `Okazakee/PreCall` repository and licensed Apache-2.0. The new unscoped bootstrap prerelease `precall@0.1.0-bootstrap.0` is published under the `bootstrap` dist-tag; final `precall@0.1.0` remains unpublished. npm's unintended `latest` assignment to the bootstrap must be corrected before final release. The historical scoped `@okazakee/precall@0.1.0-bootstrap.0` package is registry history only and must not be mutated. The package is ESM-only and declares Node.js >=22.14.0 and Bun >=1.3.14; development remains pinned to `bun@1.3.14`.

`package:check` uses npm's packing view and validates one candidate tarball containing `package.json`, `README.md`, `LICENSE`, and the complete generated `dist` runtime/declaration closure. It rejects source, tests, docs, scripts, `.github`, environment/secrets, temporary files, and media. It then installs that candidate into clean offline Node/Bun consumers and compiles NodeNext declarations for the root, `./langchain`, and `./resend` exports. Optional LangChain peers remain isolated, and the Resend subpath includes no Resend SDK.

Run `bun run release:check` for metadata, Apache-2.0 license, version, and optional tag checks. `bun run release:dry-run` builds and validates one npm-generated candidate, then invokes npm's actual dry-run publish command with an empty temporary npm user config and explicit public registry. It never authenticates, publishes, tags, or creates a GitHub Release.

The release workflow runs only for pushed `vX.Y.Z` tags. It asserts exact tag/package-version equality without bumping, runs all checks, inspects and dry-runs the same candidate, then publishes it with npm trusted publishing/OIDC (`id-token: write`, no `NPM_TOKEN`) and creates a notes-only GitHub Release. It uses immutable GitHub Action SHAs plus GitHub-hosted Node 22.22.0/npm 11.14.1 and pinned Bun 1.3.14. The npm `environment` still requires the trusted publisher to be configured in npm package settings; the pending unscoped bootstrap is separately authorized only under the `bootstrap` dist-tag.

## Hardened candidate and source contract

The release workflow checks out the pushed tag with full history, fetches both the tag and `origin/main`, and admits a candidate only when the tag commit, checked-out `HEAD`, and fetched `origin/main` are identical. Validation creates exactly one `candidate.tgz` and one canonical `release-manifest.json`; the manifest binds package identity, source (`tag`, `commit`, `mainCommit`), pinned toolchain versions, and candidate byte count/SHA-512. Publish downloads those two files, freshly checks out the tag, installs frozen dependencies, rechecks every binding and digest, then runs npm dry-run and exact publish without rebuilding or repacking.

The current npm bootstrap finding is concrete: npm `11.14.1` is an exact `devDependency` resolved in `bun.lock`, and the repository CLI is available at `node_modules/npm/bin/npm-cli.js` after `bun install --frozen-lockfile`. The workflow invokes that path through Node. It does not install npm into a temporary prefix, use a global npm install, or rely on a runner-provided npm version.

## Verified GitHub release controls

The repository owner configured these controls through GitHub's owner-controlled API:

- environment `npm` exists with custom tag deployment policy `v*.*.*`;
- environment secrets are not required;
- active `Protect release tags` ruleset targets `refs/tags/v*.*.*` and protects creation, update, and deletion, with the repository owner as the designated release-manager bypass actor;
- active `Protect main` ruleset targets `refs/heads/main`, blocks deletion and force updates, requires pull requests, one approval, latest-push approval, stale-review dismissal, and the `bootstrap` CI status check;
- environment `npm` has the repository owner as its required reviewer with self-review permitted because this is currently a single-maintainer repository; replace this with an independent release approver when available.

The npm trusted-publisher association cannot be verified from the repository and remains unconfigured. The bootstrap package exists under `bootstrap`; npm also assigned `latest` to it, so an authenticated owner must remove that unintended `latest` tag before final release setup continues. The historical scoped bootstrap must not be mutated.

Operator checklist before the final release:
- Correct the bootstrap dist-tags so `bootstrap` points to `0.1.0-bootstrap.0` and `latest` does not point to the bootstrap version.
- Configure and verify the npm trusted publisher for GitHub Actions, `Okazakee`, `PreCall`, `release.yml`, environment `npm`, with direct `npm publish` allowed and no token fallback.
- Verify the existing `npm` environment's tag-only policy and reviewer/self-review policy; add an independent reviewer when available.
- Review the exact tag and its source binding to `origin/main`; do not create a tag or publish from a local checkout.
- Trigger only the reviewed `v0.1.0` tag workflow for final `precall@0.1.0`, inspect candidate and manifest checks, and verify the OIDC publication result.

