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
```

Analysis failure follows a preserved-request branch:

```text
valid normalized request
+ AI unavailable
        ↓
PreCallResult with analysis unavailable
```

Rendering and delivery are future stages and remain separate from composition.

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

The structured result is the main reuse boundary.

It must be useful independently of email.

### 5. Presentation

Transforms `PreCallResult` into human-readable output.

MVP presentation:

- deterministic HTML email;
- deterministic plain text.

Presentation does not reinterpret the project or call AI.

### 6. Delivery

Sends a rendered artifact somewhere.

MVP destination:

- email.

Delivery does not rerun analysis.

### 7. Storage

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

The adapter interface remains narrower than a general LLM SDK. Do not add generic chat, embeddings, audio, sessions, agents, tools, or provider capabilities unless a real future requirement needs them.

## Email architecture

```text
PreCallResult
    ↓
default renderer
    ↓
RenderedEmail
    ↓
EmailTransport
    ↓
DeliveryOutcome
```

The renderer owns:

- subject construction;
- HTML;
- plain text;
- raw attachment construction.

The transport owns provider-specific sending.

The recipient comes from trusted application configuration, not client-submitted fields.

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
