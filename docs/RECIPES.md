# Recipes

Concise, copyable recipes for integrating `precall`. Every TypeScript block below is a complete
module that `bun run recipes:check` compiles against the public API, so a copied snippet is a
snippet the types accept. The pieces only your application can own — credentials, the provider
call, the mail transport — appear as `declare` statements to keep each recipe focused.

```sh
bun add precall
```

Provider integrations stay optional: install `@langchain/core`, `langsmith`, and a provider package
only if you use the LangChain adapter, and nothing extra for the Resend transport.

## 1. Smallest flow: `createPrecall()` + `process()`

`process()` handles intake validation, privacy filtering, one AI operation, and the reusable result.
It never delivers anything.

```ts
import type { AIAdapter } from "precall";
import { createPrecall } from "precall";

// Your model integration — see recipe 3 for a complete AIAdapter.
declare const ai: AIAdapter;

const precall = createPrecall({
  ai,
  fields: [{ key: "message", label: "What do you need?" }],
});

const result = await precall.process({
  submission: { message: "We need a booking workflow for a small studio." },
});

// The authoritative submission is preserved whether or not AI produced anything.
const asked = result.request.original["message"];

if (result.analysis.status === "succeeded") {
  const { summary, unknowns, discoveryQuestions } = result.analysis.result;
  console.log(summary, unknowns.length, discoveryQuestions.length, asked);
} else {
  // "no_input" | "adapter_error" | "invalid_output"
  console.log(result.analysis.reason, asked);
}
```

## 2. `submit()` with the LangChain adapter and Resend transport

`submit()` is `process()` followed by `deliver()`. Keep credentials, the sender address, and the
professional recipient in server-side application configuration, never in submitted client data.

```sh
bun add @langchain/core @langchain/openai langsmith
```

```ts
import { ChatOpenAI } from "@langchain/openai";
import { createPrecall } from "precall";
import { createLangChainAIAdapter } from "precall/langchain";
import { createResendEmailTransport } from "precall/resend";

const openAiKey = process.env.OPENAI_API_KEY;
const resendKey = process.env.RESEND_API_KEY;
const recipient = process.env.PRECALL_RECIPIENT;
if (openAiKey === undefined || resendKey === undefined || recipient === undefined) {
  throw new Error("Missing server configuration");
}

const model = new ChatOpenAI({ apiKey: openAiKey, model: "gpt-4o-mini", maxRetries: 0 });
const transport = createResendEmailTransport({
  apiKey: resendKey,
  from: "briefs@example.com",
});

const precall = createPrecall({
  ai: createLangChainAIAdapter({ model }),
  fields: [
    { key: "email", label: "Email", sendToAI: false, includeInOutput: true },
    { key: "project", label: "Project", sendToAI: true, includeInOutput: true },
  ],
});

const outcome = await precall.submit({
  submission: { email: "client@example.com", project: "A booking workflow" },
  transport,
  recipient,
});

if (outcome.delivery.status === "failed") {
  // Keep outcome.result for application-owned handling or a later delivery attempt.
  console.log(outcome.delivery.reason, outcome.result.analysis.status);
}
```

## 3. Custom `AIAdapter`

An adapter is a small object you own: it receives the privacy-filtered input (only `sendToAI: true`
fields exist here), the optional caller signal, and the enabled extension configuration. It returns
an untrusted candidate — PreCall validates it afterwards, so a provider error or malformed output
degrades to explicit unavailable states instead of throwing.

```ts
import type { AIAdapter } from "precall";

/** Replace this with the provider or service your application owns. */
declare function callYourModel(body: string, options: { signal?: AbortSignal }): Promise<unknown>;

const ai: AIAdapter = {
  async generateAnalysis({ input, signal, costEstimation, analysis }) {
    const body = JSON.stringify({
      fields: input.fields.map((field) => ({
        key: field.key,
        label: field.label,
        value: field.value,
      })),
      currency: costEstimation?.currency ?? null,
      sections:
        analysis?.sections.map(({ key, instructions, outputSchema }) => ({
          key,
          instructions,
          outputSchema,
        })) ?? [],
    });

    const options: { signal?: AbortSignal } = {};
    if (signal !== undefined) options.signal = signal;
    return callYourModel(body, options);
  },
};
```

## 4. Custom `EmailTransport`

A transport is one method. Return normally for success; a thrown error becomes the existing
`{ status: "failed", reason: "transport_error" }` delivery outcome and never discards the result.

Forward the optional caller `AbortSignal` to the provider call whenever the provider supports
cancellation, so a cancelled request stops the underlying send rather than only the PreCall step.
PreCall still observes the caller's signal at its own boundary, so an aborted delivery surfaces as
cancellation instead of a delivery failure.

```ts
import type { EmailTransport, SubmissionAttachment } from "precall";

/** Replace this with the mail provider your application owns. */
declare function sendEmail(
  message: {
    to: string;
    subject: string;
    html: string;
    text: string;
    attachments: readonly SubmissionAttachment[];
  },
  options: { signal?: AbortSignal },
): Promise<void>;

const transport: EmailTransport = {
  async send({ recipient, email, signal }) {
    const options: { signal?: AbortSignal } = {};
    if (signal !== undefined) options.signal = signal;
    await sendEmail(
      {
        to: recipient,
        subject: email.subject,
        html: email.html,
        text: email.text,
        attachments: email.attachments,
      },
      options,
    );
  },
};
```

`createPrecall({ ai, fields })` stays the default: a custom adapter and transport replace the
ready-made integrations without changing the rest of the pipeline.

## 5. Privacy: `sendToAI` versus `includeInOutput`

The two flags answer two different questions and resolve independently. `sendToAI` decides which
fields exist at the AI boundary: a field denied to AI is omitted from the adapter input entirely
rather than redacted, masked, or replaced with a placeholder. `includeInOutput` decides what the
professional-facing brief and the `submission.json` attachment may show. Each flag has its own
default — both resolve to `true` — and `sensitive: true` only defaults `sendToAI` to `false`; it
never changes `includeInOutput`, which stays independently controlled.

```ts
import type { AIAdapter } from "precall";
import { createPrecall } from "precall";

declare const ai: AIAdapter;

const precall = createPrecall({
  ai,
  fields: [
    // Sent to AI, shown to the professional.
    { key: "project", label: "Project", sendToAI: true, includeInOutput: true },
    // Shown to the professional, never sent to AI.
    { key: "email", label: "Email", sendToAI: false, includeInOutput: true },
    // Internal only: kept in the preserved request, sent nowhere.
    { key: "internalRef", label: "Internal reference", sendToAI: false, includeInOutput: false },
  ],
});

const result = await precall.process({
  submission: {
    project: "A booking workflow",
    email: "client@example.com",
    internalRef: "CRM-421",
  },
});

// The preserved request always keeps the authoritative submission.
console.log(Object.keys(result.request.original).length);
// The adapter only ever sees the annotated input; hidden fields are absent by construction.
console.log(
  result.request.fields.filter((field) => field.sendToAI).map((field) => field.key),
);
```

## 6. Optional cost estimation

`costEstimation: { currency }` adds one core-owned preliminary cost range to the same AI operation.
The currency is trusted configuration, amounts are whole units, and the total is always summed by
PreCall from the validated items. Omitting the configuration leaves `costEstimate` absent.

```ts
import type { AIAdapter } from "precall";
import { createPrecall } from "precall";

declare const ai: AIAdapter;

const precall = createPrecall({
  ai,
  fields: [{ key: "message", label: "Message" }],
  costEstimation: { currency: "EUR" },
});

const result = await precall.process({
  submission: { message: "A booking workflow, budget around 15k" },
});

const estimate = result.costEstimate;
if (estimate?.status === "estimated") {
  console.log(`${estimate.currency} ${estimate.total.minAmount}–${estimate.total.maxAmount}`);
  for (const item of estimate.items) console.log(item.name, item.minAmount, item.maxAmount);
} else if (estimate?.status === "insufficient_information") {
  console.log(estimate.reason, estimate.missingInformation);
} else if (estimate !== undefined) {
  // "no_input" | "adapter_error" | "invalid_output" | "not_provided"
  console.log(estimate.reason);
}
```

The estimate is internal decision support for the professional, never a quote or client-facing
proposal, and `insufficient_information` is a valid outcome rather than a failure.

## 7. Minimal custom `analysis.sections`

Sections extend the same single AI operation with trusted instructions and your own Zod 4 result
shape. Each candidate is validated independently, so one unusable section cannot erase the canonical
analysis, the cost estimate, or a sibling section. This is a narrow configuration seam, not a plugin
system: no per-section model call, tools, retries, or render hooks.

```ts
import { z } from "zod";
import type { AIAdapter } from "precall";
import { createPrecall } from "precall";

declare const ai: AIAdapter;

const precall = createPrecall({
  ai,
  fields: [{ key: "message", label: "Message" }],
  analysis: {
    sections: [
      {
        key: "budgetFit",
        title: "Budget fit",
        instructions:
          "Assess whether the stated budget appears compatible with the likely work. Do not quote a price.",
        schema: z.object({
          status: z.enum(["compatible", "uncertain", "incompatible"]),
          reason: z.string(),
        }),
      },
    ],
  },
});

const result = await precall.process({
  submission: { message: "A booking workflow, budget around 15k" },
});

const budgetFit = result.sections?.["budgetFit"];
if (budgetFit?.status === "succeeded") {
  console.log(budgetFit.title, budgetFit.value);
} else if (budgetFit !== undefined) {
  // "no_input" | "adapter_error" | "invalid_output" | "not_provided"
  console.log(budgetFit.title, budgetFit.reason);
}
```

Configured keys must be unique and must not collide with canonical result members; the section
`title` is trusted presentation metadata, and the rendered brief escapes every value.

## Where to go next

- [README](../README.md) — the basic flow, the result shape, and what PreCall does not do.
- [ARCHITECTURE](ARCHITECTURE.md) — one AI operation, independent validation, deterministic
  rendering.
- [SECURITY](SECURITY.md) — the normative core/consumer responsibility split and trust boundaries.
- [DATA_MODEL](DATA_MODEL.md) — result types, states, and invariants.
