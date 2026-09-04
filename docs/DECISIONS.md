# Decisions

This file records explicit current decisions. It is mutable project state, not a statement that every decision is permanent forever.

A later explicit decision may supersede an earlier one.

## Product

### D-001 — AI prepares the human

**Status:** Settled

The product produces an internal pre-call brief to prepare the professional for discovery.

It does not replace the discovery call.

### D-002 — Original submission remains authoritative

**Status:** Settled

AI interpretation never replaces the client's original request.

### D-003 — Inference must remain distinguishable from fact

**Status:** Settled

The result explicitly separates:

- facts;
- inferences;
- assumptions;
- unknowns.

### D-004 — Request maturity changes analysis depth

**Status:** Settled

Vague inquiries should become discovery-first rather than being expanded into invented detailed scope.

### D-005 — Confidence is qualitative

**Status:** Settled

Use levels such as high/medium/low/insufficient information with reasons.

Do not use fake probability percentages.

## MVP scope

### D-006 — MVP analysis is one structured operation

**Status:** Settled

Do not build per-skill orchestration or multiple model calls for the first version.

### D-007 — External research is deferred

**Status:** Settled for MVP

Research remains a future optional capability.

### D-008 — Budget/pricing analysis is deferred

**Status:** Settled for MVP

Budget remains important to the long-term product, but it is not required to prove v0.

### D-009 — Email is the first built-in destination

**Status:** Settled

The core result remains destination-independent.

### D-010 — Raw submission email attachment defaults on

**Status:** Settled

Working configuration concept:

`attachRawSubmission: true`

The consumer may disable it.

Output privacy rules override the global attachment setting.

### D-011 — No generic partial-AI-result framework in v0

**Status:** Settled

MVP analysis is either valid/succeeded or unavailable.

Partial recovery may be added later if implementation evidence justifies it.

### D-012 — MVP fallback is AI → raw fallback

**Status:** Settled

No multi-provider retry graph, repair loop, or fallback matrix initially.

## Input/privacy

### D-013 — Consumer owns the form

**Status:** Settled

The core accepts arbitrary structured fields.

### D-014 — Normalize dynamic fields internally

**Status:** Settled direction

Prefer an array of normalized field entries rather than relying on untrusted dynamic object keys throughout the core.

### D-015 — Sensitive and output visibility are separate

**Status:** Settled

`sensitive` primarily affects data-minimization defaults.

`includeInOutput` controls professional-facing output.

### D-016 — Working field defaults

**Status:** Settled direction

- `sensitive=false`;
- `includeInOutput=true`;
- `sendToAI=!sensitive` unless explicitly overridden.

The exact schema syntax is implemented in the internal intake module and remains subject to the future intentional public API.

### D-052 — Submitted fields require definitions

**Status:** Settled

Every submitted top-level field must match a configured `FieldDefinition`. A field without policy metadata has no explicit AI, output, or privacy behavior, so undeclared fields fail rather than being silently dropped or accepted.

### D-053 — Structured submission values are JSON-like data

**Status:** Settled for intake

The intake boundary accepts JSON-like trees and rejects executable or runtime-specific objects such as accessors, class instances, cycles, and unsupported built-ins. Structured validation does not make client text semantically trusted.

### D-054 — Normalized ordering follows field-definition order

**Status:** Settled

Normalized fields follow consumer configuration order rather than submission object enumeration order, providing deterministic downstream processing and presentation.

### D-055 — Initial intake safety limits

**Status:** Settled for current implementation

The configurable defaults are 100 fields, 128 key code points, 256 label code points, 1,024 description code points, 65,536 UTF-8 JSON bytes per value, 262,144 UTF-8 JSON bytes per submission, and depth 8. These are implementation safety defaults, not eternal product limits.

### D-056 — AI-visible data uses positive allowlisting

**Status:** Settled

Only normalized fields whose resolved `sendToAI` policy is `true` are copied into internal AI-visible input. Hidden fields are absent rather than redacted, and the authoritative original source is never filtered directly.

### D-057 — Facts require source-field provenance

**Status:** Settled

Every fact must identify at least one non-empty unique source field key. The schema guarantees provenance shape without claiming that the referenced key exists or proves the statement.

### D-058 — Inferences require reasoning and source basis

**Status:** Settled

Every inference requires qualitative confidence, a non-empty reason, and at least one non-empty unique source field key. Inference remains structurally distinct from client-stated fact.

### D-059 — AnalysisResult uses strict provider-neutral Zod schemas

**Status:** Settled

Zod is the single source of truth for runtime validation, inferred TypeScript types, and provider-facing JSON Schema conversion. The result schema contains no provider metadata or processing state.

### D-060 — Analysis arrays may be empty

**Status:** Settled

Facts, inferences, assumptions, unknowns, risks, and discovery questions may each be empty. The schema must not force invented content; roadmap phases remain the sole required non-empty analysis list.
### D-061 — Adapter output is untrusted

**Status:** Settled

`AIAdapter.generateAnalysis()` returns `unknown`; only `AnalysisResultSchema`-parsed output may enter the succeeded execution branch.

### D-062 — Ordinary AI failure becomes unavailable analysis

**Status:** Settled

Adapter exceptions and invalid structured output must degrade to explicit unavailable analysis without exposing raw provider details or output.

### D-063 — Caller cancellation is not fallback

**Status:** Settled

An `AbortSignal` is forwarded unchanged and caller cancellation propagates before, during, and after adapter execution rather than becoming an unavailable outcome.

### D-064 — Empty AI input skips execution

**Status:** Settled

An all-private analysis input must not call an adapter; it returns `no_input` to preserve privacy and avoid unnecessary cost.

### D-065 — Analysis execution makes one attempt

**Status:** Settled

The internal analysis runner invokes the adapter at most once. Retry, repair, and provider fallback require later evidence and are not part of this slice.

### D-066 — Core result preserves request independently of analysis success

**Status:** Settled

AI enrichment is optional; an ordinary AI failure must not erase or invalidate the accepted inquiry. `PreCallResult` preserves the detached request for every non-cancellation analysis outcome.

### D-067 — Result and AI input derive from one operation snapshot

**Status:** Settled

Caller mutation during asynchronous AI execution must not cause the preserved request and the analysis basis to describe different request states.

### D-068 — Keep PreCallResult minimal until later stages require more state

**Status:** Settled

The internal result contains only `request` and `analysis`. Provider metadata, IDs, timestamps, generic issues, processing state, and delivery state are deferred until a concrete stage needs them.

## Architecture

### D-017 — Reusable structured result is the main boundary

**Status:** Settled

Processing produces a reusable result; rendering/delivery consume it.

### D-018 — Processing and delivery remain conceptually separate

**Status:** Settled

Email does not own or trigger analysis.

### D-019 — Storage belongs primarily to the consumer

**Status:** Settled

No built-in database requirement.

### D-020 — One package initially

**Status:** Settled

Do not create a family of packages before real dependency/runtime pressure exists.

### D-021 — No framework in the core

**Status:** Settled

The library is plain TypeScript.

## Runtime/tooling

### D-022 — TypeScript

**Status:** Settled

Primary implementation language.

### D-023 — Bun is primary tooling/runtime

**Status:** Settled

Bun is the package manager, primary development/runtime target, and test runner environment.

The public package should remain Node-compatible where practical.

### D-024 — Server-side only

**Status:** Settled

The core is not a browser client library.

Secrets and AI processing stay server-side.

### D-025 — Prefer Web-standard APIs

**Status:** Settled

Use `fetch`, `AbortSignal`, `URL`, `Headers`, `Blob`, `ArrayBuffer`, `crypto`, etc. where practical.

### D-026 — Edge portability is a goal, not MVP guarantee

**Status:** Settled

Do not claim universal Edge support until tested.

### D-027 — First-class integration targets

**Status:** Settled direction

- Bun backend;
- Node-compatible backend;
- Next.js Server Actions / Route Handlers.

## Dependencies

### D-028 — Zod 4 for runtime validation

**Status:** Settled

Use Zod as the source of truth for runtime structure and TypeScript inference.

### D-029 — `bun:test`

**Status:** Settled

Use Bun's native test runner.

### D-030 — tsdown

**Status:** Settled

Use tsdown for TypeScript library packaging/build.

### D-031 — TypeScript compiler for typechecking

**Status:** Settled

Use `tsc --noEmit`.

### D-032 — Biome + Oxlint

**Status:** Settled baseline

Biome handles formatting/import organization/basic linting.

Oxlint provides additional linting.

Avoid custom lint-framework work until justified.

## AI

### D-033 — Core owns a tiny `AIAdapter`

**Status:** Settled

Provider-specific SDK/types must not leak through the core public API.

### D-034 — Do not adopt a generic agent harness for core

**Status:** Settled

No agent loop, session system, tool ecosystem, or generic agent framework is needed for MVP.

### D-035 — Pi provider layer is a candidate, not yet committed

**Status:** To validate

Evaluate a small Pi/provider-layer adapter behind `AIAdapter`.

Do not make the full Pi agent harness part of the architecture.

### D-036 — Fake adapter before real provider integration

**Status:** Settled

Prove the core processing vertical slice before evaluating Pi.

### D-037 — Precall owns structured-output validation

**Status:** Settled

AI output remains `unknown` until it passes the Zod `AnalysisResult` schema.

## Email/security

### D-038 — Deterministic renderer

**Status:** Settled

AI produces structured text, not final trusted markup.

### D-039 — HTML and plain-text output

**Status:** Settled direction

The default email renderer should produce both.

### D-040 — Escape client and AI strings

**Status:** Settled

Both are untrusted presentation data.

### D-041 — Email recipient comes from trusted configuration

**Status:** Settled

Do not derive the destination implicitly from client fields.

### D-042 — Fixed raw attachment filename preferred

**Status:** Settled direction

Use a library-controlled filename such as `submission.json`.

## Engineering process

### D-043 — Tests and CI start with the repository

**Status:** Settled

They are not deferred cleanup work.

### D-044 — Mock external boundaries

**Status:** Settled

Use fake AI and email adapters; do not mock the core logic that tests are meant to prove.

### D-045 — Test the packed artifact

**Status:** Settled

CI must eventually verify a clean consumer installs the actual npm tarball.

### D-046 — Initial runtime package smoke is Bun + Node

**Status:** Settled

Add Next.js smoke when the example exists.

### D-047 — Release revalidates tagged source

**Status:** Settled

Do not publish solely because an earlier main-branch CI run was green.

### D-048 — Prefer trusted npm publishing

**Status:** Settled direction

Use OIDC/trusted publishing when the package is ready.

## Deferred architecture

### D-049 — No skills/plugin registry in MVP

**Status:** Settled

Keep the future product concept; do not implement infrastructure now.

### D-050 — No generic hooks/middleware framework

**Status:** Settled

Add hooks only when concrete consumer needs appear.

### D-051 — No user-configurable system prompt in MVP

**Status:** Settled

Protect consistency, evaluation, and safe defaults first.
