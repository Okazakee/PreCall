# Guidance for coding agents

Small, durable instructions for agents working in this repository. It deliberately contains no
package, release, or current-state facts: those change, and copying them here creates drift.

## Start here

- Inspect the existing work before editing. Preserve useful user changes; do not invent
  implementation that is not present.
- Different files own different questions:

| Question | Read |
| --- | --- |
| What should PreCall be? Stable product principles and boundaries | [`docs/PRODUCT.md`](docs/PRODUCT.md) |
| Why is it built this way? Settled decisions and rejected approaches | [`docs/DECISIONS.md`](docs/DECISIONS.md) |
| What the first version must do | [`docs/MVP_SPEC.md`](docs/MVP_SPEC.md) |
| Intended future work and sequencing | [`docs/ROADMAP.md`](docs/ROADMAP.md) |
| Normative trust, privacy, and security responsibilities | [`docs/SECURITY.md`](docs/SECURITY.md) |
| Release policy and external release constraints | [`docs/RELEASING.md`](docs/RELEASING.md) |
| Genuinely mutable project and external release state | [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md) |
| The documentation map and status vocabulary | [`docs/README.md`](docs/README.md) |

- Current implementation truth is the source, tests, and configuration — never a Markdown claim
  about how the code behaves. Verify before changing behavior.
- When files disagree: `PRODUCT.md` principles beat implementation convenience, newer explicit
  decisions in `DECISIONS.md` beat older mutable notes, and deferred or speculative material is
  not a current requirement.

## Orient with Graft

`.omp/mcp.json` wires the local Graft structural graph into OMP as the `graft` MCP server
(`graft_find_code`, `graft_file_api`, `graft_trace_calls`, `graft_find_all`, `graft_repo_map`,
`graft_check_freshness`).

- Use Graft first for implementation orientation and blast-radius discovery: locating code,
  tracing callers, and reading a file's API surface.
- `graft/` is a local regenerable cache and is gitignored. Never commit it. Rebuild with the
  pinned invocation from `.omp/mcp.json` when the graph is missing.
- It is a derived navigation cache over the current code — never authoritative for product
  intent, architectural rationale, or trust boundaries.
- Confirm important details against source, tests, and config before changing behavior.
- Do not manually document code topology in Markdown merely because implementation changed; the
  graph and the code already carry it.

## PreCall product and trust boundaries

- AI prepares the human. It does not quote, sell, estimate, commit scope, price, or timeline, and
  it does not replace discovery.
- Preserve the authoritative raw submission separately from the privacy-filtered AI input. Field
  privacy is deterministic; never send data to AI because it is convenient.
- Build AI-visible data only from normalized fields by positive resolved `sendToAI` allowlisting;
  never by filtering the authoritative original object.
- AI output is untrusted until it satisfies the canonical analysis schema, and AI is optional
  enrichment: when it is unavailable, preserve the request and state the uncertainty rather than
  manufacturing certainty.
- Keep facts, inferences, assumptions, and unknowns distinguishable, and keep confidence
  qualitative.
- Treat submissions, field names and values, AI output, and researched content as untrusted data.
  Untrusted text never becomes trusted instructions or configuration.
- Professional-facing output and submission artifacts derive from normalized fields by positive
  `includeInOutput === true` allowlisting, never from the preserved original.
- Delivery uses a trusted explicit recipient and stays separate from the reusable structured
  result; providers remain outside the core.
- Keep the package root's explicit minimal exports: no `export *`, no low-level pipeline helpers.
- `docs/SECURITY.md` is normative for the full responsibility split.

## Engineering conventions

- Bun is the package manager and primary runtime; Zod 4 owns runtime validation; `bun:test` is
  the test runner.
- TypeScript is strict (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `isolatedModules`). Never weaken compiler settings to make code pass.
- Do not couple the core to a framework, database, or provider without an explicit project
  decision, and avoid speculative abstractions and extra packages.
- Add deterministic behavioral tests with behavior changes, faking external boundaries (AI,
  email) rather than the core logic under test. Assert observable invariants and never weaken a
  test or CI to accommodate an implementation.
- Run the repository's existing checks (`bun run check`, release checks) before considering work
  complete; do not add ad-hoc verification paths that bypass them.

## Documentation ownership

- Update a document only when the information that document owns actually changed.
- Do not copy mutable package, version, release, or current-state facts into `AGENTS.md`.
- Do not restate implementation shape in documentation; keep reference documents about intent,
  decisions, boundaries, and contracts.

## Git safety

- Never use destructive Git operations, discard existing work, or rewrite history.
- Commit only when explicitly requested; a request to commit does not authorize pushing,
  publishing, or merging unless it says so.
