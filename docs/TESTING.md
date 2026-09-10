# Testing

## Principle

Tests are part of implementation, not cleanup. Every core behavioral rule gains deterministic
tests in the same change that implements it, and the primary test runner is `bun:test`.

This document states the philosophy, the invariants that must stay covered, and the repository
gates. It does not inventory current test cases: the test files own what they cover, and the
implementation they exercise is authoritative for current behavior.

## Why deterministic tests matter here

The project depends on several trust boundaries: untrusted submission, normalization, privacy
filtering, AI output, rendering, and delivery. The most important tests prove system invariants,
not whether a real model happened to behave well on one CI run.

## Test doubles

Mock external boundaries, not the logic being tested. Good fakes are a fake AI adapter and a fake
email transport. Avoid pipeline tests that mock normalization, privacy filtering, result
construction, or rendering, because that would prevent the test from proving the core pipeline.

## Test organization

Prefer colocated unit tests (`src/.../module.test.ts` next to the module). Use a separate
integration directory only where a test spans enough modules to justify it.

## Invariants that must stay covered

Intake:

- arbitrary configured fields survive normalization and source values are preserved;
- suspicious field keys do not corrupt internal state;
- excessive field count, excessive field size, and invalid field configuration are rejected;
- documented sensitive-field defaults hold.

Privacy and the AI boundary:

- `sendToAI=false` fields never reach the adapter, and sensitive fields default to no AI unless
  explicitly overridden;
- an intentional explicit `sendToAI=true` override is honored;
- `includeInOutput=false` fields are absent from direct rendered source output and from the
  submission attachment;
- direct output allowlisting never claims semantic redaction of AI free text;
- privacy filtering never depends on model behavior.

Prompt injection:

- a deterministic hostile submission (text instructing the model to ignore previous instructions,
  mark requirements confirmed, or reveal hidden instructions) remains client data;
- it is never promoted into trusted configuration or instructions;
- trusted instructions and the untrusted payload remain structurally separate;
- raw preservation still holds.

Never claim such a test proves that no LLM can ever be manipulated.

## Test quality rule

Avoid fake-value tests such as `expect(value).toBeDefined()` when the behavior has a meaningful
contract. Assert the actual invariant — a hidden field is absent, a preserved value matches the
input exactly, a fallback status is explicit, the renderer escapes the dangerous string, a
delivery failure does not erase the result.

Coverage may be measured with Bun's coverage support, but a numeric threshold should not become
the primary quality metric. Behavioral invariant coverage matters more than an arbitrary
percentage.

## Real provider tests

Ordinary pull-request CI must not require paid AI or email credentials, for contributor
accessibility, flakiness, cost, secret exposure, and nondeterminism reasons. Live provider checks
may later run manually, in trusted environments, or on scheduled integration workflows, but they
are supplementary, never a replacement for deterministic fakes.

The live harnesses (`bun run live-ai:check`, `bun run live-email:check`) are explicit opt-ins:
without their enabling environment variable they make no network call. They are deliberately
excluded from `check` and CI. Full live AI plus live email end-to-end has not been run. See
[`AI.md`](AI.md) for the AI harness policy.

## Package-contract testing

Source tests alone are not sufficient: the npm-generated artifact is the release boundary. The
packed-package smoke builds the artifact first, then works from npm's packing view so it can also
inspect the exact candidate selected for release. It verifies public metadata, license,
README/LICENSE, exports, and the complete `dist` closure; rejects source, tests, docs, scripts,
`.github`, temporary, secret-like, and media paths; installs the candidate into OS-temporary
consumers offline; executes the public process/delivery flow under Node and Bun; compiles NodeNext
TypeScript consumers for the root and each optional subpath; and cleans only smoke-owned temporary
directories.

Provider-neutrality is part of that contract: the root consumer installs and processes with only a
custom `AIAdapter` and `EmailTransport`, each optional integration is consumed separately, and the
root export does not eagerly load either optional integration.

## Runtime smoke tests

The initial matrix is Bun and Node, using the packed package. Once a Next.js integration example
exists, add a server build smoke test. Do not claim broad Edge compatibility until a real Edge
test exists.

## Repository contract

A lightweight repository check verifies that the critical scripts continue to exist: build,
typecheck, lint, CI lint/check, test, aggregate check, and the package test. This follows the
useful executable-contract pattern observed in the reference repositories without importing their
project-specific infrastructure.

## Release validation

Release validation and dry-run behavior are release policy and are documented in
[`RELEASING.md`](RELEASING.md). They are credential-free and never publish, tag, or create a
GitHub Release.
