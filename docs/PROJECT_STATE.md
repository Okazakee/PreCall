# Project State

**Last verified:** 2026-09-15

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
convenience flow, optional preliminary cost estimation, and the bounded custom analysis-section
seam are implemented in the current checkout. The server-side Next.js integration proof exists as
a repository example and is gated in CI.

`precall@0.2.0` was released on 2026-09-12 and carries preliminary cost estimation. The tag-only
release workflow validated the source binding, published the inspected candidate through npm
Trusted Publishing/OIDC, and created GitHub Release `v0.2.0`.

`precall@0.3.0` was released on 2026-09-15 and is the currently published release. It adds the
bounded custom analysis-section capability from Phase 18 on top of the `0.2.0` behavior; the
release contains no other behavior change. Tag `v0.3.0` resolves to release commit
`a12b6a1908b87e56a1ed21a480f8791ce59b7f69` on `main`. The tag-only release workflow run
`34988488632` succeeded: validation bound the candidate to the tag/`HEAD`/`origin/main` identity,
the publish job published the exact inspected candidate through npm Trusted Publishing/OIDC, and the
release job created GitHub Release `v0.3.0`.

`precall@0.3.1` is prepared but **not yet tagged or published**. It is a patch/DX release: it ships
the integration-recipe documentation and its compilation gate (PR #16) and the explicit
abuse-control boundary clarification (PR #17). It contains no intended runtime, public-API, or
dependency change. The release workflow, Trusted Publishing/OIDC path, and tag/main protection
assumptions are unchanged.

## Externally published release state

Verified against the public npm registry and GitHub on 2026-09-15:

- `precall` dist-tags: `latest` → `0.3.0`, `bootstrap` → `0.1.0-bootstrap.0`; the published versions
  are `0.1.0-bootstrap.0`, `0.1.0`, `0.2.0`, and `0.3.0`.
- Stable `precall@0.3.0` was published through npm Trusted Publishing (GitHub Actions/OIDC) from
  this repository's tag-only release workflow, with a signed provenance statement. Stable
  `precall@0.2.0` and `precall@0.1.0` were released the same way.
- GitHub Release `v0.3.0` exists and is the latest release; GitHub Release `v0.2.0` remains the
  previous stable release and GitHub Release `v0.1.0` remains the first stable release. The
  `v0.3.0` release is notes-only with no attached assets.
- The historical scoped name `@okazakee/precall` no longer resolves on the public registry. It is
  registry history only; do not recreate or mutate it.

Package identity, version, exports, license, runtime floors, and toolchain pins are readable from
`package.json` and `bun.lock` and are intentionally not repeated here.

## External state not represented in code

- Live provider verification has never been executed. `bun run live-ai:check` and
  `bun run live-email:check` require private credentials, remain explicit opt-ins, and are
  excluded from CI and `check`. Full live AI plus live email end-to-end has not been run.
- Publication depends on owner-controlled external settings. Verified on 2026-09-12: active
  rulesets `Protect main` (branch) and `Protect release tags` (tag); no classic branch
  protection; environment `npm` with a branch-policy protection rule and no manual reviewer
  requirement; and a release workflow that mints an OIDC token (`id-token: write`) inside that
  environment. Re-verify in the owning system before relying on any of it.
- The README shown on npm comes from the published tarball, so README changes reach npm only with
  a new release.
- This repository's implementation navigation cache is a local, regenerable, gitignored artifact;
  it is not part of any published artifact or contract.

## Unresolved decisions

- Modular analysis skills and richer pricing strategy configuration remain unsettled. Custom
  analysis sections are intentionally a narrow one-call enrichment and do not settle either
  broader architecture.

## Immediate next action

After the `0.3.1` release-preparation change is merged, tag that exact release-preparation merge
commit on `main` as `v0.3.1` and push the tag; the existing tag-only workflow then validates,
publishes, and creates the GitHub Release. Do not tag any other commit, because the workflow admits
a release only when the tag commit, the checked-out `HEAD`, and `origin/main` are identical. After
that, the next product capability is **not settled**: professional-specific pricing strategy
configuration beyond the implemented preliminary cost estimate and broader modular analysis/skills
remain candidates rather than committed work, and no configuration API for either is agreed. Future
pricing remains decision support rather than automatic quotation.
