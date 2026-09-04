# Project State

**Last consolidated:** September 2026

This file is the mutable snapshot of the project's current technical/product state.

## Current phase

**Phase 3 — AI-visible input boundary complete; ready for the analysis schema.**

The repository now constructs a deterministic, privacy-filtered, detached AI-visible input from normalized intake. The next phase defines and validates the structured `AnalysisResult` schema.

## AI-visible input boundary

Implemented in the internal `src/analysis/input.ts` module:

- `AnalysisInput` contains only a `fields` array.
- `AnalysisInputField` contains `key`, `label`, `value`, and `description` when defined.
- Projection iterates `NormalizedSubmission.fields` in definition order and includes only fields with resolved `sendToAI === true`.
- `sensitive`, `sendToAI`, and `includeInOutput` never enter the AI-visible payload.
- `NormalizedSubmission.original` is never used as a projection source.
- Every permitted value is deeply detached, including nested arrays and null-prototype objects.
- An all-private submission produces `{ fields: [] }` without error.
- Permitted hostile-looking client text is preserved exactly as data; no prompt-injection sanitization is performed.

No AI adapter, provider SDK, prompt, model call, or analysis-result schema exists yet. The package root remains intentionally empty.

## Intake foundation

Implemented in the internal `src/intake/` module:

- `FieldDefinitionSchema` validates strict field definitions with inferred TypeScript types.
- `resolveFieldDefinition()` applies `sensitive: false`, `includeInOutput: true`, and `sendToAI: !sensitive` defaults while preserving explicit overrides.
- `normalizeSubmission()` accepts only JSON-like structured data, rejects undeclared fields and duplicate definitions, and permits configured-but-absent fields.
- `NormalizedSubmission.original` is a detached null-prototype snapshot of the structured input; it is not the original HTTP request bytes.
- Normalized fields follow field-definition order and carry resolved privacy metadata.
- Validation rejects accessors, runtime objects, cycles, sparse/augmented arrays, excessive nesting, and suspicious reflective structures.
- Initial limits are configurable and inclusive: 100 fields, 128 key code points, 256 label code points, 1,024 description code points, 65,536 UTF-8 JSON bytes per value, 262,144 UTF-8 JSON bytes per submission, and depth 8.
- Intake failures use stable `invalid_configuration`, `invalid_submission`, and `limit_exceeded` categories without embedding submitted values.

The intake symbols remain internal; the package root does not expose a premature public API.

## Repository bootstrap

Completed baseline:

- Bun 1.3.14 is pinned in `packageManager` and CI.
- Node v22.22.0 was the local secondary runtime during bootstrap verification.
- TypeScript 5.9.3, Zod 4.5.4, tsdown 0.15.12, Biome 2.5.12, and Oxlint 1.81.0 are installed through the Bun lockfile.
- Strict TypeScript, ESM packaging, declaration output, and a minimal `src/index.ts` entry are configured.
- Repository scripts cover formatting, linting, typechecking, tests, coverage, building, the repository contract, and aggregate checks.
- GitHub Actions CI runs frozen installation, the repository contract, non-mutating formatting and linting, typechecking, tests, and build on pull requests and pushes to `main`.

No product implementation, provider SDK, email transport, framework, database, or speculative module tree was added.

## Permanent name

Not selected.

Do not assume a permanent product, repository, or npm package name.

Working technical names such as `PreCallResult` may be used internally until naming is settled.

## Current product target

An open-source server-side library that accepts arbitrary service-intake submissions and produces structured internal pre-call briefs.

MVP focuses on:

- request understanding;
- facts versus inference;
- assumptions;
- unknowns;
- risks;
- discovery questions;
- cautious preliminary roadmap;
- confidence/uncertainty;
- source preservation;
- email delivery;
- no-AI fallback.

## Current MVP architecture

```text
submission
→ validate/normalize
→ privacy-filtered AI view
→ one AI analysis
→ Zod validation
→ PreCallResult
→ deterministic renderer
→ email transport
```

Fallback:

```text
AI fails / output invalid
→ analysis unavailable
→ raw fallback result
→ email may still proceed
```

## Current implementation stack

| Area | Current decision |
|---|---|
| Language | TypeScript |
| Package manager | Bun |
| Primary runtime | Bun |
| Server compatibility | Node-compatible |
| Framework | None in core |
| Validation | Zod 4 |
| Tests | `bun:test` |
| Typecheck | `tsc --noEmit` |
| Build/package | tsdown |
| Format | Biome |
| Lint | Biome + Oxlint |
| CI | GitHub Actions |
| Package verification | packed npm consumer tests |
| Storage | consumer-owned |
| Database | none in core |
| First destination | email |
| Research | deferred |
| Budget analysis | deferred |

## Runtime policy

Primary practical scenarios:

- Bun server;
- Node-compatible server;
- Next.js Server Actions / Route Handlers;
- serverless/server runtimes where dependencies permit.

Use Web-standard APIs where practical.

Edge portability is desirable, but not an MVP support claim.

## AI state

### Settled direction

- core will own a narrow `AIAdapter`;
- the adapter will receive only the already-filtered analysis input;
- AI output will remain untrusted until Zod validation;
- no generic agent framework belongs in core;
- no multi-provider fallback engine belongs in MVP.

### To validate

A small Pi-based provider/model layer is the leading first transport candidate.

The Pi spike must test:

- Bun;
- packed Node consumer;
- Next.js build;
- multiple providers;
- abort/timeout behavior;
- schema-validation flow;
- dependency impact;
- absence of Pi-specific public API leakage.

If Pi is awkward, use a direct provider adapter without changing core architecture.

## Email state

Settled behavior:

- deterministic renderer;
- HTML + plain-text direction;
- recipient from trusted application config;
- raw source attachment enabled by default;
- attachment based on output-permitted source data;
- `includeInOutput=false` excludes data from body and attachment;
- AI/client strings escaped;
- AI failure still produces a useful raw inquiry email;
- attachment failure should not necessarily destroy the email attempt.

## Security state

Settled responsibilities:

Core:

- prompt-injection-aware AI boundary;
- validation/limits;
- field privacy;
- safe default renderer;
- email header/attachment handling;
- AI cost/input boundaries.

Consumer application:

- CAPTCHA;
- IP throttling;
- CSRF/origin policy;
- form endpoint protection;
- persistence/database security;
- broader anti-spam perimeter.

Future research subsystem:

- SSRF;
- external-content prompt injection;
- source validation.

## Test baseline

Implement tests in the same change as behavior.

Initial important fixtures:

1. representative fitness-app inquiry;
2. very vague inquiry;
3. hostile prompt-injection inquiry.

Use fake external adapters in ordinary CI.

## CI baseline

Day-one quality:

```text
frozen Bun install
→ repo contract
→ lint/check
→ typecheck
→ unit/integration tests
→ build
```

After public API exists:

```text
pack npm artifact
→ clean consumer install
→ Bun smoke
→ Node smoke
```

Add Next.js server example/build smoke when that integration exists.

## Simplifications intentionally made

The project explicitly chose not to build these abstractions in v0:

- partial AI-result framework;
- provider capability matrix;
- multi-provider fallback graph;
- agent/session/tool loop;
- skills/plugin registry;
- generalized hooks/middleware;
- multiple packages;
- generic renderer/plugin system;
- broad Edge compatibility abstraction;
- configurable system prompts;
- retries/repair workflow without evidence.

## Unresolved decisions

These are not blockers for the current intake and projection phases:

- exact structured `AnalysisResult` schema and metadata;
- exact minimum Node version;
- first real email provider/transport;
- whether Pi passes the future provider spike;
- exact npm package name;
- permanent product/repository name;
- open-source license;
- exact release tooling beyond the settled flow;
- whether `process()` alone is sufficient initially or whether a convenience combined API is immediately useful.

## Immediate next action

Define and validate the structured `AnalysisResult` schema with representative, vague-request, and invalid-output fixtures.
