# MVP Specification

## Objective

The first usable version must prove one thing:

> Given an incomplete but valid client inquiry, can the library preserve the request, analyze only permitted data, produce a trustworthy structured pre-call brief, expose uncertainty, prepare useful discovery questions, and still preserve/deliver the inquiry when AI fails?

If the answer is yes, the core product is proven.

## MVP inputs

The consumer supplies:

- a structured submission;
- field definitions/metadata;
- an AI adapter;
- optional processing-limit overrides;
- optional email configuration.

The consumer application owns the actual public form.

## Field metadata

Each configured field has at least:

- `key`;
- `label`.

Optional metadata:

- `description`;
- `sendToAI`;
- `includeInOutput`;
- `sensitive`.

Implemented field-policy defaults:

- `sensitive` defaults to `false`;
- `includeInOutput` defaults to `true`;
- `sendToAI` defaults to `false` when `sensitive=true`;
- otherwise `sendToAI` defaults to `true`;
- an explicit field setting overrides the default.

The strict field-definition schema rejects unknown properties, empty keys, and whitespace-only labels.

## Required processing behavior

### 1. Preserve original input

The original client submission remains available as the authoritative source.

The library must not reconstruct it from AI output.

### 2. Normalize fields

Arbitrary consumer fields are normalized into a safe internal representation.

Dynamic untrusted field names should not become trusted object-merge keys throughout the core.

A normalized array representation is preferred.

### 3. Validate before expensive processing

The intake boundary validates and size-checks structured data before any later expensive processing.

Validation covers:

- strict field-definition structure;
- duplicate definitions;
- field keys and labels;
- definition and submission field counts;
- JSON-like value structure;
- value nesting depth;
- per-value UTF-8 JSON bytes;
- total preserved-submission UTF-8 JSON bytes;
- required intake invariants.

Initial defaults are configurable and inclusive: 100 fields, 128 key code points, 256 label code points, 1,024 description code points, 65,536 bytes per value, 262,144 bytes per submission, and depth 8.

### 4. Construct a permitted AI view

Phase 3 implements the internal `createAnalysisInput(normalized)` boundary.

It returns:

```ts
type AnalysisInputField = {
  key: string
  label: string
  value: JsonValue
  description?: string
}

type AnalysisInput = {
  fields: AnalysisInputField[]
}
```

The projection iterates normalized fields in definition order and includes only fields with resolved `sendToAI === true`. It copies no policy metadata and never uses the authoritative `original` source. Every permitted value is detached before future AI processing.

Hidden fields are absent, not redacted. An all-private submission produces `{ fields: [] }`. This phase performs no AI call, prompt construction, provider integration, or structured analysis.

### 5. Perform one structured analysis operation

MVP uses one analysis operation, not a multi-agent workflow or per-section model calls.

The analysis should produce:

- executive summary;
- request clarity/maturity;
- client-stated facts;
- inferred understanding;
- assumptions;
- important unknowns;
- request-specific risks/complexity drivers;
- prioritized discovery questions;
- preliminary execution path;
- qualitative confidence/uncertainty.

### 6. Validate AI output

`AnalysisResultSchema` is the canonical strict Zod 4 schema for the structured result. It requires:

- non-blank `summary`;
- qualitative `clarity` with a required reason;
- facts with non-empty unique source-field provenance;
- inferences with qualitative confidence, reasoning, and non-empty unique source-field provenance;
- assumptions;
- prioritized unknowns with required reasons;
- risks with required reasons;
- prioritized discovery questions with required reasons;
- a roadmap with a valid status and at least one phase;
- qualitative confidence with a required reason.

Top-level analysis arrays may be empty. Unknown properties, unsupported enums, null optionals, missing required fields, and whitespace-only semantic text are rejected. Zod is also the source for inferred types and JSON Schema conversion.

The internal `runAnalysis()` boundary accepts only schema-parsed output as succeeded. Malformed output becomes explicit unavailable analysis; it is not repaired, partially returned, or retried.

### 7. Produce a reusable result

The core produces a reusable structured result, working name `PreCallResult`.

It is not an email payload.

### 8. Render deterministically

The internal default renderer consumes `PreCallResult` synchronously and returns:

```ts
type RenderedBrief = {
  html: string
  text: string
}
```

It does not call AI or perform I/O. Successful and unavailable analysis branches use a fixed semantic order, omit empty optional sections, project direct source presentation from normalized fields with `includeInOutput === true`, and escape AI/client strings before HTML insertion.

### 9. Email as first destination

MVP includes deterministic logical email packaging as an internal content boundary. It does not send email or resolve recipients.

```ts
type RenderedEmail = {
  subject: "Pre-Call Brief"
  html: string
  text: string
  attachments: SubmissionAttachment[]
}
```

`createRenderedEmail(result, options?)` reuses the existing deterministic renderer and output-permitted submission attachment builder. The fixed subject contains no client or AI interpolation.

### 10. Output-permitted submission attachment

The internal attachment builder creates a deterministic structured submission artifact:

```text
filename: submission.json
content type: application/json
bytes: UTF-8 JSON
```

The payload contains only normalized field keys and values where `includeInOutput === true`, in normalized field order. It contains no labels, descriptions, policy metadata, analysis, or `request.original`. An all-private output produces `{}` with a trailing newline. Email packaging includes it by default and may disable it with `attachRawSubmission=false`.

### 11. Graceful no-AI fallback

If AI fails or returns unusable structure:

- the intake remains valid;
- original submission remains available;
- analysis is explicitly unavailable;
- a fallback brief can still render;
- email delivery can still be attempted.

The library must not fabricate analysis to make the result appear complete.

## Brief quality rules

### Facts

A fact is only something explicitly supported by the client submission.

Facts should preserve source-field traceability where practical.

### Inferences

Inferences must remain labeled as inferred.

Useful inference information may include:

- inference text;
- reason;
- confidence;
- source/basis;
- what requires validation.

### Assumptions

Assumptions are possible interpretations, not facts.

### Unknowns

Unknowns should be prioritized.

Recommended importance classes:

- critical;
- important;
- minor.

Critical unknowns are those that materially block scope, feasibility, budget compatibility, roadmap depth, or understanding.

### Discovery questions

Questions are prioritized by how much they improve:

- understanding;
- scope;
- risk assessment;
- feasibility;
- budget/timeline discussion.

For vague requests, upstream questions about goals and current workflows are more useful than speculative feature checklists.

### Risks

Risks must be request-specific and explain why they matter.

Avoid generic filler such as:

- security might matter;
- scalability could be a concern;
- performance should be considered.

### Roadmap

Roadmap depth depends on request maturity.

For a sufficiently understood request, a preliminary path may include:

1. discovery;
2. existing-system assessment;
3. scope definition;
4. UX/product design;
5. implementation;
6. integration/data work;
7. testing;
8. release preparation.

For a very vague request, it is valid to return only a discovery phase and state that later phases cannot yet be determined.

### Confidence

Use qualitative levels:

- high;
- medium;
- low;
- insufficient information.

Confidence describes the quality/completeness of current understanding, not a mathematical probability that the AI is correct.

## Processing outcomes

The internal composition boundary now combines a valid normalized request with the analysis execution outcome:

### Successful analysis

Valid adapter output becomes:

```text
request preserved
analysis.status = "succeeded"
```

The analysis value is the trusted result parsed by `AnalysisResultSchema`.

### Unavailable analysis

The request remains a valid reusable `PreCallResult` when enrichment is unavailable:

- empty AI-visible input returns `no_input` without an adapter call;
- an ordinary adapter failure returns `adapter_error`;
- malformed or strict-schema-invalid output returns `invalid_output`.

The unavailable reason is stored on `analysis.reason`. Raw provider errors and malformed output are not retained, and no retry occurs.

### Caller cancellation

The deterministic default renderer now renders successful and unavailable analysis as HTML/plain text. Email delivery remains a future stage.


## Email behavior

A successful logical email package should normally contain:

- deterministic fixed subject;
- summary;
- request clarity;
- client-stated facts;
- inferred understanding;
- assumptions;
- important unknowns;
- risks/complexity drivers;
- discovery questions;
- preliminary execution path;
- confidence;
- output-permitted submitted fields;
- processing note where useful.

Empty sections should generally be omitted rather than converted into unjustified claims such as "No risks detected."

Fallback email packaging should clearly state that AI enrichment was unavailable and still include the permitted submitted fields.

The package includes one `submission.json` attachment by default. This is an output-permitted structured view, not the complete authoritative source or original HTTP bytes. `attachRawSubmission=false` disables the attachment without changing the subject or bodies.

## MVP acceptance cases

The deterministic test suite must cover at least:

1. normal incomplete fitness-app inquiry;
2. very vague inquiry;
3. hostile prompt-injection text inside a submission;
4. AI exception;
5. malformed AI output;
6. fields hidden from AI;
7. fields hidden from professional-facing output;
8. default submission attachment;
9. disabled submission attachment;
10. email transport failure while the structured result survives.

## Explicitly deferred from MVP

- external research;
- budget/pricing analysis;
- multi-provider fallback chains;
- per-skill models;
- skill/plugin registry;
- community skills;
- PDF;
- Slack/CRM/messaging integrations;
- generic webhook system;
- database/storage layer;
- dashboard/analytics;
- hosted service;
- post-discovery second pass;
- generalized retries/repair loops;
- broad Edge-runtime support promise;
- advanced template customization framework.
