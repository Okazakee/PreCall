# Data Model

This document describes the current implemented intake and AI-visible projection models alongside the conceptual future analysis model. The intake and projection APIs remain internal while the package is still establishing its intentional public processing API.

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

This is an internal analysis-stage outcome, not the future `PreCallResult`; source preservation, composition, rendering, and delivery remain separate work.

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

Keep `code` extensible rather than defining every possible provider failure before implementation.

## 20. Processing status

Working conceptual status:

```ts
type ProcessingStatus =
  | 'succeeded'
  | 'fallback'
  | 'failed'
```

`fallback` is distinct from `failed`.

Example:

```text
valid submission
AI unavailable
raw fallback created
```

is a fallback, not a failed intake.

## 21. PreCallResult

Working name only; the product name is not settled.
The future composition layer may wrap `AnalysisExecutionResult` with preserved source and processing metadata as an `AnalysisState`; that composed state is not implemented in this slice.

Conceptually:

```ts
type PreCallResult = {
  request: {
    original: unknown
    fields: SubmissionField[]
  }

  analysis: AnalysisState

  processing: {
    status: ProcessingStatus
    issues: ProcessingIssue[]
  }

  metadata: {
    id: string
    receivedAt: string
    processedAt: string
    version: string
  }
}
```

The exact metadata format may be adjusted during implementation.

## 22. Delivery remains separate

A delivery result should not become part of the core domain result.

Conceptually:

```ts
type DeliveryOutcome =
  | {
      status: 'succeeded'
      providerId?: string
    }
  | {
      status: 'partial'
      issues: ProcessingIssue[]
    }
  | {
      status: 'failed'
      issues: ProcessingIssue[]
    }
```

A processing result can therefore survive an email-provider failure.

## 23. Rendered email

Conceptually:

```ts
type RenderedEmail = {
  subject: string
  html: string
  text: string
  attachments: EmailAttachment[]
}
```

The exact attachment byte representation should be chosen for runtime portability during implementation.

## 24. Schema philosophy

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
