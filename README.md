# PreCall

PreCall is an early-stage service-intake library intended for open-source development. The package now exposes a minimal public `createPrecall()` facade with `process()` and `deliver()` methods, backed by the intake, privacy-filtered AI, result, deterministic email, and provider-neutral transport boundaries. No real AI or email provider exists; the permanent name, package identity, and license remain unsettled.

## Documentation

- [Reference documentation](docs/README.md)
- [Stable product principles](docs/PRODUCT.md)
- [Current project state](docs/PROJECT_STATE.md)

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

`ai` and `transport` are consumer-supplied semantic adapters. The package validates and snapshots trusted field/limit configuration at creation, preserves the submitted request in `PreCallResult`, and keeps delivery outcome separate. The package remains private and includes no real provider integration.

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

The repository has completed bootstrap, intake normalization, privacy-filtered analysis input, strict analysis schema, fake-adapter analysis execution, reusable result composition, deterministic internal HTML/plain-text rendering, output-permitted submission JSON artifact, deterministic email packaging, provider-neutral delivery orchestration, the public facade, fake-backed consumer coverage, and packed Node/Bun/declaration verification. No real AI or email provider exists yet. Continue with the documented Pi/provider compatibility spike.
