# PreCall

PreCall is an early-stage service-intake library intended for open-source development. The intake foundation, privacy-filtered AI input, strict analysis schema, internal fake-adapter execution, reusable core result composition, deterministic brief rendering, output-permitted submission JSON artifact, and deterministic internal email packaging are implemented; email transport and later phases are not. The permanent name, package identity, and license remain unsettled.

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

The repository has completed bootstrap, intake normalization, privacy-filtered analysis input, strict analysis schema, fake-adapter analysis execution, reusable result composition, deterministic internal HTML/plain-text rendering, output-permitted submission JSON artifact, and deterministic email packaging. No email is actually sent yet; no email transport or real AI provider exists yet. Continue with the documented email-transport milestone.
