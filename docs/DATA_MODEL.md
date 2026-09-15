# Data Model

This document describes the conceptual data model of PreCall — the shape of the data as it moves
from untrusted submission to delivered brief — together with the invariants that model must hold.

It intentionally does not restate exact TypeScript shapes, field-by-field. Those live in source
and are best read through the implementation:

| Area | Source of truth |
| --- | --- |
| Field definitions, limits, and their schemas | `src/intake/schema.ts` |
| Normalization and source preservation | `src/intake/normalize.ts` |
| AI-visible projection | `src/analysis/input.ts` |
| Analysis result contract | `src/analysis/result.ts` |
| Analysis execution boundary | `src/analysis/run.ts` |
| Cost-estimate configuration and result contract | `src/cost/config.ts`, `src/cost/result.ts` |
| Presentation, attachment, email packaging | `src/presentation/` |
| Delivery boundary | `src/delivery.ts` |
| Public facade contracts | `src/precall.ts`, `src/index.ts` |

## 1. Field definition and resolved policy

Each configured field declares a `key`, a `label`, an optional `description`, and optional
`sensitive`, `sendToAI`, and `includeInOutput` flags. Definitions are strict: unknown properties
are rejected, `key` must be non-empty, `label` must contain non-whitespace content, and there is
no `required` concept.

Resolution is deterministic and never rewrites configured strings:

| Flag | Default | Meaning |
| --- | --- | --- |
| `sensitive` | `false` | Signals a privacy/data-minimization concern |
| `includeInOutput` | `true` | May appear in professional-facing output |
| `sendToAI` | `!sensitive` | May enter the AI analysis view |

Explicit values always override the defaults. A sensitive field is therefore hidden from AI by
default while remaining in professional output unless it is explicitly configured otherwise. The
three flags are independent: privacy for AI and visibility in output are separate decisions.

## 2. Submitted values

Submissions are JSON-like structured data only: `null`, strings, booleans, finite numbers,
standard arrays, and plain objects (including null-prototype objects).

Rejected: accessors, non-enumerable or symbol properties, sparse or augmented arrays, class
instances, `Date`, `Map`, `Set`, regular expressions, functions, `undefined`, `bigint`, symbols,
non-finite numbers, cycles, and over-depth structures.

Runtime validation establishes structure, not semantic trust. Submitted text remains untrusted
data regardless of how well-formed it is.

## 3. Source snapshot and normalized representation

Normalization takes the configured field definitions and a non-empty top-level submission and
produces two things: a detached snapshot of the authoritative source data, and the normalized
fields that the rest of the pipeline consumes.

Invariants:

- only submitted fields appear in the normalized set; a configured-but-absent field is valid and
  produces no placeholder;
- every submitted top-level field must have a definition, and duplicate definition keys are
  rejected;
- normalized order follows field-definition order, not submission enumeration order;
- `__proto__`, `constructor`, and `prototype` are ordinary data keys;
- both the source snapshot and the normalized values are detached — later caller mutation cannot
  change them, and normalization does not mutate caller input or definitions;
- the snapshot is a detached copy of the structured submission, not the original HTTP bytes.

## 4. Intake limits

Limits are inclusive and configurable:

| Limit | Default |
| --- | --- |
| `maxFields` | 100 |
| `maxKeyLength` | 128 Unicode code points |
| `maxLabelLength` | 256 Unicode code points |
| `maxDescriptionLength` | 1,024 Unicode code points |
| `maxFieldBytes` | 65,536 UTF-8 JSON bytes |
| `maxSubmissionBytes` | 262,144 UTF-8 JSON bytes |
| `maxValueDepth` | 8 containers |

String lengths count Unicode code points. Byte limits count the compact JSON representation in
UTF-8, including punctuation, escaped keys, and nested values. The root submitted value container
is depth 1, so depth 8 is accepted and depth 9 is rejected.

Limit overrides must be positive safe integers; zero, negatives, fractions, `NaN`, infinity, and
unsafe integers fail configuration validation.

## 5. Intake failures

Failures use a small stable category set: `invalid_configuration`, `invalid_submission`, and
`limit_exceeded`. Messages are generic and never include submitted values, serialized source data,
or native reflection details.

## 6. AI-visible view

The AI receives a projection, never the submission: a list of permitted fields carrying only
`key`, `label`, `value`, and a `description` when one is defined.

Invariants:

- inclusion is a positive allowlist over resolved `sendToAI === true`, evaluated in
  field-definition order;
- hidden fields are absent rather than redacted — no keys, labels, descriptions, values, or
  "hidden field" metadata for them;
- policy metadata (`sensitive`, `sendToAI`, `includeInOutput`) never enters the projection, and
  the authoritative source object is never used as the projection source;
- permitted values are deeply detached into a new JSON-like graph;
- an all-private submission yields an empty field list without error;
- hostile-looking client text is preserved exactly as data; this boundary is not prompt-injection
  sanitization.

## 7. Analysis result contract

Analysis output is a single strict structured result with these semantic sections: `summary`,
`clarity`, `facts`, `inferences`, `assumptions`, `unknowns`, `risks`, `discoveryQuestions`,
`roadmap`, and `confidence`.

Invariants:

- unknown properties are rejected at the root and at every nested level;
- semantic strings are required and non-blank, while preserving accepted text exactly;
- facts and inferences each carry required, non-empty, duplicate-free provenance arrays;
- analysis sections other than roadmap phases may be empty; the schema never forces invented
  content;
- roadmap requires at least one phase with a non-blank name and purpose, and supports an explicit
  insufficient-information state;
- clarity, confidence, and other judgements are qualitative enums with a required explained
  reason — never a numeric score or false precision;
- the contract validates structure, not semantic truth, referenced-field existence, or analysis
  quality.

Runtime validation is owned by Zod, which is also the source for inferred types and
provider-facing JSON Schema conversion.

## 8. Result composition

The reusable result pairs the preserved request with the analysis state: either a schema-parsed
successful analysis, or an explicit unavailable reason (`no_input`, `adapter_error`, or
`invalid_output`).

Invariants:

- the request survives every analysis outcome, including failure;
- the preserved request and the AI-visible input derive from the same operation snapshot, taken
  before the asynchronous adapter boundary, so caller mutation during analysis cannot make them
  describe different states;
- the result carries no intermediate AI input, provider or model data, processing status, issues,
  renderer output, or delivery state;
- caller cancellation propagates and produces no result.

## 9. Cost-estimate enrichment

Cost estimation is an optional enrichment of the reusable result. When disabled, `PreCallResult`
has no `costEstimate` property. When enabled, the property is always an explicit state:
`estimated`, `insufficient_information`, or `unavailable`.

The adapter returns an untrusted candidate. Its strict contract has no `total` and no `currency`;
the core attaches the snapshotted configured currency and computes the total by summing the
validated item amounts. Provider-supplied totals are never trusted.

Invariants:

- estimated amounts are whole, non-negative integers, and every item satisfies
  `minAmount <= maxAmount`;
- an `estimated` candidate contains at least one item; an `insufficient_information` candidate
  contains at least one non-blank `missingInformation` entry;
- every candidate object is strict and unknown properties are rejected;
- malformed estimate output becomes an unavailable `invalid_output` state without invalidating a
  valid base analysis;
- unavailable uses the existing provider-neutral reasons (`no_input`, `adapter_error`, and
  `invalid_output`) plus `not_provided` when an enabled adapter returns only the base analysis;
- provider errors and malformed candidate details are not retained or exposed.

The estimate's item names, reasons, rationale, assumptions, and confidence reason remain
semantic presentation data, not trusted facts. Exact schemas and derived types live in
`src/cost/config.ts` and `src/cost/result.ts`.

## 10. Presentation, attachment, and email packaging

These are separate, destination-neutral derivations of the same result. Presentation and
packaging are deterministic, synchronous, I/O-free, and do not call AI.

Invariants:

- direct source presentation and the structured submission artifact both derive from normalized
  fields by positive `includeInOutput === true` allowlisting, in normalized order, and never from
  the preserved source object;
- the submission artifact contains field keys and values only — no labels, descriptions, policy
  metadata, analysis, or provenance — with fixed filename and content type, and `{}` plus a
  trailing newline when nothing is output-visible;
- HTML output escapes client and AI strings before insertion;
- email packaging fixes the subject, reuses the rendered bodies, and includes at most the one
  existing submission artifact; it contains no recipient, headers, provider, or delivery state;
- output privacy is a direct-output guarantee only. A field deliberately sent to AI may still be
  reflected in free-form AI text; strong non-disclosure requires excluding it from AI input.

## 11. Delivery

Delivery consumes a valid result and returns a separate outcome; delivery state never becomes
part of the reusable result.

Invariants:

- the recipient is explicit trusted application input; valid recipients are preserved verbatim,
  while empty/whitespace and CR/LF-containing recipients are rejected before packaging or
  transport;
- the transport is invoked exactly once, and ordinary transport errors map to a minimal,
  provider-neutral failure reason without exposing provider errors or metadata;
- caller cancellation propagates unchanged instead of becoming a delivery failure;
- successful and unavailable analyses are both deliverable, and delivery does not mutate the
  result.

## 12. Schema philosophy

Prefer:

- required structure for core sections;
- empty arrays when a valid section has no items;
- an explicit insufficiency state rather than invented content;
- optional properties when absence has a clear meaning;
- `unknown` at trust boundaries, validated before values become trusted application types;
- conceptual separation between the reusable result and any destination-specific artifact.

Avoid:

- making every property optional to tolerate malformed AI output;
- pervasive `null` where absence is enough;
- provider-specific types in domain objects;
- destination- or provider-specific fields in the reusable result.

## 13. Custom analysis section states

When configured, each section has an explicit reusable state in declaration order. A successful
state carries its snapshotted trusted title and detached JSON value; an unavailable state exposes
only `no_input`, `adapter_error`, `invalid_output`, or `not_provided`. Section candidates are
independently Zod-validated and cannot invalidate canonical analysis, cost estimation, or other
sections. With no configured sections, `PreCallResult` has no `sections` property.
