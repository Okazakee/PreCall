# PreCall

PreCall is an early-stage service-intake library intended for open-source development. The package exposes a minimal provider-neutral `createPrecall()` facade with `process()` and `deliver()` methods, backed by intake, privacy-filtered analysis, reusable results, deterministic email packaging, and provider-neutral delivery.

## Documentation

- [Reference documentation](docs/README.md)
- [Stable product principles](docs/PRODUCT.md)
- [Current project state](docs/PROJECT_STATE.md)
- [AI integration decision](docs/AI.md)

## Usage

```ts
import { createPrecall } from "precall";

const precall = createPrecall({
  ai,
  fields,
  limits,
});

const result = await precall.process({
  submission,
});

const delivery = await precall.deliver({
  result,
  transport,
  recipient: "professional@example.com",
});
```

`ai` and `transport` are consumer-supplied semantic adapters. The package validates and snapshots trusted field/limit configuration at creation, preserves the submitted request in `PreCallResult`, and keeps delivery outcome separate. A custom `AIAdapter` remains supported.

### Optional LangChain integration

The optional `./langchain` subpath adapts a consumer-owned LangChain model instance. Install compatible optional `@langchain/core` and `langsmith` peers, configure the provider/model in the consuming application, and keep credentials outside PreCall:

```ts
import { createPrecall } from "precall";
import { createLangChainAIAdapter } from "precall/langchain";

const ai = createLangChainAIAdapter({ model });
const precall = createPrecall({ ai, fields });
const result = await precall.process({ submission });
```

The adapter performs one structured model operation using the canonical PreCall analysis schema. It does not browse, execute tools, quote, estimate, or replace discovery. The root package remains usable without installing LangChain.

## Development

Bun is used for package management and tooling.

Install dependencies with:

```sh
bun install
```

Verified package scripts:

```sh
bun run format:check
bun run lint:ci
bun run typecheck
bun run test
bun run build
bun run check
```

The repository has completed bootstrap, intake normalization, privacy-filtered analysis input, strict analysis schema, fake-adapter analysis execution, reusable result composition, deterministic rendering/email packaging, provider-neutral delivery orchestration, the public facade, packed Node/Bun/declaration verification, the LangChain model-layer bake-off, the optional LangChain adapter, offline integration coverage, and the opt-in live AI harness. No real email provider exists yet. The next milestone is the first real email provider adapter and opt-in email harness.
