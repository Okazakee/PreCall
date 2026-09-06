# Data Model

This document describes the current implemented intake, public facade, AI-visible projection, result, presentation, and delivery models alongside the conceptual future analysis model. Low-level intake, projection, and pipeline helpers remain internal while the configured public facade is the supported entrypoint.

## 1. Field definition

Each configured field uses the strict Zod-backed shape:

```ts
type FieldDefinition = {
  key: string
  label: string
  description?: string
  sendToAI?: boolean
  includeInOutput?: boolean
  sensitive?: boolean
}
```

`key` must be non-empty. `label` must contain non-whitespace content. Unknown properties are rejected, and no `required` property exists in this phase.

### Resolved policy

`resolveFieldDefinition()` resolves each definition without rewriting its strings:

- `sensitive` defaults to `false`;
- `includeInOutput` defaults to `true`;
- `sendToAI` defaults to `!sensitive`;
- explicit values override these defaults.

Sensitive fields therefore default to hidden from future AI input but remain included in professional-facing output unless configured otherwise. This phase does not construct an AI-visible payload.

## 2. Structured submission values

Submissions contain JSON-like structured data only:

```ts
type JsonPrimitive = string | number | boolean | null

type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue }
```

Accepted values are `null`, strings, booleans, finite numbers, standard arrays, and plain objects with `Object.prototype` or `null` prototypes. Accessors, non-enumerable or symbol properties, sparse or augmented arrays, class instances, `Date`, `Map`, `Set`, regular expressions, functions, `undefined`, `bigint`, symbols, non-finite numbers, cycles, and over-depth structures are rejected.

Runtime validation establishes structure, not semantic trust. Submitted text remains untrusted data.

## 3. Source snapshot and normalized representation

`normalizeSubmission()` accepts configured field definitions, a non-empty top-level structured submission, and optional intake-limit overrides.

It returns:

```ts
type NormalizedField = {
  key: string
  label: string
  value: JsonValue
  description?: string
  sensitive: boolean
  sendToAI: boolean
  includeInOutput: boolean
}

type NormalizedSubmission = {
  original: Record<string, JsonValue>
  fields: NormalizedField[]
}
```

`original` is a detached, deep source snapshot of the structured submission. It preserves submitted values but is not the original HTTP request bytes. Caller mutation after normalization cannot alter the snapshot, and normalization does not mutate caller input or definitions.

Only submitted fields appear in `fields`. Configured-but-absent fields are valid and produce no placeholder. Every submitted top-level field must have a definition; undeclared fields fail validation. Duplicate definition keys fail validation. Normalized fields follow definition order rather than submission object enumeration order.

`__proto__`, `constructor`, and `prototype` remain ordinary data keys when supplied. The implementation uses detached null-prototype objects and keyed lookup rather than dynamic object merging.

## 4. Intake limits

The configurable inclusive defaults are:

| Limit | Default |
|---|---:|
| `maxFields` | 100 |
| `maxKeyLength` | 128 Unicode code points |
| `maxLabelLength` | 256 Unicode code points |
| `maxDescriptionLength` | 1,024 Unicode code points |
| `maxFieldBytes` | 65,536 UTF-8 JSON bytes |
| `maxSubmissionBytes` | 262,144 UTF-8 JSON bytes |
| `maxValueDepth` | 8 containers |

String lengths use Unicode code points. Byte limits count the compact JSON representation in UTF-8, including JSON punctuation, escaped keys, and nested values. The root submitted field value container has depth 1; depth 8 is accepted and depth 9 is rejected.

Limit overrides must be positive safe integers. Invalid values such as zero, negatives, fractions, `NaN`, infinity, and unsafe integers fail configuration validation.

## 5. Intake failures

Intake failures use a small stable category set:

- `invalid_configuration`;
- `invalid_submission`;
- `limit_exceeded`.

Error messages are generic and do not include submitted values, serialized source data, or native reflection/serialization details.

## 6. AI-visible analysis input

The internal `src/analysis/input.ts` module defines:

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

`createAnalysisInput(normalized)` iterates `normalized.fields` in their existing definition order and positively includes only fields with resolved `sendToAI === true`. It copies only `key`, `label`, `value`, and a defined `description`.

`AnalysisInput` is internal pipeline data, not the source submission. It contains no `original`, `sensitive`, `sendToAI`, or `includeInOutput` properties and no metadata for hidden fields. Hidden fields are absent rather than redacted. An all-private submission returns `{ fields: [] }`.

Each permitted value is deeply detached into a new JSON-like graph. The projection preserves values, ordering, null-prototype records, suspicious own data keys, `-0`, and hostile-looking text exactly. It does not call an AI or construct prompts.

## 7. Analysis result

The internal `AnalysisResultSchema` is the canonical strict Zod 4 schema for a complete structured pre-call brief:

```ts
type AnalysisResult = {
  summary: string
  clarity: RequestClarity
  facts: Fact[]
  inferences: Inference[]
  assumptions: Assumption[]
  unknowns: Unknown[]
  risks: Risk[]
  discoveryQuestions: DiscoveryQuestion[]
  roadmap: Roadmap
  confidence: AnalysisConfidence
}
```

The root and every nested object reject unknown properties. Required semantic strings reject empty or whitespace-only values while preserving accepted text exactly.

## 8. Request clarity

```ts
type RequestClarity = {
  level: "high" | "medium" | "low"
  reason: string
}
```

`reason` is required and non-blank. No numeric score or additional clarity state is accepted.

## 9. Facts

```ts
type Fact = {
  text: string
  sourceFieldKeys: string[]
}
```

`text` is required and non-blank. `sourceFieldKeys` is required, contains at least one non-blank key, and rejects duplicate raw strings. The schema validates provenance shape, not whether a referenced key exists in the current `AnalysisInput`.

## 10. Inferences

```ts
type Inference = {
  text: string
  confidence: "high" | "medium" | "low"
  reason: string
  basedOnFieldKeys: string[]
  needsValidation?: string
}
```

`text`, `reason`, and `basedOnFieldKeys` are required. Inference provenance contains at least one non-blank unique raw key. `needsValidation` is optional and non-blank when present.

## 11. Assumptions

```ts
type Assumption = {
  text: string
  impact?: "high" | "medium" | "low"
}
```

`text` is required and non-blank. `impact` is optional.

## 12. Unknowns

```ts
type Unknown = {
  text: string
  priority: "critical" | "important" | "minor"
  whyItMatters: string
}
```

All three properties are required. `text` and `whyItMatters` are non-blank.

## 13. Risks

```ts
type Risk = {
  text: string
  reason: string
  severity?: "high" | "medium" | "low"
  needsValidation?: string
}
```

`text` and `reason` are required and non-blank. `severity` and `needsValidation` are optional and validated when present.

## 14. Discovery questions

```ts
type DiscoveryQuestion = {
  question: string
  priority: "critical" | "important" | "secondary"
  reason: string
}
```

All three properties are required and non-blank where textual.

## 15. Roadmap

```ts
type RoadmapPhase = {
  name: string
  purpose: string
}

type Roadmap = {
  status: "available" | "limited" | "insufficient_information"
  note?: string
  phases: RoadmapPhase[]
}
```

`phases` requires at least one strict phase with non-blank `name` and `purpose`. An insufficient-information roadmap can therefore contain only a `Discovery` phase. `note` is optional and non-blank when present.

## 16. Analysis confidence

```ts
type AnalysisConfidence = {
  level: "high" | "medium" | "low" | "insufficient_information"
  reason: string
}
```

`reason` is required and non-blank. Confidence remains qualitative rather than numeric.

`AnalysisResultSchema` is also the source for inferred TypeScript types and converts to provider-facing JSON Schema through Zod 4. It does not validate semantic truth, referenced-key existence, or overall analysis quality.

## 17. AI analysis request

The internal `src/analysis/run.ts` module passes only the privacy-filtered analysis view to an adapter:

```ts
type AIAnalysisRequest = {
  input: AnalysisInput
  signal?: AbortSignal
}
```

No normalized submission, `original`, field-policy metadata, prompt, provider, model, tools, or usage data is part of this request. `AIAdapter.generateAnalysis()` returns `Promise<unknown>` because adapter/provider output is untrusted.

## 18. Analysis execution result

`runAnalysis(adapter, input, signal?)` is the current internal execution boundary:

```ts
type AnalysisExecutionResult =
  | {
      status: "succeeded"
      result: AnalysisResult
    }
  | {
      status: "unavailable"
      code: "no_input" | "adapter_error" | "invalid_output"
    }
```

Empty AI-visible input skips the adapter. An ordinary adapter error or invalid schema output becomes unavailable analysis without raw error/output details, repair, or retry. Caller cancellation propagates rather than becoming fallback. The adapter is invoked at most once, and the succeeded branch contains only the `AnalysisResultSchema`-parsed value.

This is the internal analysis-stage outcome consumed by the composition layer below. It is not itself the reusable `PreCallResult`.

## 19. Processing issues

Conceptually:

```ts
type ProcessingIssue = {
  stage:
    | 'intake'
    | 'analysis'
    | 'rendering'
    | 'attachment'
    | 'delivery'

  code: string
  message: string
}
```

These are future composition concerns; the current `PreCallResult` does not include a generic issues array.

## 20. Processing status

Future processing composition may distinguish success, fallback, and failed operation. The current `PreCallResult` intentionally does not duplicate `analysis.status` with a top-level processing status.

## 21. PreCallResult

The internal `src/result.ts` module now implements the smallest reusable core result:

```ts
type RequestSnapshot = {
  original: Record<string, JsonValue>
  fields: NormalizedField[]
}

type AnalysisState =
  | {
      status: "succeeded"
      result: AnalysisResult
    }
  | {
      status: "unavailable"
      reason: "no_input" | "adapter_error" | "invalid_output"
    }

type PreCallResult = {
  request: RequestSnapshot
  analysis: AnalysisState
}
```

`processNormalizedSubmission(adapter, normalized, signal?)` synchronously creates a detached request snapshot, derives `AnalysisInput` from that snapshot's normalized fields, runs analysis, and maps execution codes to `analysis.reason`. The request is preserved for success, no-input, adapter-error, and invalid-output outcomes. Caller cancellation propagates and returns no result.

The result contains no `AnalysisInput`, provider/model data, metadata, processing status, issues, delivery state, renderer output, or attachment bytes. `RequestSnapshot` owns independent copies of the authoritative source and normalized fields; presentation artifacts apply positive output policy rather than serializing `request.original` directly.

## 22. Deterministic presentation output

The internal `src/presentation/render.ts` module consumes `PreCallResult` without calling AI or performing I/O:

```ts
type RenderedBrief = {
  html: string
  text: string
}
```

`renderPreCallResult()` returns deterministic HTML and plain text with the same fixed section order. It omits empty optional analysis sections and renders direct submitted information only from normalized fields with `includeInOutput === true`. It never serializes `request.original`, provenance arrays, or policy metadata. Client and AI strings are escaped for HTML, and unavailable analysis receives safe fallback wording.

`includeInOutput=false` guarantees direct field omission from the default renderer and attachment. It does not guarantee that free-form AI analysis lacks derived information when that field was deliberately sent to AI.

## 23. Submission attachment

The internal `src/presentation/attachment.ts` module creates a structured output artifact:

```ts
type SubmissionAttachment = {
  filename: "submission.json"
  contentType: "application/json"
  bytes: Uint8Array
}
```

`createSubmissionAttachment(result)` is synchronous, pure, deterministic, and I/O-free. It serializes only output-visible normalized fields as top-level field-key-to-value members in normalized order, with no labels, descriptions, policy metadata, analysis, or `request.original`. The JSON is pretty-printed with two spaces and a trailing newline, then encoded as UTF-8. All-private output produces `{}` plus a trailing newline. Standard JSON serialization represents `-0` as `0`.

The attachment is an output-permitted structured view, not the authoritative source or exact original HTTP bytes. The internal email packager may include it as one logical attachment.

## 24. Delivery remains separate

Delivery state must not become part of `PreCallResult`. The internal delivery boundary consumes a valid result and returns a separate outcome.

```ts
type EmailDeliveryRequest = {
  recipient: string
  email: RenderedEmail
  signal?: AbortSignal
}

interface EmailTransport {
  send(request: EmailDeliveryRequest): Promise<void>
}

type DeliveryOutcome =
  | { status: "sent" }
  | { status: "failed"; reason: "transport_error" }

type DeliverPreCallResultRequest = {
  result: PreCallResult
  recipient: string
  transport: EmailTransport
  email?: EmailPackagingOptions
  signal?: AbortSignal
}
```

The current internal `deliverPreCallResult(transport, recipient, result, emailOptions?, signal?)` validates the trusted recipient, calls `createRenderedEmail(result, emailOptions)`, invokes `transport.send()` exactly once, and returns the separate outcome. It maps ordinary transport failures to `transport_error`, rethrows caller cancellation unchanged, and does not expose provider errors or provider metadata.

Valid recipients are preserved verbatim. Empty/whitespace recipients and recipients containing CR or LF are rejected before packaging or transport. A supplied signal is forwarded by identity; an absent signal is omitted. Successful and unavailable `PreCallResult` values are both deliverable, and delivery does not mutate the result.

## 25. Rendered email

The internal `src/presentation/email.ts` module packages the deterministic presentation artifacts:

```ts
type EmailPackagingOptions = {
  attachRawSubmission?: boolean
}

type RenderedEmail = {
  subject: "Pre-Call Brief"
  html: string
  text: string
  attachments: SubmissionAttachment[]
}
```

`createRenderedEmail(result, options?)` calls `renderPreCallResult()` once and, unless `attachRawSubmission === false`, calls `createSubmissionAttachment()` once. The default and explicit `true` behavior includes exactly one attachment; explicit `false` returns no attachments without changing the subject or bodies. The package contains no recipient, headers, provider, or delivery state and remains internal.

## 26. Public facade contracts

The package root intentionally exposes the configured facade and supported semantic extension-point types, but not low-level pipeline helpers or schemas:

```ts
type PrecallConfig = {
  ai: AIAdapter
  fields: readonly FieldDefinition[]
  limits?: IntakeLimitOverrides
}

type ProcessRequest = {
  submission: unknown
  signal?: AbortSignal
}

type DeliverRequest = {
  result: PreCallResult
  transport: EmailTransport
  recipient: string
  email?: EmailPackagingOptions
  signal?: AbortSignal
}

type SubmitRequest = {
  submission: unknown
  transport: EmailTransport
  recipient: string
  email?: EmailPackagingOptions
  signal?: AbortSignal
}

type SubmitOutcome = {
  result: PreCallResult
  delivery: DeliveryOutcome
}

interface Precall {
  process(request: ProcessRequest): Promise<PreCallResult>
  deliver(request: DeliverRequest): Promise<DeliveryOutcome>
  submit(request: SubmitRequest): Promise<SubmitOutcome>
}

declare function createPrecall(config: PrecallConfig): Precall
```

`createPrecall()` validates trusted configuration and snapshots fields and limits at creation. Each `process()` call validates and detaches its untrusted submission against that snapshot. `deliver()` remains a thin wrapper over the existing delivery boundary. `submit()` explicitly composes `process()` and `deliver()` without adding delivery state to `PreCallResult`; all three operations are safe for concurrent calls.

## 27. Schema philosophy

Prefer:

- required structure for core sections;
- empty arrays when a valid section has no items;
- explicit roadmap insufficiency state;
- optional properties when absence has a clear meaning;
- `unknown` at trust boundaries;
- Zod parsing before values become trusted application types.

Avoid:

- making every property optional to tolerate malformed AI;
- pervasive `null` where absence is enough;
- provider-specific types in domain objects;
- email-specific fields in `PreCallResult`.
