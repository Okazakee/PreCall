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

## Developer playground

`app/playground` is a local development workbench for PreCall. It replaces ad-hoc terminal scripts:
configure a model, build an arbitrary dummy intake, run the real library, and inspect exactly what
happened. It is developer tooling, not a product — no accounts, no database, no run history, no
deployment story.

It is **localhost only**, enforced by the network boundary rather than by a header: the example's
`dev` and `start` scripts bind Next.js to `127.0.0.1` (`next dev|start --hostname 127.0.0.1`), so the
workbench is not reachable from another host at all. On top of that, every playground route refuses a
request whose `Host` or `Origin` is not a genuine loopback name, which is defense in depth for
browser-shaped attacks that would still arrive over loopback (cross-origin requests, DNS rebinding).
That header check is not authentication and must not be treated as the boundary.

```sh
# from the repository root
bun run example:prepare
cd examples/nextjs && bun run dev
# http://127.0.0.1:3000/playground
```

### Execution modes

- **Deterministic fake** (default): rule-based adapter in the Next.js process. No network call, no
  credential, milliseconds per run. Use it for UI, renderer, and privacy-filter development.
- **Live configured model**: the saved provider is called through the public `precall/langchain`
  adapter. The page warns that the dummy intake leaves the machine, and the run fails with a clear
  configuration error if nothing is configured — live mode never silently falls back to fake mode.

### Model configuration

The workbench writes `.precall-playground/config.json` at the repository root (gitignored, written
with `0600` where the platform supports it). Fields: provider (`openai-compatible`), base URL, API
key, model id, plus three advanced escape hatches — API surface (`chat-completions` or
`responses`), structured-output method (`functionCalling` or `jsonSchema`), and extra request
headers. A provider that needs none of them configures none of them; there is no provider registry.

Any OpenAI-compatible endpoint works: a hosted gateway, a local server such as llama.cpp or Ollama,
or a vendor whose OpenAI-compatible path lives at a different base URL.

The base URL is validated as a credential destination, not as an arbitrary URL:

- embedded credentials, query strings, and fragments are rejected, and the rejected value is never
  echoed back;
- plain `http://` is accepted only for loopback hosts (`127.0.0.1`, `localhost`, `::1`), because the
  bearer credential would otherwise travel unencrypted — a remote provider must use `https://`;
- an empty API-key field retains the stored key **only while the provider origin (scheme, hostname,
  and port) is unchanged**. Changing the host, the port, or `https` → `http` requires a new key, so
  a saved credential can never be silently sent to a different provider.

`Fetch models` calls the provider's `/models` endpoint with the stored key, server-side. A provider
without `/models` produces a non-fatal note, and manual model-id entry is always available.

The API key is sent to the localhost server when you press *Save configuration*. After that it stays
server-side: the config `GET` returns provider, base URL, model, and whether a key is stored — never
the key — and no key is written to the page, the result payload, diagnostics, or logs.

### Dummy intake builder

The primary interface is a form builder, not a JSON blob: add and remove fields, and edit each
field's key, label, value, `sensitive`, `sendToAI`, and `includeInOutput`. Five fixtures populate it
as a starting point (detailed, vague, contradictory, prompt injection, privacy canary), and the
result is editable immediately. A "use PreCall defaults" switch omits the flags entirely so PreCall
resolves them itself (`sendToAI` follows `sensitive`). Raw JSON stays available as an advanced
option for the submission body.

### Inspection

Six tabs after a run: **Brief** (summary, clarity, facts, inferences, assumptions, unknowns, risks,
discovery questions, roadmap, confidence, cost, sections), **Email preview** (the real deterministic
renderer's HTML in a sandboxed frame, its text version, and the `submission.json` attachment),
**Structured result** (the complete `PreCallResult`), **Original request** (the authoritative
submission plus the resolved per-field policy), **AI input** (exactly the fields that reached the
adapter, with withheld fields named), and **Diagnostics** (mode, provider, elapsed time, timeout,
analysis status, adapter failure classification, rendering/delivery state — never credentials).

Errors stay distinct and recoverable: invalid intake, PreCall intake rejection, missing playground
configuration, adapter/provider failure, timeout, invalid model output, rendering failure, and
server failure each get their own message, with no stack traces in the browser.

### Tests

`bun test lib` inside this directory covers the configuration and execution boundaries: the config
directory is gitignored, fake mode performs no network call, config reads never return the key, the
file is written with restrictive permissions, live mode refuses a missing configuration, privacy
flags map onto PreCall's resolved policy, a withheld field never reaches the adapter, the real
renderer produces the preview, malformed intakes fail safely, and provider errors are sanitized.
Live behaviour is tested against a local OpenAI-compatible stub — no test reaches a real provider.

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
