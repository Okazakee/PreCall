# Project State

**Last consolidated:** September 2026

This file is the mutable snapshot of the project's current technical/product state.

## Current phase

**Repository bootstrap complete; ready for intake implementation.**

The repository foundation is configured and verified. The next phase is the deterministic intake and normalization slice.

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

### Settled

- core owns a narrow `AIAdapter`;
- adapter receives only filtered analysis input;
- AI output remains untrusted until Zod validation;
- fake adapter is implemented/tested before real provider integration;
- no generic agent framework in core;
- no multi-provider fallback engine in MVP.

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

The project explicitly chose **not** to build these abstractions in v0:

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

These are not blockers for starting implementation:

- exact numeric validation limits;
- exact final Zod property names;
- exact metadata/version fields;
- exact minimum Node version;
- first real email provider/transport;
- whether Pi passes the spike;
- exact npm package name;
- permanent product/repository name;
- open-source license;
- exact release tooling beyond the settled flow;
- whether `process()` alone is sufficient initially or whether a convenience combined API is immediately useful.

## Immediate next action

Implement intake field definitions, source preservation, normalization, validation limits, privacy defaults, and deterministic intake tests. Then build the vertical slice with a fake AI adapter before integrating a real provider.
