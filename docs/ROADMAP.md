# Roadmap

This roadmap separates the immediate implementation path from later product capabilities.

## Phase 0 — Product and architecture decisions

**Status: complete enough to implement**

Completed decisions include:

- core product purpose;
- MVP boundary;
- golden brief behavior;
- request maturity handling;
- facts/inferences/assumptions/unknowns;
- discovery-question prioritization;
- risk behavior;
- roadmap depth;
- confidence model;
- no-AI fallback;
- architecture boundaries;
- field privacy;
- email attachment behavior;
- server runtime direction;
- validation/tooling/test/CI direction;
- simplified AI adapter strategy.

## Phase 1 — Repository bootstrap

**Status: complete**

The minimum project baseline is configured and verified:

- package metadata;
- Bun lockfile pinned to Bun 1.3.14;
- strict TypeScript configuration;
- tsdown;
- Biome;
- Oxlint;
- `src/index.ts`;
- README;
- AGENTS guidance;
- GitHub Actions CI;
- lightweight repository/script contract.

Success verified:

- frozen install;
- repository contract;
- non-mutating formatting and linting;
- typecheck;
- deterministic test;
- build

all pass before substantial product code exists.

## Phase 2 — Intake and normalization

**Status: complete**

Implemented:

- strict `FieldDefinitionSchema` with inferred TypeScript types;
- resolved sensitive, AI, and output privacy defaults with explicit overrides;
- JSON-like structured submission validation;
- detached authoritative source snapshots;
- deterministic normalized field arrays in definition order;
- duplicate-definition and unknown-submission-field rejection;
- configurable field, value, submission-size, and nesting limits;
- stable intake validation error categories.

Phase 3 now provides the deterministic privacy-filtered analysis input boundary.

## Phase 3 — AI-visible input boundary

**Status: complete**

Implemented:

- internal `AnalysisInput` and `AnalysisInputField` types;
- positive `sendToAI === true` allowlisting from normalized fields;
- minimal metadata projection;
- detached JSON-like values;
- stable normalized/definition ordering;
- empty output for all-private submissions.

Tests prove hidden fields and metadata cannot cross the boundary, `original` is not used, explicit privacy policies remain independent, hostile permitted text remains exact, and projected values do not alias normalized intake.


## Phase 4 — Analysis schema

**Status: complete**

Implemented:

- strict `AnalysisResultSchema` and inferred types;
- strict subordinate schemas for all golden-brief sections;
- qualitative enums for clarity, confidence, priorities, impact, severity, and roadmap status;
- non-blank semantic strings preserving accepted text;
- required non-empty unique fact and inference provenance;
- roadmap phase minimum;
- strict unknown-property rejection;
- Zod 4 JSON Schema conversion compatibility.

Tests cover representative, vague-request, minimal-valid, malformed, enum, provenance, whitespace, strictness, and JSON Schema cases.


## Phase 5 — Core processing vertical slice
**Status: complete**

Implemented:

- tiny internal `AIAdapter` with semantic `generateAnalysis()` method;
- `AIAnalysisRequest` containing only `AnalysisInput` and optional `AbortSignal`;
- one-attempt `runAnalysis()` execution;
- strict `AnalysisResultSchema` validation of unknown adapter output;
- explicit `succeeded`, `no_input`, `adapter_error`, and `invalid_output` outcomes;
- caller cancellation propagation without fallback conversion;
- detached `RequestSnapshot` preserving authoritative source and normalized fields;
- `AnalysisState` mapping analysis execution to reusable result semantics;
- minimal internal `PreCallResult` containing only `request` and `analysis`;
- `processNormalizedSubmission()` deriving request and AI input from one operation snapshot;
- deterministic adapter and composition tests.

The result composition preserves valid intake when AI enrichment is unavailable. It does not yet render output, deliver email, expose a public `process()` API, or include provider/processing metadata.

**Milestone:** core request and analysis state compose end-to-end without external services.

## Phase 6 — Default renderer

**Status: complete**

Implemented:

- internal `RenderedBrief` with `html` and `text`;
- synchronous, pure, deterministic rendering from `PreCallResult`;
- fixed semantic section order for successful analysis;
- explicit unavailable-analysis presentation for `no_input`, `adapter_error`, and `invalid_output`;
- omission of empty optional analysis sections;
- output-visible source projection from normalized fields in definition order;
- positive `includeInOutput === true` allowlisting;
- HTML escaping and safe multiline handling for client and AI strings;
- no direct rendering of `request.original`, provenance, or policy metadata.

The renderer is internal and does not call AI, perform I/O, or provide email packaging. Output-private fields are omitted from direct source presentation; free-form AI output can still contain derived information from fields deliberately sent to AI.

**Milestone:** reusable `PreCallResult` now renders as a deterministic internal HTML/plain-text brief, including safe unavailable fallback output.

## Phase 7 — Raw submission attachment

**Status: complete**

Implemented:

- internal `SubmissionAttachment` artifact;
- fixed filename `submission.json`;
- fixed content type `application/json`;
- UTF-8 `Uint8Array` bytes;
- top-level field-key-to-value JSON payload;
- positive `includeInOutput === true` allowlisting;
- normalized field order, including array-index-looking keys;
- nested JSON-like values and safe arbitrary keys;
- all-private output as `{}` with a trailing newline;
- standard JSON `-0` behavior (`-0` becomes `0`).

The attachment is an output-permitted structured view derived from normalized fields, not `request.original` or exact original HTTP bytes. It contains no analysis or policy metadata. Email packaging is complete, and internal transport/delivery is now complete; a real provider remains a future stage.

**Milestone:** `PreCallResult` now produces both deterministic brief output and a structured submission artifact.

## Phase 8 — Deterministic email packaging

**Status: complete**

Implemented:

- internal `EmailPackagingOptions` with optional `attachRawSubmission`;
- internal `RenderedEmail` with only `subject`, `html`, `text`, and `attachments`;
- fixed subject `Pre-Call Brief` without untrusted interpolation;
- exact HTML/text reuse from one deterministic renderer invocation;
- attachment-builder reuse with default-on `submission.json`;
- explicit `attachRawSubmission=false` returning no attachments without changing bodies;
- valid `{}` attachment retained when all submitted fields are output-private;
- no recipients, headers, providers, or delivery state.

Packaging is synchronous, pure, deterministic, non-mutating, and transport-free.

**Milestone:** `RenderedBrief` and `SubmissionAttachment` now compose into an internal `RenderedEmail`.

## Phase 9 — Email transport boundary

**Status: complete**

Implemented:

- internal provider-neutral `EmailTransport` boundary over `RenderedEmail`;
- deterministic fake transport in focused tests only;
- trusted explicit recipient forwarding with empty/whitespace/CR/LF rejection;
- positional internal delivery orchestration returning `DeliveryOutcome`;
- default and disabled attachment packaging forwarding;
- one transport attempt with ordinary failure redaction and exact cancellation propagation;
- delivery outcome remains separate from `PreCallResult`;
- no provider SDK, retry, queue, webhook, MIME, or public provider export in the core.

**Milestone:** An unavailable or successful `PreCallResult` can be packaged and delivered through a deterministic internal boundary without changing the result.

## Phase 10 — Public API and fake end-to-end flow

**Status: complete**

Implemented:

- public `createPrecall()` factory;
- stateless configured `Precall` facade with `process()` and `deliver()`;
- creation-time validation and snapshotting of trusted fields and limits;
- raw structured submissions entering only through canonical intake validation;
- public AI and email adapter extension points with unknown AI output;
- explicit trusted recipient and separate `DeliveryOutcome`;
- representative fake-backed process → result → delivery integration coverage;
- explicit root exports without low-level pipeline helpers.

**Milestone:** A consumer can configure fields and fake adapters, process raw structured input, inspect `PreCallResult`, and deliver it through a fake transport.

## Phase 11 — Package contract

**Status: complete**

The npm-generated public artifact is packed and verified by `package:check`. The contract validates exact public metadata, Apache-2.0 licensing, README/LICENSE inclusion, complete generated runtime/declaration closure, and forbidden repository-only paths. It installs the candidate into clean offline consumers, verifies Node and Bun runtime behavior, and compiles NodeNext TypeScript declarations for every public subpath.

**Milestone:** The actual public package artifact installs, imports, runs, and exposes usable declarations.

## Phase 12 — Next.js integration proof

Add a small example using:

- Server Action and/or;
- Route Handler.

Goal:

- verify server-side developer experience;
- catch package/bundling problems.

A full demo application is unnecessary.

## Phase 13 — AI provider abstraction and first real adapters

**Status: complete**

Implemented:

- evaluated `@oh-my-pi/pi-ai@18.1.10` and the current LangChain JavaScript model layer;
- rejected/deferred Deep Agents for core;
- selected direct `@langchain/core@1.2.9` model-layer integration with documented limitations;
- added the optional `./langchain` adapter without changing the provider-neutral core;
- added the deterministic PreCall analysis prompt and offline AI integration coverage;
- added an explicit opt-in synthetic live AI harness;
- evaluated Resend, Postmark, and Amazon SES v2;
- selected `RESEND_WINS` using direct fixed-endpoint fetch rather than the SDK;
- added optional `./resend` with explicit credentials, exact rendered-body/attachment mapping, abort propagation, one-attempt semantics, and opaque provider errors;
- added deterministic provider mapping tests and an explicit opt-in live email harness;
- added LangChain + delivery E2E coverage for success, AI failure, provider failure, and privacy;
- extended packed-package verification for root, `./langchain`, and `./resend` under Node, Bun, and NodeNext TypeScript.

**Milestone:** Both first external boundaries now exist as optional integrations while the core remains provider-neutral.

## Phase 14 — First public package preparation

**Status: identity rename complete; unscoped bootstrap pending; final publication pending**

Settled:

- product/repository name **PreCall**;
- npm package **`precall`**;
- Apache-2.0 license;
- version **0.1.0**;
- ESM-only policy;
- Node.js >=22.14.0 and Bun >=1.3.14 runtime floors;
- npm artifact contract and safe dry-run command;
- tag-only trusted-publisher/OIDC workflow;
- full-ref source admission requiring tag commit = checked-out `HEAD` = `origin/main`;
- canonical two-file candidate (`candidate.tgz` plus `release-manifest.json`) with byte/hash identity;
- exact npm `11.14.1` devDependency and repository CLI path, with no temporary/global npm bootstrap.

The new unscoped bootstrap `precall@0.1.0-bootstrap.0` is pending and may be published only with the `bootstrap` dist-tag. Stable `precall@0.1.0` remains unpublished. The historical scoped `@okazakee/precall@0.1.0-bootstrap.0` package is registry history only and must not be mutated. Trusted-publisher configuration and publishing-access verification remain owner actions. The workflow never auto-bumps versions, creates tags, or publishes on main pushes.

## Next milestone

Publish only the new unscoped bootstrap under the `bootstrap` dist-tag, configure and verify npm trusted publishing/access controls, then create and push a reviewed `v0.1.0` tag only if that version remains unpublished; verify OIDC publication and create the first GitHub Release.

# After MVP

Only add these after the core product is proven and a concrete need exists.

## Focused research

Potential capability:

- company/product research;
- website/product inspection;
- relevant public documentation;
- sourced findings.

Requirements:

- optional;
- opportunity-focused;
- source-aware;
- prompt-injection aware;
- SSRF-safe;
- must not destroy intake when unavailable.

## Budget decision support

Potential capability:

- compare stated budget with apparent workload/risk;
- custom professional pricing rules;
- explicit uncertainty;
- refusal to manufacture estimates when information is insufficient.

Not a quotation engine.

## Modular skills

Potentially split analysis capabilities when there is evidence that independent configuration/replacement is useful.

Do not begin with a plugin marketplace.

## Additional outputs

Potentially:

- PDF;
- Slack;
- Teams;
- Discord;
- CRM;
- webhook;
- dashboards.

All consume the same structured result.

## Multiple AI providers / fallback

Potentially:

```text
primary
→ alternate
→ alternate provider
→ no-AI fallback
```

Only build once reliability/cost requirements justify it.

## Hosted service

Possible later business direction:

- managed AI;
- managed delivery;
- anti-abuse infrastructure;
- dashboard/history;
- integrations;
- storage;
- team features.

The open-source core should remain useful independently.

## Post-discovery workflow

Possible second stage:

```text
pre-call brief
→ discovery call
→ professional notes
→ second analysis
→ clearer requirements
→ more meaningful roadmap/budget/scope
```

This is valuable but deliberately outside the initial version.
