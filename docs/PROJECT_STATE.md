# Project State

**Last consolidated:** September 2026

This file is the mutable snapshot of the project's current technical/product state.

## Current phase

**Phase 15 — Stable release and default-flow clarity complete.**

The stable `precall@0.1.0` package is published and is the `latest` release. The unscoped `precall@0.1.0-bootstrap.0` remains historical release history under `bootstrap`. npm Trusted Publishing through GitHub Actions/OIDC works for the release workflow, and the stable GitHub Release `v0.1.0` exists. The repository now also has a thin `submit()` convenience facade for the normal process-and-deliver path.

## Deterministic default renderer

Implemented in the internal `src/presentation/render.ts` module:

- `RenderedBrief` contains exactly `{ html: string; text: string }`;
- `renderPreCallResult()` is synchronous, pure, deterministic, and does not call AI or perform I/O;
- successful results render a fixed internal brief sequence in HTML and plain text;
- unavailable analysis renders a safe reason-specific fallback while preserving permitted source presentation;
- optional empty analysis sections are omitted;
- direct source presentation positively allowlists only normalized fields with `includeInOutput === true` in normalized order;
- HTML escapes client and AI strings, including structured source values, before newline handling;
- the renderer never directly renders `request.original` and does not expose provenance or policy metadata.

`includeInOutput=false` guarantees direct omission from the renderer and attachment source projections. If that field was deliberately sent to AI, free-form AI analysis may still contain derived information; strong non-disclosure requires excluding the field from AI input upstream.

The internal email transport and delivery orchestration remain provider-neutral. The package root now intentionally exports the public facade, canonical intake error, and only the types required to configure or implement supported extension points. Optional `./langchain` and `./resend` integrations remain separate package surfaces.

## Output-permitted submission attachment

Implemented in the internal `src/presentation/attachment.ts` module:

- `SubmissionAttachment` contains `filename`, `contentType`, and UTF-8 `bytes`;
- `createSubmissionAttachment()` is synchronous, pure, deterministic, and I/O-free;
- filename is fixed as `submission.json`;
- content type is fixed as `application/json`;
- payload contains only normalized field keys and values where `includeInOutput === true`;
- normalized field order is preserved, including array-index-looking keys;
- nested JSON-like values serialize as standard JSON;
- all-private output produces the valid `{}` artifact with a trailing newline;
- `-0` follows standard JSON serialization and becomes `0`;
- no analysis, policy metadata, labels, descriptions, or `request.original` enter the artifact.

## Deterministic email packaging

Implemented in the internal `src/presentation/email.ts` module:

- `EmailPackagingOptions` contains only optional `attachRawSubmission`;
- `RenderedEmail` contains exactly `subject`, `html`, `text`, and `attachments`;
- `createRenderedEmail()` is synchronous, pure, deterministic, non-mutating, and I/O-free;
- subject is fixed as `Pre-Call Brief` with no untrusted interpolation;
- HTML and text come directly from one `renderPreCallResult()` invocation;
- attachment inclusion defaults on and reuses `createSubmissionAttachment()`;
- `attachRawSubmission=false` returns a fresh empty attachment array without creating an attachment;
- enabled packaging includes exactly one `submission.json` artifact, including the established `{}` output for all-private fields;
- no recipient, addressing, headers, provider, or delivery state exists in the package.

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

The internal adapter, deterministic prompt, and analysis execution boundary are implemented. The package root remains provider-neutral; LangChain is available only through the optional `./langchain` subpath.

## AnalysisResult schema

Implemented in the internal `src/analysis/result.ts` module:

- strict `AnalysisResultSchema` with inferred TypeScript types;
- strict subordinate schemas for clarity, facts, inferences, assumptions, unknowns, risks, discovery questions, roadmap, and confidence;
- qualitative clarity, confidence, impact, severity, priority, and roadmap enums;
- non-blank semantic strings that preserve accepted text exactly;
- required non-empty unique provenance arrays for facts and inferences;
- required roadmap phase with non-blank name and purpose;
- empty top-level analysis arrays allowed;
- Zod 4 JSON Schema conversion verified;
- no semantic truth or referenced-field existence checks in this structural phase.

AI-generated output remains untrusted until it satisfies `AnalysisResultSchema`. The schema and types remain internal; `runAnalysis()` is the only current consumer and returns only schema-parsed results as succeeded.

## Analysis execution

Implemented in the internal `src/analysis/run.ts` module:

- `AIAdapter.generateAnalysis()` receives only `AIAnalysisRequest`;
- `AIAnalysisRequest` contains `AnalysisInput` and an optional caller `AbortSignal`;
- adapter output is `unknown` until `AnalysisResultSchema.safeParse()` succeeds;
- a successful parse returns `{ status: "succeeded", result }` with the parsed result;
- empty AI-visible input returns `{ status: "unavailable", code: "no_input" }` without calling the adapter;
- ordinary adapter failures return `adapter_error` without exposing exception details;
- invalid or strict-schema-rejected output returns `invalid_output` without raw output or retry;
- caller cancellation propagates before, during, and after adapter execution;
- the adapter is invoked at most once.

The optional LangChain model-layer adapter and deterministic analysis prompt are implemented behind `./langchain`.

## Core result composition

Implemented in the internal `src/result.ts` module:

- `RequestSnapshot` preserves detached `original` data and normalized fields;
- `AnalysisState` maps successful analysis or unavailable execution reasons;
- `PreCallResult` contains exactly `request` and `analysis`;
- `processNormalizedSubmission()` snapshots before the async adapter boundary;
- `AnalysisInput` derives from the same snapshot, preserving operation consistency;
- request source and normalized fields are independently owned;
- no metadata, processing status, issues, delivery state, provider data, or intermediate `AnalysisInput` enters the result.

The request survives `succeeded`, `no_input`, `adapter_error`, and `invalid_output` outcomes. Caller cancellation propagates without returning a result.

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

No framework, database, provider SDK, email queue, or provider registry was added to the core. Optional direct integrations remain isolated behind explicit package subpaths.

## Public package identity and release state

The permanent product/repository name is **PreCall**, the npm package is **`precall`**, and the current source version is **0.1.0**. The package and repository use Apache-2.0, ESM-only exports, Node.js >=22.14.0, and Bun >=1.3.14. Stable `precall@0.1.0` is published and is the `latest` release. The unscoped `precall@0.1.0-bootstrap.0` remains historical release history under `bootstrap`. npm Trusted Publishing through GitHub Actions/OIDC works for the release workflow, and the stable GitHub Release `v0.1.0` exists.

The release artifact must contain `package.json`, `README.md`, `LICENSE`, and the complete generated `dist` runtime/declaration closure, while excluding source, tests, docs, scripts, `.github`, environment/secrets, temporary files, and media. Root, `./langchain`, and `./resend` remain separate exports; LangChain peers are optional and the Resend integration has no Resend SDK dependency.

`bun run release:check` validates metadata, license, version, and optional exact semver tag equality. `bun run release:dry-run` uses one npm-generated candidate for package checks and npm's dry-run publish validation, with no credentials or publication. The tag-only workflow now fetches full refs and requires tag commit = checked-out `HEAD` = `origin/main`; it uploads only `candidate.tgz` and `release-manifest.json`, then freshly rechecks source, manifest, and artifact bytes/SHA-512 before publishing without rebuilding. npm `11.14.1` is an exact devDependency resolved in `bun.lock`, invoked via `node_modules/npm/bin/npm-cli.js`; temporary-prefix/global npm installation is not used. GitHub release controls now include the protected `npm` environment with a `v*.*.*` tag deployment policy, an active `Protect release tags` ruleset, and an active `Protect main` ruleset. The environment requires the repository owner as its reviewer and permits self-review because this is currently a single-maintainer repository; npm trusted-publisher configuration and account bootstrap remain operator actions.

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
→ deterministic renderer + submission attachment
→ createRenderedEmail()
→ trusted recipient + EmailTransport
→ DeliveryOutcome
```

Public facade:

```text
createPrecall(config)
        ↓
precall.submit({ submission, transport, recipient, email?, signal? })
        ↓
{ result: PreCallResult, delivery: DeliveryOutcome }
```

Advanced callers can use the underlying operations independently:

```text
precall.process({ submission, signal? })
        ↓
PreCallResult
        ↓
precall.deliver({ result, transport, recipient, email?, signal? })
        ↓
DeliveryOutcome
```

The configured facade snapshots trusted field and limit configuration at creation, captures the adapter reference, stores no request state, and supports concurrent calls. `submit()` explicitly composes `process()` and `deliver()`; processing and delivery remain separate, and `PreCallResult` is never extended with delivery state or mutated by the public boundary.

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

- the public facade owns a narrow `AIAdapter`;
- the adapter receives only the already-filtered analysis input;
- AI output remains untrusted until Zod validation;
- no generic agent framework belongs in core;
- no multi-provider fallback engine belongs in MVP;
- `LANGCHAIN_MODEL_WINS`: direct `@langchain/core@1.2.9` model layer selected;
- the optional integration is exported from `./langchain`;
- `AnalysisResultSchema` remains the final trust boundary;
- the adapter makes one structured runnable invocation with `maxRetries: 0`.

### Provider bake-off result

`@oh-my-pi/pi-ai@18.1.10` was rejected for this integration. Its structured result path is tool-oriented, its public completion path has hidden retry/replay behavior, and its package exports TypeScript source with only a Bun engine declaration, which conflicts with the packed Node consumer requirement.

The LangChain model layer passed with documented limitations. The direct `@langchain/core` abstraction provides `withStructuredOutput()` over Zod 4 and `Runnable.invoke()` with `AbortSignal`; broad provider support remains consumer/provider-package owned, and LangChain's general dependency footprint is intentionally kept out of the root package.

Deep Agents is rejected/deferred for core because PreCall requires one bounded structured model operation, not planning, filesystem, subagents, persistent state, or tool execution.

The optional adapter receives only `AnalysisInput`, separates trusted system instructions from a JSON-serialized untrusted payload, forwards cancellation, disables retries per invocation, and returns no provider envelope or metadata. `@langchain/core` is an optional peer and a development dependency; `@langchain/openai` is development-only for the explicit live harness.

### Live and email state

`bun run live-ai:check` is implemented but not run without explicit credentials. It requires `PRECALL_LIVE_AI=1`, `PRECALL_LIVE_AI_PROVIDER=openai`, `PRECALL_LIVE_AI_MODEL`, and `PRECALL_LIVE_AI_API_KEY`; it uses synthetic fixture data and is excluded from CI and `check`.

`bun run live-email:check` is implemented but not run without explicit credentials. It requires `PRECALL_LIVE_EMAIL=1`, `PRECALL_LIVE_EMAIL_API_KEY`, `PRECALL_LIVE_EMAIL_FROM`, and `PRECALL_LIVE_EMAIL_TO`; it uses a deterministic synthetic PreCall result, sends exactly one Resend message, and is excluded from CI and `check`.

Full live AI plus live email E2E was not run.

## Email state

Settled behavior:

- deterministic packaging produces a fixed-subject `RenderedEmail`;
- HTML/text are reused from the deterministic renderer;
- `attachRawSubmission` defaults to `true`;
- `attachRawSubmission=false` omits attachments without changing subject or bodies;
- enabled packaging includes one output-permitted `submission.json`;
- `EmailTransport.send()` receives a trusted explicit recipient and `RenderedEmail`;
- valid recipients are preserved verbatim, while empty/whitespace and CR/LF-containing recipients are rejected;
- ordinary transport errors map to `{ status: "failed", reason: "transport_error" }` without exposing raw errors;
- cancellation propagates its exact reason and is not converted to a failed delivery;
- delivery makes one transport attempt and returns a separate `DeliveryOutcome`;
- public `precall.deliver()` is a thin wrapper over the internal delivery boundary;
- `RESEND_WINS`: the optional `./resend` transport uses direct `fetch()` against the fixed `https://api.resend.com/emails` endpoint;
- `createResendEmailTransport({ apiKey, from })` snapshots explicit trusted configuration and maps rendered content/attachments without provider SDK dependencies.

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

The repository contract now covers:

```text
frozen Bun install
→ repository contract
→ format
→ lint
→ typecheck
→ tests
→ build
→ packed-package consumer smoke
```

The package smoke uses npm's packing view and can inspect the same candidate selected for release. It validates metadata, README/LICENSE, complete `dist` closure, and forbidden paths, installs offline, and runs the consumer under Node and Bun plus NodeNext declaration checks. CI runs it after the existing build.

No real provider credentials or network access are required.

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

These are not blockers for the current intake, projection, schema, analysis execution, core composition, deterministic rendering, submission-attachment, email-packaging, internal-delivery, public-facade, `submit()` convenience flow, package-contract, optional-AI, optional-email, and public-release phases.

## Immediate next action

The next feature phase is the small Next.js integration proof: validate the server-side developer experience with a Server Action and/or Route Handler without adding framework coupling to the core.
