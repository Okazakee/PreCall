# PreCall

PreCall is an early/bootstrap-stage service-intake library intended for open-source development. The repository is being prepared for implementation; its current scope and decisions live in the reference documentation. The permanent name, package identity, and license remain unsettled.

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

The repository is still at bootstrap stage; run commands as implementation lands.
