# Data Model

This document describes the current conceptual model. Exact property names may still change during implementation, but the semantic boundaries are settled.

## 1. Field definition

A consumer describes each relevant form field.

Conceptually:

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

### Default policy

Working defaults:

- `sensitive = false`;
- `includeInOutput = true`;
- `sendToAI = !sensitive` unless explicitly overridden.

`sendToAI` and `includeInOutput` are different concerns.

Example:

```ts
{
  key: 'email',
  label: 'Email',
  sensitive: true,
  sendToAI: false,
  includeInOutput: true
}
```

means:

- AI: hidden;
- professional-facing brief: visible;
- permitted raw attachment: visible.

## 2. Original source versus normalized representation

The original client submission remains authoritative and preserved.

Internally, dynamic fields should be normalized rather than repeatedly merged into arbitrary objects.

Preferred conceptual representation:

```ts
type SubmissionField = {
  key: string
  label: string
  value: unknown
  description?: string
  sendToAI: boolean
  includeInOutput: boolean
  sensitive: boolean
}
```

and:

```ts
type NormalizedSubmission = {
  fields: SubmissionField[]
}
```

Why an array?

- arbitrary field names remain data rather than internal object structure;
- easier deterministic filtering;
- easier handling of suspicious keys such as `__proto__`;
- clear policy metadata travels with each value.

The normalized representation does not replace the untouched source.

## 3. Analysis result

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

## 4. Facts

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

## 5. Inferences

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

## 6. Assumptions

Keep assumptions comparatively simple:

```ts
type Assumption = {
  text: string
  impact?: 'high' | 'medium' | 'low'
}
```

Do not over-model every section.

## 7. Unknowns

Conceptually:

```ts
type Unknown = {
  text: string
  priority: 'critical' | 'important' | 'minor'
  whyItMatters?: string
}
```

Priority is important because not all missing information deserves equal attention.

## 8. Discovery questions

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

## 9. Risks

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

## 10. Roadmap

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

## 11. Analysis state

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

## 12. Processing issues

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

## 13. Processing status

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

## 14. PreCallResult

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

## 15. Delivery remains separate

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

## 16. Rendered email

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

## 17. Schema philosophy

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
