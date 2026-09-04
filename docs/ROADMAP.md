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

The attachment is an output-permitted structured view derived from normalized fields, not `request.original` or exact original HTTP bytes. It contains no analysis or policy metadata. Email packaging and transport remain separate future stages.

**Milestone:** `PreCallResult` now produces both deterministic brief output and a structured submission artifact.

## Phase 8 — Deterministic email packaging

Implement:

- package `RenderedBrief` and `SubmissionAttachment`;
- subject and trusted recipient handling;
- raw attachment inclusion policy.

Do not send email in this phase.

## Phase 9 — Email transport boundary

Implement:

- `EmailTransport`;
- fake transport;
- delivery outcome;
- result survival on delivery failure.

Then select one real email provider/transport.

Do not build a universal email framework.

## Phase 10 — Package contract

After public API is real:

- build;
- npm pack;
- validate artifact;
- clean-consumer install;
- Bun smoke;
- Node smoke.

## Phase 11 — Next.js integration proof

Add a small example using:

- Server Action and/or;
- Route Handler.

Goal:

- verify server-side developer experience;
- catch package/bundling problems.

A full demo application is unnecessary.

## Phase 12 — Pi AI spike

After the fake-adapter core is green:

Test a small Pi-based AI transport.

Acceptance criteria are defined in `AI.md`.

Possible outcome A:

- Pi becomes first official AI transport.

Possible outcome B:

- use a direct provider adapter.

Either outcome keeps the core unchanged.

## Phase 13 — First public package preparation

Before publishing, settle:

- permanent package/repository name;
- license;
- minimum Node version;
- exact Bun support policy;
- first real AI adapter;
- first email transport.

Add release workflow:

```text
vX.Y.Z tag
→ version verification
→ frozen install
→ full checks
→ package/runtime validation
→ trusted npm publish
→ GitHub Release
```

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
