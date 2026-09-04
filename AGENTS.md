# Guidance for coding agents

## Read first

- Inspect the existing work before editing. Preserve useful user changes and do not invent implementation that is not present.
- `docs/` is authoritative. Start with [`docs/README.md`](docs/README.md) for the map and status vocabulary.
- `docs/PRODUCT.md` has precedence for stable product principles. Newer explicit decisions and mutable project state in `docs/DECISIONS.md` and `docs/PROJECT_STATE.md` govern implementation reality. Do not treat deferred or speculative material as current requirements.
- Update the relevant mutable documentation when the repository's actual decisions or state changes. Do not duplicate the reference docs here.

## Bootstrap and tooling

- Keep the current deliverable as one private ESM package with `src/index.ts` as its sole root entry point; intake and AI-visible projection remain internal while the processing API is still being established.
- Use Bun for package management and tooling. Use Zod 4 for runtime validation.
- TypeScript is strict: retain `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `isolatedModules`; do not weaken compiler settings to make code pass.
- Do not couple the core to a framework, database, or provider without an explicit project decision. Avoid speculative abstractions, extra packages, and generic agent/plugin infrastructure.

## Behavioral and trust boundaries

- Preserve the authoritative raw submission separately from the privacy-filtered AI input. Field privacy must be deterministic; never send data to AI merely because it is convenient.
- Construct AI-visible data only from normalized fields by positive resolved `sendToAI` allowlisting; never filter the authoritative original object.
- AI-generated analysis must not enter trusted processing state unless it satisfies the canonical `AnalysisResultSchema`.
- Treat AI as optional enrichment. Preserve useful raw intake and explicit uncertainty when enrichment is unavailable; never manufacture certainty.
- Keep facts, inferences, assumptions, and unknowns distinguishable. Confidence must be explained qualitatively rather than presented as false precision.
- Treat submissions, field names/values, AI output, and researched content as untrusted data. Untrusted submission or research text must never become trusted instructions or configuration.

## Changes and verification

- Add deterministic behavioral tests with behavior changes. Ordinary tests should fake external boundaries (for example, AI and email adapters), not the core logic under test.
- Assert observable invariants, and never weaken tests or CI to accommodate an implementation.
- Keep presentation/delivery separate from the reusable structured result; do not make a destination or provider own analysis.

## Git safety

- Never use destructive Git operations, discard existing work, rewrite history, or commit unless explicitly requested.
