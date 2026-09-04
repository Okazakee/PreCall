# PreCall

PreCall is an early-stage service-intake library intended for open-source development. The intake foundation, privacy-filtered AI input, strict analysis schema, internal fake-adapter execution, and reusable core result composition are implemented; rendering, delivery, and later phases are not. The permanent name, package identity, and license remain unsettled.

## Documentation

- [Reference documentation](docs/README.md)
- [Stable product principles](docs/PRODUCT.md)
- [Current project state](docs/PROJECT_STATE.md)

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

The repository has completed bootstrap, intake normalization, privacy-filtered analysis input, strict analysis schema, fake-adapter analysis execution, reusable result composition, and deterministic internal HTML/plain-text rendering. No real AI provider, email transport, or raw attachment integration exists yet; continue with the documented raw-attachment milestone.
