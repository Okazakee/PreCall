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
        RenderedEmail
```

Analysis failure follows a preserved-request branch:

```text
valid normalized request
+ AI unavailable
        ↓
PreCallResult with analysis unavailable
        ↓
deterministic fallback presentation
```

Presentation and deterministic email packaging are complete for the internal artifacts. Delivery remains a future stage and consumes `RenderedEmail` without rerunning analysis.

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

Sends a rendered email somewhere.

MVP destination:

- email through a future transport boundary.

Delivery does not rerun analysis.

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

An email provider can fail while the structured result remains valid and available to the consumer.

## Public API direction

Current preferred API shape:

```ts
const precall = createPrecall(config)

const result = await precall.process({
  submission,
  signal,
})
```

Architecturally, delivery remains separate:

```ts
await precall.deliver(result, ...)
```

A convenience combined call may be added if implementation proves it useful, but it is not necessary to prove the MVP.

The configured instance must remain stateless between requests.

Do not design APIs like:

```text
setSubmission()
analyze()
send()
reset()
```

because shared server instances must be safe for concurrent calls.

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

The core owns a small internal AI interface:

```ts
interface AIAdapter {
  generateAnalysis(request: AIAnalysisRequest): Promise<unknown>
}
```

`AIAnalysisRequest` contains only the privacy-filtered `AnalysisInput` and an optional caller `AbortSignal`. The adapter output remains unknown until `AnalysisResultSchema` validates it. `runAnalysis()` makes at most one attempt and returns either a schema-parsed succeeded result or an explicit unavailable code for no input, adapter error, or invalid output. Caller cancellation propagates rather than becoming fallback.

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
        future EmailTransport
                ↓
          DeliveryOutcome
```

The implemented renderer, attachment builder, and email packager are separate, destination-neutral boundaries. Packaging fixes the subject, reuses the rendered bodies, and optionally includes the existing submission artifact. Transport owns trusted recipients, headers, provider behavior, and delivery outcomes.

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
- event bus;
- dependency-injection framework;
- agent framework;
- vector database;
- generic middleware system;
- plugin marketplace architecture;
- workflow engine.
