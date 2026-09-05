# Security and Privacy

## Core principle

All externally supplied content is untrusted.

This includes:

- client field values;
- client-controlled field names where accepted;
- URLs;
- AI output;
- future researched webpages;
- future integration payloads.

Structural validation does **not** make semantic content trusted.

**Valid data is not trusted data.**

## Trust boundary

```text
TRUSTED
application configuration
field policy
AI adapter selection
recipient
limits
renderer rules
trusted analysis instructions

UNTRUSTED
client submission
AI output
future research content
```

The public API should enforce this distinction by construction.
The public facade enforces the same separation by construction:

- `createPrecall()` accepts trusted application configuration;
- `process()` accepts only the untrusted submission payload;
- field definitions and limits are validated and snapshotted at creation;
- later caller mutation cannot change privacy policy or intake limits;
- each call owns independent normalized/result state;
- `deliver()` accepts its recipient and transport explicitly.

The package root does not export normalizers, projection builders, schemas, renderers, packagers, or delivery helpers that could bypass these boundaries. `AIAdapter` output remains `unknown` until strict core validation.

## Threat/owner split

### Prompt injection in client text

Owner: **core**

Requirements:

- client instructions remain data;
- trusted instructions remain outside submission content;
- forbidden fields are filtered deterministically before AI;
- model output is schema-validated;
- model output does not gain tool or system privileges it does not need.

Do not rely on regex blocklists such as detecting "ignore previous instructions."

### Malformed or oversized input

Owner: **core**

Use Zod/runtime validation and configurable conservative limits.

Validate before expensive AI processing.

### Sensitive fields reaching AI

Owner: **core**

Apply field-level policy before the adapter is called.

The adapter receives only permitted analysis input.

### HTML injection in the default email

Owner: **default renderer**

Both client text and AI text must be escaped before insertion into HTML.

AI should not return final trusted HTML markup.

### HTML injection in consumer custom UI/template

Owner: **consumer**, once they replace the safe default renderer.

Documentation should clearly state that AI/client strings remain untrusted.

### Email header / CRLF injection

Owner: **email destination/transport boundary**

Recipient and headers should come from trusted configuration.

Do not use arbitrary client text as raw email headers.
The implemented internal delivery boundary validates the explicit trusted recipient before packaging or transport:

- empty or whitespace-only recipients are rejected;
- recipients containing CR or LF are rejected;
- valid recipients are preserved verbatim;
- recipients are never derived from client submission fields;
- the fixed package subject and attachment filename remain library-controlled;
- ordinary transport errors are converted to a stable failure outcome without exposing raw errors;
- caller cancellation is rethrown unchanged rather than converted to transport failure.

The transport receives only the explicit recipient, `RenderedEmail`, and an optional caller `AbortSignal`. It is attempted once; provider, credential, retry, queue, and logging behavior remain outside this internal boundary.

### Attachment filename injection

Owner: **renderer/destination**

Prefer a fixed library-controlled filename such as `submission.json`.

Do not derive arbitrary filenames from client input.

### Spam, bots, CAPTCHA, IP throttling

Primarily owner: **consuming application/public endpoint**

The core should not become a universal anti-abuse platform.

The core still owns:

- structural validation;
- request limits;
- AI/cost boundaries;
- safe failure behavior.

### CSRF/origin protection

Owner: **consuming application**

### Consumer database injection

Owner: **consuming application**

The MVP core has no database.

### Command injection

Core rule:

- do not shell raw client data;
- avoid subprocess usage for request processing.

### SSRF

Not currently applicable to MVP because research is deferred.

Future research subsystem must explicitly validate fetch destinations and handle SSRF risk.

### Prompt injection from researched pages

Deferred with research, but the same untrusted-content principle applies.

## Field privacy model

Three concepts must remain distinct:

### `sensitive`

Signals privacy/data-minimization concern.

It should influence safe defaults for AI exposure.

### `sendToAI`

Controls whether the field is included in the AI analysis view.

### `includeInOutput`

Controls whether the field may appear in professional-facing outputs such as:

- HTML email;
- plain-text email;
- output-permitted `submission.json` attachment.

Example:

```ts
{
  key: 'email',
  sensitive: true,
  sendToAI: false,
  includeInOutput: true
}
```

is valid and useful.

## Implemented AI-visible boundary

The implemented trust-boundary flow is:

```text
NormalizedSubmission.fields
→ positive sendToAI === true allowlist
→ detached AnalysisInput
```

Only normalized fields may cross this boundary. The projection never reads or filters `NormalizedSubmission.original`. Hidden fields are absent completely, not redacted, so their keys, labels, descriptions, values, and privacy flags do not enter the AI-visible payload.

`sensitive` supplies a default policy but is not the final filter. Explicit `sendToAI` controls exposure, and `includeInOutput` remains a separate future output policy. A field with `sensitive=true` and explicit `sendToAI=true` is included; a field with `sendToAI=false` is excluded.

The projected JSON-like values are detached from authoritative intake, preventing mutation in a future adapter from changing normalized fields or the preserved source snapshot. Permitted prompt-like text remains unchanged as untrusted data. This projection is data authorization only and does not claim model-level prompt-injection resistance.

## Composed-result snapshot integrity

`processNormalizedSubmission()` creates one detached operation snapshot before awaiting the adapter. Both the request preserved in `PreCallResult` and the AI-visible `AnalysisInput` derive from that snapshot. Caller mutation during asynchronous adapter work cannot make the preserved request and analysis basis describe different states.

The snapshot keeps the authoritative source and normalized fields as independent owned copies. The result does not retain the intermediate `AnalysisInput`, raw adapter output, provider errors, or provider metadata.

## Structured AI output validation

AI-generated structured output remains untrusted until it passes the strict internal `AnalysisResultSchema`. The schema rejects unknown structure, malformed enums, missing provenance, whitespace-only semantic strings, and unsupported provider metadata. This establishes structural validity, not factual truth or prompt-injection immunity.

The internal `runAnalysis()` boundary accepts only the schema-parsed value as succeeded. Malformed output becomes `invalid_output` without exposing raw output, repair, or retry. Ordinary adapter exceptions become `adapter_error` without exposing provider error details.

Empty AI-visible input produces `no_input` without an adapter call. Caller cancellation is checked before invocation, forwarded unchanged, and rechecked after adapter execution and output parsing; it propagates rather than becoming fallback.

## Default renderer guarantees

The internal default renderer:

- escapes client strings before inserting them into HTML;
- escapes AI strings before inserting them into HTML;
- uses positive `includeInOutput === true` allowlisting for direct source presentation;
- never directly renders `request.original`;
- omits hidden fields rather than adding redaction placeholders;
- omits provenance and policy metadata from the brief;
- renders successful and unavailable results without exposing raw provider errors or malformed output.

`includeInOutput=false` guarantees direct field omission from the default renderer and submission attachment. If the same field is deliberately sent to AI, AI-generated free-form analysis may still be influenced by it. Strong non-disclosure from AI-derived output requires preventing that data from reaching AI; the renderer and packager do not provide semantic taint tracking or redaction.

## Submission attachment guarantees

The internal submission attachment:

- uses a positive `includeInOutput === true` allowlist over normalized fields;
- never serializes `request.original`;
- contains only field keys and submitted values;
- omits hidden fields completely rather than redacting them;
- safely handles arbitrary keys including `__proto__`, `constructor`, and `prototype`;
- uses the fixed filename `submission.json`;
- uses the fixed content type `application/json`;
- produces UTF-8 JSON bytes;
- contains no analysis, policy metadata, email headers, provider data, or filesystem output.

The artifact is an output-permitted structured view, not exact original HTTP bytes or the authoritative internal source.

## Logical email packaging boundary

The internal package:

- uses the fixed subject `Pre-Call Brief` with no untrusted interpolation;
- reuses renderer-owned HTML/text, so body escaping remains the renderer's responsibility;
- reuses the attachment builder, so output privacy remains the attachment builder's responsibility;
- contains no recipient, `to`, `from`, `replyTo`, `cc`, `bcc`, general headers, provider metadata, or delivery state.

Recipient and header handling belong to the future trusted transport boundary. A future transport must not infer the professional recipient from client-submitted email fields.

## Raw source versus output-safe source view

The authoritative original submission should remain preserved.

Professional-facing output may intentionally omit fields.

Therefore:

```text
authoritative original source
→ preserved internally

output-safe source view
→ email body
→ submission.json
```

The email attachment should not override explicit output privacy rules.

## Data minimization

Do not send fields to an AI provider unless they are needed and permitted.

Do not send the entire raw object merely because it is convenient.

This principle also applies to future:

- research providers;
- logging;
- telemetry;
- hosted services.

## Prompt-injection architecture

Minimum defense-in-depth:

1. validate structure;
2. apply field privacy deterministically;
3. construct a clearly separated data payload;
4. keep trusted task instructions outside submission content;
5. tell the model submission text is untrusted data;
6. request structured output;
7. validate output with Zod;
8. give the AI no unnecessary tools or privileges;
9. escape output at presentation sinks.


## AI output is untrusted

Even after successful model generation:

- strings may contain markup;
- claims may be incorrect;
- fields may be semantically misclassified.

Runtime schema validation establishes structure, not factual truth.

The professional remains the final reviewer.

## Cost protection

The intake boundary already enforces field count and structured UTF-8 byte limits before future AI processing:

- 100 fields;
- 65,536 UTF-8 JSON bytes per value;
- 262,144 UTF-8 JSON bytes per submission.

Future AI-specific limits may include:

- output token caps;
- timeout;
- maximum attempts.

Do not build a general quota platform into the core.

## Failure behavior

At the current analysis-execution boundary:

- expected adapter failure degrades to `adapter_error`;
- unusable adapter output degrades to `invalid_output`;
- empty AI-visible input returns `no_input` without a model call;
- caller cancellation remains cancellation and is not converted to unavailable analysis.

The adapter is attempted at most once. No raw provider exception, malformed output, or provider metadata enters the execution result. Later composition should degrade the complete intake to raw fallback without fabricating successful analysis.

## Logging guidance

Not yet part of the library contract.

When logging is introduced, avoid logging:

- full raw submissions by default;
- secrets;
- unnecessarily sensitive fields;
- provider credentials.

The consumer or future hosted product should define retention and redaction policy explicitly.

## Future hosted-service considerations

Deferred, but any hosted version will need explicit decisions about:

- data retention;
- deletion;
- logs;
- PII;
- provider data policies;
- stored reports;
- team permissions;
- managed credentials.

Do not make compliance or legal claims without sufficient verified basis.
