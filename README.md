# PreCall

PreCall is an early-stage service-intake library intended for open-source development. The intake foundation is implemented; AI analysis, delivery, and other later phases are not. The permanent name, package identity, and license remain unsettled.

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

The repository has completed bootstrap and intake normalization; continue with the documented next phase rather than assuming AI processing is available.
