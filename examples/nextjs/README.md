# PreCall · Next.js integration example

A deliberately small Next.js App Router application that consumes `precall` the way an external
consumer does: install the package, import it from a server-side Route Handler, and turn a client
inquiry into an internal pre-call brief.

It is also this repository's production-build compatibility check. `bun run example:build` at the
repository root builds the package and then this example, and CI runs it on every pull request.

## What it demonstrates

- the package boundary an npm consumer gets: only `precall` is imported, never repository source,
  internal modules, or unpublished paths;
- a Next.js Route Handler as the framework boundary, with no Next.js type reaching PreCall;
- untrusted HTTP JSON converted into a structured submission by the application;
- field privacy that stays server-side, including one field withheld from AI and one field kept
  out of the professional-facing brief;
- the whole flow without credentials, an AI provider, or email;
- a production `next build`, with a client bundle that never contains server-side code.

## Request flow

```text
browser form (app/page.tsx)
        │  POST /api/precall { company, projectSummary, … }
        ▼
app/api/precall/route.ts     Route Handler: framework boundary, JSON in / JSON out
        │  projectSubmission(body)   ← untrusted client input, projected onto configured keys
        ▼
lib/precall.ts               trusted server configuration + deterministic adapters
        │  precall.submit({ submission, transport, recipient })
        ▼
precall package              intake validation → field privacy → analysis → brief → delivery
        │
        ▼
JSON response → brief, field policy, and simulated delivery rendered in the browser
```

`precall` never sees `Request`, `NextRequest`, `FormData`, or React state. Converting HTTP input
into a structured submission belongs to this application, and framework-specific code stays here
rather than in the package.

## Run it locally

Bun is the package manager. The example consumes the package from this repository, so the library
build has to exist before the example is installed:

```sh
# from the repository root
bun install
bun run example:prepare   # builds precall, then installs the example's dependencies
cd examples/nextjs
bun run dev               # http://localhost:3000
```

Or prepare and run the production build in one step from the repository root:

```sh
bun run example:build
```

Inside `examples/nextjs`:

| Command           | Purpose                                        |
| ----------------- | ---------------------------------------------- |
| `bun run dev`     | development server                             |
| `bun run build`   | production build, including typechecking       |
| `bun run start`   | serve the production build                     |

`example:prepare` rebuilds the library and reinstalls the example because Bun materializes a path
dependency as files: an existing install would otherwise keep the `dist` it was created from. CI
and a deployment platform use the same two scripts.

## Deterministic boundaries

The default example needs no API keys and makes no network calls.

- **AI**: `createDeterministicAdapter` in `lib/precall.ts` implements the public `AIAdapter`
  interface and returns a rule-based analysis derived from the fields PreCall permitted. It is a
  stand-in with fixed rules, not model quality; PreCall still validates what it returns against its
  analysis contract before it becomes a result.
- **Delivery**: `createCapturingTransport` implements the public `EmailTransport` interface. It
  records the rendered email (subject and attachments) and reports success without sending
  anything.

Both are created per request, so no state is shared between submissions.

## Field policy

The configured fields show two different privacy decisions, and the response makes both visible:

| Field                                               | Sent to AI                                | In professional brief |
| --------------------------------------------------- | ----------------------------------------- | --------------------- |
| company, project summary, goals, budget, timeline   | yes                                       | yes                   |
| contact email (`sensitive: true`)                   | no — retained for the professional to use | yes                   |
| internal note (`includeInOutput: false`)            | yes — used as context                     | no                    |

The result also lists the keys the adapter actually received. Submitting only the contact email
shows the fallback: no permitted field reaches AI, so the analysis is explicitly unavailable while
the inquiry is preserved and the delivery attempt still runs.

## Where PreCall is used

- `lib/precall.ts` — trusted server configuration, both adapters, and the single
  `precall.submit(...)` call. Server-only.
- `app/api/precall/route.ts` — reads the HTTP request, projects the untrusted body onto configured
  keys, calls the module above, and maps `IntakeValidationError` to a `400`.

A Route Handler was chosen over a Server Action because the boundary being proven is a plain HTTP
one: a client that is not a form in this app can call the same endpoint, and JSON in / JSON out
keeps PreCall free of any request-shaped type. The example keeps a single integration rather than
demonstrating two APIs.

## Replacing the demo adapters

Nothing in the example is required by PreCall. A production consumer keeps the same call and swaps
two objects:

```ts
import { createPrecall } from "precall";
import { createLangChainAIAdapter } from "precall/langchain";
import { createResendEmailTransport } from "precall/resend";

const precall = createPrecall({
  ai: createLangChainAIAdapter({ model }), // consumer-owned model instance
  fields: FIELDS,
});

await precall.submit({
  submission,
  transport: createResendEmailTransport({ apiKey, from }),
  recipient, // trusted server configuration
});
```

Credentials, the professional recipient, sender identity, persistence, and abuse controls stay in
the consuming application. This example deliberately has none of them.

One optional environment variable exists for the demo: `PRECALL_EXAMPLE_RECIPIENT` overrides the
placeholder recipient for the simulated delivery. It is read on the server only, and the client can
never influence it.

## Deploy with Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FOkazakee%2FPreCall&root-directory=examples%2Fnextjs&project-name=precall-nextjs-example&repository-name=precall-nextjs-example&install-command=cd%20..%2F..%20%26%26%20bun%20install%20--frozen-lockfile%20%26%26%20bun%20run%20example%3Aprepare)

When connecting the repository manually, use these project settings:

| Setting         | Value                                                          |
| --------------- | -------------------------------------------------------------- |
| Root Directory  | `examples/nextjs`                                              |
| Install Command | `cd ../.. && bun install --frozen-lockfile && bun run example:prepare` |
| Build Command   | `next build` (the framework default)                           |

The install command is required because the package is consumed from this repository: `dist` is
never committed, so the library must be built before the example is installed. The deployment uses
only the public deterministic adapters, so it needs no secrets or paid services. These parameters
come from Vercel's Deploy Button and build-settings documentation and were exercised locally with
the same commands; the button itself has not been run against a live Vercel project from this
repository.

## Consuming the local package

`bunfig.toml` selects Bun's isolated linker for this directory. Bun's default linker materializes a
local directory dependency as a directory of per-file symlinks, which Turbopack will not read as a
package boundary; the isolated linker installs it pnpm-style as a directory link over real files,
so the example resolves `precall` exactly like a consumer that installed it from the registry.
`next.config.ts` points Turbopack's resolution root and the production file trace at the repository
root for the same reason.

## Runtime expectations

This example is not published and has no runtime contract of its own. It declares the stricter of
the two floors: PreCall requires Node.js `>= 22.14.0`, Next.js 16 requires `>= 20.9.0`, so the
example targets Node.js `>= 22.14.0`. Example-only dependencies are Next.js 16.3.4, React 19.3.0,
and TypeScript 5.9; see `package.json` and `bun.lock` in this directory.

## Links

- [PreCall repository](https://github.com/Okazakee/PreCall)
- [PreCall README](https://github.com/Okazakee/PreCall#readme)
- [Reference documentation](https://github.com/Okazakee/PreCall/tree/main/docs)
