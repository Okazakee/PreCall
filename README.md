# PreCall

PreCall is a provider-neutral service-intake library. It exposes a minimal `createPrecall()` facade with `process()` and `deliver()` methods, backed by intake validation, privacy-filtered analysis, reusable results, deterministic email packaging, and provider-neutral delivery.

The public package is **`precall`**, version **`0.1.0`**. The bootstrap **`precall@0.1.0-bootstrap.0`** has been published under the `bootstrap` dist-tag; final `precall@0.1.0` remains unpublished. npm also assigned `latest` to the bootstrap and that unintended tag must be corrected before final release. The historical scoped bootstrap **`@okazakee/precall@0.1.0-bootstrap.0`** is registry history only and must not be mutated.

## Requirements and installation

- Node.js **22.14.0 or newer**;
- Bun **1.3.14 or newer** (also the development package manager);
- ESM only (`type: module`), with no CommonJS entrypoint.

After publication, install it with:

```sh
npm install precall
```

Until then, use the repository checkout and `bun install` for development.

## Usage

```ts
import { createPrecall } from "precall";

const precall = createPrecall({ ai, fields, limits });
const result = await precall.process({ submission });
const delivery = await precall.deliver({
  result,
  transport,
  recipient: "professional@example.com",
});
```

`ai` and `transport` are consumer-supplied semantic adapters. The package validates and snapshots trusted field/limit configuration at creation, preserves the submitted request in `PreCallResult`, and keeps delivery outcome separate from processing. If AI enrichment is unavailable, the result remains usable with an explicit no-AI fallback; delivery failures are reported independently.

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

### Optional Resend email integration

The optional `./resend` subpath provides the first built-in `EmailTransport`. Configure the trusted sender and API key in application configuration; do not derive either from client submissions:

```ts
import { createResendEmailTransport } from "precall/resend";

const transport = createResendEmailTransport({
  apiKey,
  from: "briefs@example.com",
});

await precall.deliver({
  result,
  transport,
  recipient: "professional@example.com",
});
```

The transport uses one fixed Resend API request and reuses the existing rendered HTML, text, and permitted `submission.json` attachment. Custom `EmailTransport` implementations remain supported; the Resend SDK is not a package dependency.

## Development and release checks

Bun is used for package management and tooling:

```sh
bun install
bun run check
```

The package contract packs the actual npm artifact and checks metadata, Apache-2.0 licensing, all generated runtime/declaration files, clean Node/Bun consumers, optional subpaths, and NodeNext declarations. Release validation is credential-free:

```sh
bun run release:check
bun run release:dry-run
```

`release:dry-run` builds and inspects one npm-generated tarball, then runs npm's real `npm publish <tarball> --dry-run --ignore-scripts --access public --provenance` command with an empty temporary npm user config. It never publishes, creates a tag, or creates a GitHub Release. Actual publication is limited to the tag-triggered OIDC workflow after npm trusted-publisher setup.

See [reference documentation](docs/README.md), [releasing](docs/RELEASING.md), and [security](docs/SECURITY.md) for the complete contract.
