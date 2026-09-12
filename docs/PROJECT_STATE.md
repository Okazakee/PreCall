# Project State

**Last verified:** 2026-09-10

This file is deliberately small. It records only mutable state that cannot be derived reliably
from the working tree: external release state, external configuration, unresolved decisions, and
the immediate next action.

Everything else has a better owner:

- current implementation facts (APIs, modules, schemas, tests, package structure, toolchain pins)
  come from source, tests, and config, navigated with the Graft graph;
- product intent, decisions, boundaries, and contracts come from the reference documents listed
  in [`README.md`](README.md).

## Current milestone

PreCall is past its first public release. Intake and normalization, privacy filtering, the
structured analysis contract, deterministic presentation, submission attachment, email
packaging, provider-neutral delivery, the configured `createPrecall()` facade, the `submit()`
convenience flow, and optional preliminary cost estimation are implemented. The server-side
Next.js integration proof exists as a repository example and is gated in CI. Preliminary cost
estimation is not part of a published release yet.

## Externally published release state

Verified against the public npm registry and GitHub on 2026-09-10:

- `precall` dist-tags: `latest` → `0.1.0`, `bootstrap` → `0.1.0-bootstrap.0`.
- Stable `precall@0.1.0` was published through npm Trusted Publishing (GitHub Actions/OIDC) from
  this repository's release workflow.
- GitHub Release `v0.1.0` exists and is the latest release.
- The historical scoped name `@okazakee/precall` no longer resolves on the public registry. It is
  registry history only; do not recreate or mutate it.

Package identity, version, exports, license, runtime floors, and toolchain pins are readable from
`package.json` and `bun.lock` and are intentionally not repeated here.

## External state not represented in code

- Live provider verification has never been executed. `bun run live-ai:check` and
  `bun run live-email:check` require private credentials, remain explicit opt-ins, and are
  excluded from CI and `check`. Full live AI plus live email end-to-end has not been run.
- Publication depends on owner-controlled external settings. Verified on 2026-09-10: active
  rulesets `Protect main` (branch) and `Protect release tags` (tag); no classic branch
  protection; environment `npm` with a branch-policy protection rule and no manual reviewer
  requirement; and a release workflow that mints an OIDC token (`id-token: write`) inside that
  environment. Re-verify in the owning system before relying on any of it.
- The README shown on npm comes from the published tarball, so README changes reach npm only with
  a new release.
- This repository's implementation navigation cache is a local, regenerable, gitignored artifact;
  it is not part of any published artifact or contract.

## Unresolved decisions

- Modular analysis skills and richer pricing strategy configuration remain unsettled. Preliminary
  cost estimation is implemented, but any future pricing extension must remain decision support
  rather than automatic quotation.

## Immediate next action

Include the implemented preliminary cost estimation in a future semver release (the npm README
comes from the published tarball, so README changes reach npm only with a release). After that,
choose whether to pursue modular analysis skills or richer pricing strategy configuration;
neither configuration API is settled.
