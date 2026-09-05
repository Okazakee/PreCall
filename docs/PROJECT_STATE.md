# Project State

**Last consolidated:** September 2026

This file is the mutable snapshot of the project's current technical/product state.

## Current phase

**Phase 9 — Internal email transport and delivery orchestration complete; ready for the first public API.**

The repository composes a detached normalized request snapshot, renders an internal deterministic brief, creates a separate output-permitted JSON attachment artifact, packages those artifacts into an internal logical email representation, and can deliver that package through a provider-neutral internal transport boundary. No real provider or public processing API exists yet.

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

The internal `EmailTransport` boundary and delivery orchestration now exist. No real email is sent, no provider SDK exists, and the package root remains intentionally empty.

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

The internal adapter and analysis execution boundary are implemented without a provider SDK, prompt, or model call. The package root remains intentionally empty.

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

No real AI provider, prompt implementation, or public `process()` API exists yet.

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
→ deterministic renderer + submission attachment
→ createRenderedEmail()
→ trusted recipient + EmailTransport
→ DeliveryOutcome
```

Fallback:

```text
AI fails / output invalid
→ analysis unavailable
→ raw fallback result
→ deterministic email packaging
→ delivery may still proceed
```

Delivery remains separate from processing: `PreCallResult` is never extended with delivery state or mutated by the delivery boundary.

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
- no real provider, provider SDK, or public delivery API exists.

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

These are not blockers for the current intake, projection, schema, analysis execution, core composition, deterministic rendering, submission-attachment, email-packaging, and internal-delivery phases:

- exact minimum Node version;
- first real email provider/transport;
- whether Pi passes the future provider spike;
- exact npm package name;
- permanent product/repository name;
- open-source license;
- exact release tooling beyond the settled flow;
- whether `process()` alone is sufficient initially or whether a convenience combined API is immediately useful.

## Immediate next action

Expose the first intentional public `createPrecall()` / `process()` API and prove a complete fake-adapter/fake-transport end-to-end consumer flow.
