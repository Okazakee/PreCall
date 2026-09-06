# Product

## Purpose

This project is an open-source AI-assisted service-intake engine for professionals who receive project or service inquiries from potential clients.

Its primary job is to transform a raw or incomplete inquiry into a structured **internal pre-call brief** so the professional enters discovery better prepared.

The permanent product name is **PreCall**.

## Core principle

**AI prepares the human. It does not replace the human.**

The first output is an internal decision-support artifact. It is not a final proposal, binding scope, guaranteed estimate, quotation, or commitment to perform work.

The expected flow is:

```text
client inquiry
→ safe intake
→ optional AI enrichment
→ structured pre-call brief
→ professional review
→ discovery call
→ assumptions validated
→ clearer scope/pricing/proposal later
```

## What the product should help with

A useful pre-call brief should help the professional understand:

- what the client actually stated;
- what the system inferred;
- what is only assumed;
- what important information is missing;
- what risks or complexity drivers are visible;
- what a plausible early execution path might look like;
- what should be validated during discovery;
- which discovery questions have the highest value;
- how mature or vague the request currently is;
- how confident the current understanding should be.

Later capabilities may add focused research, budget decision support, complexity analysis, or other modular analysis.

## What the product is not

Do not let the core drift into becoming:

- an autonomous sales agent;
- a replacement for discovery calls;
- an automatic quotation engine;
- a guaranteed estimator;
- a generic CRM;
- a generic form builder;
- a generic AI agent framework;
- a generic deep-research system;
- a system that autonomously commits the professional to scope, price, or timeline.

Integrations with CRMs, messaging systems, dashboards, or hosted services may exist later, but they do not redefine the core product.

## Original request is authoritative

The client's original submission must remain available and must never be replaced by AI interpretation.

The system should clearly distinguish:

### Client-stated facts

Information explicitly provided by the client.

### External research

Information retrieved from external sources.

### Derived understanding

Reasonable interpretation based on known information.

### Assumptions

Possible interpretations that are not confirmed.

### Estimates

Preliminary guesses about price, effort, complexity, timeline, or similar matters.

### Unknowns

Important information that cannot currently be determined.

AI-generated interpretation must never silently become client-stated fact.

## Uncertainty is a valid output

The system must prefer explicit uncertainty over false precision.

Valid conclusions include:

> Not enough information to determine this reliably.

or:

> A meaningful implementation roadmap cannot be established yet; the immediate phase is discovery.

Confidence should be qualitative and explained. It is not a scientific probability score.

## Request maturity

The system must adapt to how well-defined the request is.

### Detailed request

Organize, challenge, identify gaps, and prepare validation questions.

### Partial request

Cautiously infer likely requirements while clearly exposing assumptions and unknowns.

### Very vague request

Shift away from solution design and toward discovery preparation. Do not manufacture a feature set or technical architecture.

**The less the client knows, the more the brief should shift from solution analysis toward discovery preparation.**

## Dynamic input

The consuming application owns its form.

The core must accept arbitrary/custom fields rather than requiring one universal contact form or business domain.

Field metadata may describe:

- field key;
- human-readable label;
- description;
- whether it may be sent to AI;
- whether it may appear in professional-facing outputs;
- whether it is sensitive.

## Privacy and data minimization

Fields unnecessary for analysis should not be sent to an AI provider.

Sensitive information must not automatically leave the consumer's application merely because it was present in the form.

AI visibility and output visibility are separate concerns.

For example, a contact email can reasonably be hidden from AI while still being visible to the professional receiving the brief.

## Graceful degradation

Optional intelligence must not become a single point of failure for intake.

A valid request must survive when AI fails.

The final fallback is:

**no AI processing.**

AI failure should reduce enrichment quality, not destroy or hide the inquiry.

Research, budget analysis, PDF rendering, or other future optional stages should follow the same principle.

## Reusable structured result

Processing should produce one reusable structured result.

Presentation and delivery consume that result rather than rerunning analysis.

The same result may later feed:

- HTML email;
- plain-text email;
- PDF;
- Slack;
- Teams;
- Discord;
- CRM;
- webhook;
- dashboard;
- consumer-owned storage;
- custom destinations.

Email is the first built-in destination, not the data model.

## Storage

Persistence primarily belongs to the consuming application.

The core should not require a database or prescribe PostgreSQL, Supabase, SQLite, or any other storage system.

## Research

Research is optional.

It should happen only when external information materially improves preparation for the client conversation.

Research must remain opportunity-focused and distinguish sourced external facts from inference.

Externally retrieved content is untrusted data and may contain prompt injection.

## Budget

Budget analysis is future decision support, not a quotation.

The core must not impose one universal pricing method.

Professionals may use hourly, daily, fixed-price, retainer, minimum engagement, margin, urgency premium, uncertainty buffer, discovery fee, or custom pricing rules.

If information is insufficient, the product should say so rather than manufacture a number.

## Skills

Analysis capabilities may eventually be modularized into skills such as:

- summarization;
- requirement extraction;
- assumptions and unknowns;
- risk analysis;
- discovery-question generation;
- roadmap generation;
- research;
- budget evaluation;
- complexity or suitability analysis.

The concept is retained, but a generic plugin ecosystem is **not an MVP requirement**.

## Open-source direction

The core is intended to be open source and genuinely useful on its own.

A likely later business direction is:

**open-source core + optional hosted convenience service.**

The license and hosted-service details are not yet settled.

## Security philosophy

Treat:

- client submissions;
- field names and values;
- URLs;
- AI outputs;
- externally researched content

as untrusted data.

Prompt injection is possible.

Security should also account for:

- oversized payloads;
- AI cost amplification;
- spam and automated abuse;
- unsafe HTML rendering;
- credential exposure;
- insecure integrations;
- unnecessary PII exposure.

Public-endpoint controls such as CAPTCHA, IP throttling, CSRF/origin handling, and surrounding application storage security primarily belong to the consuming application.

## Developer-experience principle

Keep the core modular but understandable.

Prefer useful defaults and narrow interfaces.

Preserve future extensibility when it is cheap and sensible, but do not add abstractions solely for hypothetical use cases.

## Concise definition

**An open-source service-intake engine that turns raw client inquiries into uncertainty-aware internal pre-call briefs while preserving the original request and degrading safely when optional AI processing fails.**
