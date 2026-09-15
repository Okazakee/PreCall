<div align="center">
  <h1>PreCall</h1>
  <p><strong>Turn inquiries into better discovery calls.</strong></p>
  <p>
    <a href="https://www.npmjs.com/package/precall"><img src="https://img.shields.io/npm/v/precall?label=npm" alt="npm version"></a>
    <a href="https://github.com/Okazakee/PreCall/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/Okazakee/PreCall/ci.yml?branch=main&label=CI" alt="CI status"></a>
    <a href="https://github.com/Okazakee/PreCall/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-3DB8FF" alt="Apache-2.0 license"></a>
  </p>
</div>

PreCall takes a structured client inquiry, sends only the fields you explicitly allow to AI, turns the analysis into an internal pre-call brief, and can email that brief to the professional. When enabled, it may also add a clearly preliminary internal cost range for professional review.

If AI is unavailable, the inquiry is not lost. The accepted request remains preserved, a fallback brief can still be rendered, and delivery can still be attempted.

```text
client form
    ↓
PreCall
    ↓
AI-assisted pre-call brief
    ↓
your inbox
```

```text
AI unavailable
    ↓
original inquiry preserved
    ↓
fallback brief/email still usable
```

AI prepares the human. It never quotes, sells, or produces a client-facing proposal; when the consumer enables it, AI may produce a clearly preliminary internal cost range for the professional, but it does not replace the discovery call.

## Install

PreCall is published to npm as the stable `precall` package. Bun is the recommended package manager and runtime for this project:

```sh
bun add precall
```

npm, pnpm, and yarn can also install the npm package. Node.js `22.14.0+` is supported for compatibility; Bun `1.3.14+` is the primary runtime path.

## Quick start

One concrete setup uses the optional LangChain adapter and Resend transport. The root library remains provider-neutral, and custom `AIAdapter` and `EmailTransport` implementations are supported. Provider credentials, sender configuration, and the professional recipient are application configuration; keep them outside the submitted client data.

```sh
bun add precall @langchain/core @langchain/openai langsmith
```

```ts
import { ChatOpenAI } from "@langchain/openai";
import { createPrecall } from "precall";
import { createLangChainAIAdapter } from "precall/langchain";
import { createResendEmailTransport } from "precall/resend";

const openAIKey = process.env.OPENAI_API_KEY;
const resendKey = process.env.RESEND_API_KEY;
const modelName = process.env.OPENAI_MODEL;
const recipient = process.env.PRECALL_RECIPIENT;
if (
  openAIKey === undefined ||
  resendKey === undefined ||
  modelName === undefined ||
  recipient === undefined
) {
  throw new Error("Missing server configuration");
}

const model = new ChatOpenAI({
  apiKey: openAIKey,
  model: modelName,
  maxRetries: 0,
  configuration: { baseURL: "https://api.openai.com/v1" },
});

const precall = createPrecall({
  ai: createLangChainAIAdapter({ model }),
  fields: [
    {
      key: "email",
      label: "Email",
      sendToAI: false,
      includeInOutput: true,
    },
    {
      key: "project",
      label: "Project",
      sendToAI: true,
      includeInOutput: true,
    },
    {
      key: "budget",
      label: "Budget",
      sendToAI: true,
      includeInOutput: true,
    },
  ],
  costEstimation: { currency: "EUR" },
});

const transport = createResendEmailTransport({
  apiKey: resendKey,
  from: "briefs@example.com",
});
const formData = {
  email: "client@example.com",
  project: "A booking workflow for a small studio",
  budget: "Around €15k",
};

const outcome = await precall.submit({
  submission: formData,
  transport,
  recipient,
});

if (outcome.delivery.status === "failed") {
  // Keep outcome.result for application-owned handling or later delivery.
  throw new Error("The pre-call brief could not be delivered");
}

const { result } = outcome;
```

Only fields explicitly permitted with `sendToAI: true` cross the AI boundary. A field can be visible in the professional output while remaining hidden from AI, as with `email` above. Use `includeInOutput: false` for submitted values that must not appear in the default brief or `submission.json` attachment.

### What the result contains

`outcome.result` is a reusable `PreCallResult` containing the detached request snapshot, a
validated structured analysis or an explicit unavailable state, and — when enabled — a
`costEstimate`. The estimate is either an itemized preliminary range, an explicit
`insufficient_information` state, or an unavailable state. Omitting `costEstimation` preserves the
analysis-only behavior and leaves the property absent. `outcome.delivery` is a separate
`DeliveryOutcome` with `{ status: "sent" }` or `{ status: "failed", reason: "transport_error" }`.

AI output is accepted only after strict validation. An adapter exception or invalid analysis
becomes unavailable analysis; a malformed optional estimate is isolated from a valid analysis. It
does not erase the request or prevent the email attempt. A transport error remains a delivery
failure and is not silently replaced with another transport.

### Advanced custom analysis sections

The normal `createPrecall({ ai, fields })` flow is unchanged. Advanced consumers may opt into a
narrow `analysis.sections` configuration with a stable key, trusted title and instructions, and a
Zod 4 schema for one additional JSON-compatible result. All enabled analysis remains one AI
operation; section candidates are validated independently, and unavailable sections never erase the
request or canonical analysis. This is not a plugin registry, agent loop, tools/research system,
per-section model call, retry mechanism, or arbitrary rendering callback.

```ts
import { z } from "zod";

const precall = createPrecall({
  ai,
  fields,
  analysis: {
    sections: [
      {
        key: "shortTake",
        title: "Short take",
        instructions: "Give one concise paragraph about this opportunity.",
        schema: z.string(),
      },
    ],
  },
});
```

Titles are trusted presentation metadata and section instructions are trusted application
configuration. Only the privacy-filtered `AnalysisInput` reaches the adapter. See the normative
architecture and security documents for the validation, snapshot, and rendering boundaries.

More copyable recipes — a custom `AIAdapter`, a custom `EmailTransport`, privacy flags, cost
estimation, and custom sections — live in [`docs/RECIPES.md`](docs/RECIPES.md).

## What can I customize?

PreCall owns the intake-to-brief boundaries, but your application owns the form, endpoint, credentials, storage, and business context.

### Configure directly

`createPrecall()` lets you configure:

- form field definitions and labels;
- which fields may go to AI with `sendToAI`;
- which fields may appear in the brief and `submission.json` with `includeInOutput`;
- sensitive-field policy;
- intake limits;
- optional preliminary cost estimation with a trusted three-letter currency;
- optional schema-defined custom analysis sections with `analysis.sections`;
- the AI implementation through `AIAdapter`;
- the delivery implementation through `EmailTransport`;
- the trusted delivery recipient;
- whether the output-permitted submission attachment is included.

### Replace integrations

LangChain and Resend are ready-made optional integrations, not required architecture. A custom adapter means a small object that connects PreCall to a service your application owns.

For example, this is a consumer-owned AI service call, not a PreCall API:

```ts
import { createPrecall, type AIAdapter } from "precall";

const ai: AIAdapter = {
  async generateAnalysis({ input, signal }) {
    // Placeholder consumer code: call your own AI service here.
    return myAIService.analyze(input, { signal });
  },
};

const precall = createPrecall({
  ai,
  fields,
});
```

PreCall validates the submission first, applies field privacy, and gives the adapter only the permitted `AnalysisInput`. The adapter may use any model, provider, or service the application owns and returns an unknown candidate. PreCall validates the canonical analysis and, when enabled, the optional cost candidate independently. An adapter that returns only the base analysis remains compatible; adapter failure becomes the existing explicit no-AI fallback.

A custom email transport receives the rendered email and only needs to deliver it:

```ts
import type { EmailTransport } from "precall";

const transport: EmailTransport = {
  async send({ recipient, email, signal }) {
    // Placeholder consumer code: call your own email provider here.
    await myEmailProvider.send({
      to: recipient,
      subject: email.subject,
      html: email.html,
      text: email.text,
      signal,
    });
  },
};
```

PreCall has already created the HTML/text brief and permitted submission attachment. Resend is one included option; a custom transport can connect Postmark, SES, an internal mail service, or another provider without changing the PreCall core.

### What is not configurable yet?

PreCall does **not** currently expose first-class configuration for:

- custom canonical system prompts or arbitrary canonical analysis instructions;
- pricing strategy, hourly/day/fixed-price rules, minimum project size, rates, margins, uncertainty
  buffers, or foreign-exchange conversion;
- research strategy;
- modular/custom analysis skills or per-skill models;
- AI tool, agent, or multi-step workflows.

Preliminary cost estimation is implemented as an opt-in internal enrichment, but it is not a
configurable pricing engine. The built-in LangChain adapter performs PreCall's standard analysis
and, when enabled, the preliminary estimate; a custom `AIAdapter` can technically implement
different model behavior, but it is primarily the provider/execution boundary—not the intended
place to combine provider integration, all business rules, prompt policy, and analysis semantics.

Budget decision support beyond this narrow preliminary estimate and modular analysis skills are
planned capabilities, but their configuration APIs are not settled. A future design may combine
deterministic professional rules, the existing intake/result, AI reasoning where appropriate, and
explicit uncertainty while remaining decision support rather than automatic quotation.

```text
Future concept — not current API
```

```ts
createPrecall({
  ai,
  fields,
  // Future concept only — not implemented:
  skills: {
    budget: {
      // professional-specific rules/configuration
    },
  },
});
```

### Capability map

| Need | Today |
| --- | --- |
| Control what AI sees | `fields[].sendToAI` |
| Control what appears in output | `fields[].includeInOutput` |
| Change AI provider/model | LangChain model or custom `AIAdapter` |
| Change email provider | Resend or custom `EmailTransport` |
| Change recipient | `submit()` / `deliver()` |
| Change intake limits | `createPrecall({ limits })` |
| Change attachment behavior | `email.attachRawSubmission` |
| Add schema-defined analysis sections | `createPrecall({ analysis: { sections } })` |
| Custom canonical prompt/instructions | Not first-class yet |
| Preliminary cost estimation | `createPrecall({ costEstimation: { currency } })` |
| Pricing strategy, rates, margins, or FX | Not implemented yet |
| Research | Not implemented yet |
| Custom analysis skills | Not implemented yet |

## Use the lower-level API

`submit()` is the shortest process-and-deliver path. Use `process()` and `deliver()` separately when you need to inspect or store the result, render or package it differently, or deliver it later:

```ts
import { createPrecall } from "precall";

const precall = createPrecall({ ai, fields, limits });

const result = await precall.process({
  submission,
});

const delivery = await precall.deliver({
  result,
  transport,
  recipient: "professional@example.com",
});
```

`process()` remains processing-only. `deliver()` remains delivery-only. `submit()` is an explicit convenience method that composes those two existing operations; it does not merge delivery state into `PreCallResult`.

## AI and delivery integrations

The root package is provider-neutral. Implement `AIAdapter` and `EmailTransport` yourself, or use the optional integrations:

- [`precall/langchain`](src/langchain.ts) adapts a consumer-owned LangChain model with one structured invocation. It does not browse, search, or use tools; when enabled, it may produce the internal preliminary cost estimate, and it never produces a quote or replaces discovery.
- [`precall/resend`](src/resend.ts) sends the existing rendered email through Resend's fixed API endpoint. It adds no Resend SDK dependency to the core package.

The consumer owns the form, validation around its endpoint, trusted recipient, credentials, storage, and abuse controls. PreCall owns intake validation, field-policy enforcement, AI-output validation, deterministic fallback presentation, and provider-neutral delivery semantics.

## Framework example

[`examples/nextjs`](examples/nextjs) is a small App Router application that consumes the package from this repository, calls `precall.submit()` from a Route Handler, and doubles as the repository's production `next build` check (`bun run example:build`, also run in CI). It uses deterministic local adapters, so it runs without credentials, provider calls, or email.

Framework-specific code belongs to the consuming application; the example adds no framework coupling to the core.

## Development

```sh
bun install
bun run check
bun run release:check
```

`bun run check` runs the repository contract, formatting and lint checks, typechecking, tests, build, and packed-package verification. Release checks are credential-free and do not publish, create tags, or create GitHub Releases.

Contributors can build a local, gitignored code map for navigation with `npx -y @nanonets/graft@0.18.0 build`; coding-agent conventions live in [`AGENTS.md`](AGENTS.md).

See the [reference documentation](docs/README.md), [architecture](docs/ARCHITECTURE.md), [security model](docs/SECURITY.md), and [release policy](docs/RELEASING.md) for deeper implementation and trust-boundary details.
