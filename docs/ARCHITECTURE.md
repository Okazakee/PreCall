# Architecture

## Goal

Keep the system understandable while separating responsibilities that have materially different trust, failure, or reuse characteristics.

The current implemented core pipeline is:

```text
untrusted submission
        ↓
validate + normalize
        ↓
NormalizedSubmission
        ↓
detached operation snapshot
        ├→ reusable request state
        ↓
positive AI projection
        ↓
runAnalysis
        ↓
PreCallResult
        ├→ deterministic brief renderer
        │       ├→ RenderedBrief.html
        │       └→ RenderedBrief.text
        └→ output-permitted submission artifact
                ↓
        createRenderedEmail()
                ↓
        trusted recipient + EmailTransport
                ↓
        DeliveryOutcome
```

Analysis failure follows a preserved-request branch:

```text
valid normalized request
+ AI unavailable
        ↓
PreCallResult with analysis unavailable
        ↓
deterministic fallback presentation
        ↓
email packaging and delivery may still proceed
```

Presentation, deterministic email packaging, and the internal delivery boundary are complete. Delivery consumes `RenderedEmail` without rerunning analysis.

## Main responsibility boundaries

### 1. Intake

Owns:

- submitted values;
- field definitions;
- normalization;
- preservation of original source data.

Does not own:

- semantic project interpretation;
- AI provider behavior;
- rendering;
- delivery.

### 2. Protection

Owns:

- runtime validation;
- field-count and size limits;
- construction of permitted AI/output views;
- protection of core processing from malformed or oversized input.

Does not mean "sanitized/trusted semantic content." Valid client text is still untrusted data.

### 3. Analysis

Owns:

- request summary;
- clarity/maturity assessment;
- fact extraction;
- cautious inferences;
- assumptions;
- unknowns;
- risks;
- discovery questions;
- preliminary execution path;
- confidence.

For MVP, this is one structured analysis operation.

### 4. Structured result

Owns the reusable domain result.

Working name:

`PreCallResult`

Transforms `PreCallResult` into human-readable output.

Implemented default presentation:

- `RenderedBrief` with deterministic HTML;
- `RenderedBrief` with deterministic plain text;
- successful and unavailable analysis branches;
- positive output-field projection from normalized fields.

Presentation does not reinterpret the project, call AI, or perform I/O. Email packaging consumes these artifacts without changing their semantics.

### 6. Submission artifact

Creates a deterministic `SubmissionAttachment` from output-visible normalized fields. It does not read `request.original`, call AI, package email, or perform I/O.

### 7. Delivery

Owns:

- accepting a trusted explicit recipient;
- packaging the existing `PreCallResult` into a `RenderedEmail`;
- invoking the provider-neutral `EmailTransport` exactly once;
- mapping ordinary transport failures to a stable `DeliveryOutcome`;
- preserving caller cancellation as cancellation.

The internal `deliverPreCallResult(transport, recipient, result, emailOptions?, signal?)` function returns `{ status: "sent" }` or `{ status: "failed", reason: "transport_error" }`. It rejects empty/whitespace and CR/LF-containing recipients, preserves valid recipients verbatim, forwards a supplied signal by identity, and never mutates or adds delivery state to `PreCallResult`. No real provider exists.

### 8. Storage

Primarily belongs to the consuming application.

The core should not require a database.

## Critical separations

### Raw submission != AI input

The preserved original request may contain fields the AI is not allowed to see.

The AI receives only a permitted analysis view.

### AI output != final email

AI produces structured content.

The renderer owns presentation markup.

### Structured result != presentation

The same result should later support other destinations without analysis reruns.

### Analysis success != intake success

A valid intake can survive when AI fails.

### Delivery success != processing success

An email transport can fail while the structured result remains valid and available to the consumer.

## Public API direction

The first intentional public facade is:

```ts
const precall = createPrecall({
  ai,
  fields,
  limits,
})

const result = await precall.process({
  submission,
  signal,
})

const delivery = await precall.deliver({
  result,
  transport,
  recipient,
  email,
  signal,
})
```

`createPrecall()` validates trusted adapter/configuration inputs and snapshots field definitions and limits at creation. The returned instance stores no per-request state and safely supports concurrent `process()` calls. `process()` accepts only untrusted submission data and delegates to the existing normalization and analysis boundaries. `deliver()` delegates to the existing delivery boundary; it does not duplicate recipient validation, packaging, failure mapping, or abort handling.

The root package exports `createPrecall` and `IntakeValidationError` as runtime values. It exports only the types required to configure the facade or implement the semantic AI/email extension points. Schemas, normalizers, renderers, packagers, result composers, and delivery helpers remain internal.

The packed-package smoke verifies this public contract from the actual tarball under Node and Bun and compiles a NodeNext TypeScript consumer against the generated declarations.

## Trusted versus untrusted configuration

`createPrecall(config)` is trusted application configuration.

`process({ submission })` receives untrusted external data.

Client fields must not be able to alter:

- AI provider;
- model;
- privacy policy;
- output policy;
- processing limits;
- email recipient;
- attachment policy;
- trusted analysis instructions.

## AI boundary

`AIAdapter` is a public semantic extension point:

```ts
interface AIAdapter {
  generateAnalysis(request: AIAnalysisRequest): Promise<unknown>
}
```

The adapter receives only the privacy-filtered `AnalysisInput` and an optional caller `AbortSignal`. The output remains `unknown` until `AnalysisResultSchema` validates it. `runAnalysis()` makes at most one attempt and returns either a schema-parsed succeeded result or an explicit unavailable code for no input, adapter error, or invalid output. Caller cancellation propagates rather than becoming fallback.

## Email packaging and transport architecture

```text
PreCallResult
        ├──→ deterministic brief renderer
        │       ├── HTML
        │       └── text
        │
        └──→ output-permitted submission projection
                ↓
             SubmissionAttachment
                ↓
        createRenderedEmail()
                ↓
           RenderedEmail
                ↓
     trusted recipient + EmailTransport
                ↓
          DeliveryOutcome
```

The implemented renderer, attachment builder, email packager, and internal transport boundary are separate, destination-neutral boundaries. Packaging fixes the subject, reuses the rendered bodies, and optionally includes the existing submission artifact. Delivery accepts the explicit trusted recipient, attempts the transport once, redacts ordinary transport errors, and preserves cancellation. A concrete provider, credentials, headers, retries, and other destination behavior remain outside this slice.

## Runtime direction

Settled:

- TypeScript;
- Bun for package management, primary development/runtime, and tests;
- plain TypeScript core without framework coupling;
- backend/server only;
- Web-standard APIs where practical.

Primary verified target direction:

- Bun backend;
- Node-compatible backend;
- Next.js Server Actions / Route Handlers.

Edge portability is a design goal, not an MVP support guarantee.

## Dependency/bundle direction

Start as one installable package.

Maintain internal boundaries without prematurely creating multiple packages.

If a provider adapter or email transport introduces runtime-specific dependencies, use package entry points or adapter-specific imports rather than contaminating the entire public bundle.

## What is intentionally absent

MVP does not need:

- ORM;
- built-in database;
- HTTP framework;
- job queue;
- real AI provider;
- real email provider;
- Pi integration before the compatibility spike;
- provider SDK;
- retry/fallback graph;
- workflow engine.
