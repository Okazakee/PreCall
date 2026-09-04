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
- raw source attachment.

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

No individual step is treated as a complete prompt-injection solution.

## AI output is untrusted

Even after successful model generation:

- strings may contain markup;
- claims may be incorrect;
- fields may be semantically misclassified.

Runtime schema validation establishes structure, not factual truth.

The professional remains the final reviewer.

## Cost protection

Exact numeric limits are not yet fixed, but MVP should support conservative defaults for:

- number of fields;
- field size;
- total submission size.

Future AI-specific limits may include:

- output token caps;
- timeout;
- maximum attempts.

Do not build a general quota platform into the core.

## Failure behavior

Expected AI failure should degrade to raw fallback.

Security controls should not turn a valid inquiry into a fabricated "successful analysis."

If a core invariant cannot be maintained, return a real operation failure instead of hiding the problem.

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
