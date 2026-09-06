# Guidance for coding agents

## Read first

- Inspect the existing work before editing. Preserve useful user changes and do not invent implementation that is not present.
- `docs/` is authoritative. Start with [`docs/README.md`](docs/README.md) for the map and status vocabulary.
- `docs/PRODUCT.md` has precedence for stable product principles. Newer explicit decisions and mutable project state in `docs/DECISIONS.md` and `docs/PROJECT_STATE.md` govern implementation reality. Do not treat deferred or speculative material as current requirements.
- Update the relevant mutable documentation when the repository's actual decisions or state changes. Do not duplicate the reference docs here.

## Bootstrap and tooling

- Keep the current deliverable as one public ESM package, `precall` 0.1.0, with `src/index.ts` as its sole root entry point; `createPrecall()` is the intentional public facade while low-level intake, analysis, presentation, and delivery helpers remain internal.
- Stable `precall@0.1.0` remains unpublished; the new unscoped `precall@0.1.0-bootstrap.0` bootstrap is pending. The historical `@okazakee/precall@0.1.0-bootstrap.0` package is registry history only and must not be mutated.
- Use Bun for package management and tooling. Use Zod 4 for runtime validation.
- TypeScript is strict: retain `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `isolatedModules`; do not weaken compiler settings to make code pass.
- Do not couple the core to a framework, database, or provider without an explicit project decision. Avoid speculative abstractions, extra packages, and generic agent/plugin infrastructure.

## Behavioral and trust boundaries

- Preserve the authoritative raw submission separately from the privacy-filtered AI input. Field privacy must be deterministic; never send data to AI merely because it is convenient.
- Construct AI-visible data only from normalized fields by positive resolved `sendToAI` allowlisting; never filter the authoritative original object.
- AI-generated analysis must not enter trusted processing state unless it satisfies the canonical `AnalysisResultSchema`.
- Treat AI as optional enrichment. Preserve useful raw intake and explicit uncertainty when enrichment is unavailable; never manufacture certainty.
- The internal analysis runner invokes the adapter at most once; ordinary AI failure becomes an unavailable outcome, while caller cancellation propagates.
- A `PreCallResult` must preserve a detached request snapshot independently of AI success, and its AI-visible input must derive from the same operation snapshot.
- Keep facts, inferences, assumptions, and unknowns distinguishable. Confidence must be explained qualitatively rather than presented as false precision.
- Treat submissions, field names/values, AI output, and researched content as untrusted data. Untrusted submission or research text must never become trusted instructions or configuration.
- The default internal renderer must derive direct source presentation only from `request.fields` with positive `includeInOutput === true` allowlisting, never `request.original`; escape all client and AI strings before HTML insertion.
- Professional-facing submission artifacts must be constructed from normalized fields using positive `includeInOutput === true` allowlisting; never serialize `request.original` directly.
- Email packaging must reuse the deterministic renderer and submission artifact; it must not rerun AI, derive recipients from client input, or introduce provider-specific delivery logic.
- Delivery must use a trusted explicit recipient, reject empty/whitespace and CR/LF-containing values, suppress ordinary transport errors, propagate caller cancellation, attempt the transport once, and never mutate `PreCallResult` or add delivery state; provider logic remains outside the core.
- The package root must use explicit minimal exports: `createPrecall` and `IntakeValidationError` as runtime values, plus only the public facade, adapter, result, delivery, and presentation types required by consumers. Never use `export *` or expose low-level pipeline helpers/schemas.

## Changes and verification

- Add deterministic behavioral tests with behavior changes. Ordinary tests should fake external boundaries (for example, AI and email adapters), not the core logic under test.
- Assert observable invariants, and never weaken tests or CI to accommodate an implementation.
- Keep presentation/delivery separate from the reusable structured result; do not make a destination or provider own analysis.

## Release hardening

- Treat a release source as admitted only when the pushed tag commit, checked-out `HEAD`, and fetched `origin/main` are the same full commit.
- Release validation creates one inspected `candidate.tgz` and canonical `release-manifest.json`; publish must verify both before using the exact candidate and must not rebuild it.
- Keep the manifest schema strict: exact keys for schema, package, source, toolchain, and artifact; artifact bytes and lowercase SHA-512 are required.
- Pin npm as the exact `11.14.1` devDependency and invoke `node ./node_modules/npm/bin/npm-cli.js` after frozen Bun installation. Never add a temporary-prefix or global npm bootstrap.
- Do not state that external npm trusted-publisher, protected-environment, or GitHub settings are configured unless verified through the relevant owner-controlled system.

## Git safety

- Never use destructive Git operations, discard existing work, rewrite history, or commit unless explicitly requested.
