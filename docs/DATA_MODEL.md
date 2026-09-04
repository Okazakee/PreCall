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

Working conceptual shape:

```ts
type AnalysisResult = {
  summary: string

  clarity: {
    level: 'high' | 'medium' | 'low'
    reason: string
  }

  facts: Fact[]
  inferences: Inference[]
  assumptions: Assumption[]
  unknowns: Unknown[]
  risks: Risk[]
  discoveryQuestions: DiscoveryQuestion[]

  roadmap: Roadmap

  confidence: {
    level: 'high' | 'medium' | 'low' | 'insufficient_information'
    reason: string
  }
}
```

Zod should be the source of truth for the runtime schema and TypeScript type.

## 8. Facts

Facts should preserve traceability to client input.

Conceptually:

```ts
type Fact = {
  text: string
  sourceFieldKeys: string[]
}
```

A client-stated fact should not exist without a source basis.

This does not guarantee semantic truth, but it forces the output to maintain provenance rather than producing unsupported fact-like prose.

## 9. Inferences

Conceptually:

```ts
type Inference = {
  text: string
  confidence: 'high' | 'medium' | 'low'
  reason: string
  basedOnFieldKeys?: string[]
  needsValidation?: string
}
```

Inferences must never be rendered as client-stated facts.

## 10. Assumptions

Keep assumptions comparatively simple:

```ts
type Assumption = {
  text: string
  impact?: 'high' | 'medium' | 'low'
}
```

Do not over-model every section.

## 11. Unknowns

Conceptually:

```ts
type Unknown = {
  text: string
  priority: 'critical' | 'important' | 'minor'
  whyItMatters?: string
}
```

Priority is important because not all missing information deserves equal attention.

## 12. Discovery questions

Conceptually:

```ts
type DiscoveryQuestion = {
  question: string
  priority: 'critical' | 'important' | 'secondary'
  reason?: string
}
```

Avoid fragile permanent references to array indexes in v0.

If cross-references later become genuinely valuable, introduce stable IDs then.

## 13. Risks

Conceptually:

```ts
type Risk = {
  text: string
  severity?: 'high' | 'medium' | 'low'
  reason: string
  needsValidation?: string
}
```

The reason should normally be required so the model cannot fill the section with generic risk labels.

## 14. Roadmap

Conceptually:

```ts
type RoadmapPhase = {
  name: string
  purpose: string
}

type Roadmap = {
  status: 'available' | 'limited' | 'insufficient_information'
  note?: string
  phases: RoadmapPhase[]
}
```

A vague request may validly return only:

```text
status: insufficient_information
phase: Discovery
```

The schema must not force false implementation detail.

## 15. Analysis state

MVP simplification:

```ts
type AnalysisState =
  | {
      status: 'succeeded'
      result: AnalysisResult
    }
  | {
      status: 'unavailable'
      issues: ProcessingIssue[]
    }
```

A generic partial-result framework is deferred.

If the model output fails the required schema, analysis becomes unavailable.

## 16. Processing issues

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

## 17. Processing status

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

## 18. PreCallResult

Working name only; the product name is not settled.

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

## 19. Delivery remains separate

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

## 20. Rendered email

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

## 21. Schema philosophy

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
