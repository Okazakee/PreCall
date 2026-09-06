<div align="center">
  <h1>PreCall</h1>
  <p><strong>Turn inquiries into better discovery calls.</strong></p>
  <p>
    <a href="https://www.npmjs.com/package/precall"><img src="https://img.shields.io/npm/v/precall?label=npm" alt="npm version"></a>
    <a href="https://github.com/Okazakee/PreCall/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/Okazakee/PreCall/ci.yml?branch=main&label=CI" alt="CI status"></a>
    <a href="https://github.com/Okazakee/PreCall/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-3DB8FF" alt="Apache-2.0 license"></a>
  </p>
</div>

PreCall takes a structured client inquiry, sends only the fields you explicitly allow to AI, turns the analysis into an internal pre-call brief, and can email that brief to the professional.

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

AI prepares the human. It does not quote, sell, estimate, create a client-facing proposal, or replace the discovery call.

## Install

PreCall `0.1.0` is available as the stable `precall` package:

```sh
npm install precall
```

The package is ESM-only and supports Node.js `22.14.0+` and Bun `1.3.14+`.

## Quick start

The normal path uses the optional LangChain adapter and Resend transport. Provider credentials, sender configuration, and the professional recipient are application configuration; keep them outside the submitted client data.

```sh
npm install precall @langchain/core @langchain/openai langsmith
```

```ts
import { ChatOpenAI } from "@langchain/openai";
import { createPrecall } from "precall";
import { createLangChainAIAdapter } from "precall/langchain";
import { createResendEmailTransport } from "precall/resend";

const openAIKey = process.env.OPENAI_API_KEY;
const resendKey = process.env.RESEND_API_KEY;
const recipient = process.env.PRECALL_RECIPIENT;
if (openAIKey === undefined || resendKey === undefined || recipient === undefined) {
  throw new Error("Missing server configuration");
}

const model = new ChatOpenAI({
  apiKey: openAIKey,
  model: "gpt-4o-mini",
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

`outcome.result` is a reusable `PreCallResult` containing the detached request snapshot and either a validated structured analysis or an explicit unavailable state. `outcome.delivery` is a separate `DeliveryOutcome` with `{ status: "sent" }` or `{ status: "failed", reason: "transport_error" }`.

AI output is accepted only after strict validation. An adapter exception or invalid analysis becomes unavailable analysis; it does not erase the request or prevent the email attempt. A transport error remains a delivery failure and is not silently replaced with another transport.

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

- [`precall/langchain`](src/langchain.ts) adapts a consumer-owned LangChain model with one structured invocation. It does not browse, use tools, quote, estimate, or replace discovery.
- [`precall/resend`](src/resend.ts) sends the existing rendered email through Resend's fixed API endpoint. It adds no Resend SDK dependency to the core package.

The consumer owns the form, validation around its endpoint, trusted recipient, credentials, storage, and abuse controls. PreCall owns intake validation, field-policy enforcement, AI-output validation, deterministic fallback presentation, and provider-neutral delivery semantics.

## Development

```sh
bun install
bun run check
bun run release:check
```

`bun run check` runs the repository contract, formatting and lint checks, typechecking, tests, build, and packed-package verification. Release checks are credential-free and do not publish, create tags, or create GitHub Releases.

See the [reference documentation](docs/README.md), [architecture](docs/ARCHITECTURE.md), [security model](docs/SECURITY.md), and [release policy](docs/RELEASING.md) for deeper implementation and trust-boundary details.
