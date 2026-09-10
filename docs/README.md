# Project Reference Documentation

This directory is the consolidated reference set for the **PreCall** project. The public package
identity, version, exports, license, runtime floors, and toolchain pins are defined by
`package.json` and `bun.lock`; this directory does not restate them.

## Documentation ownership

Not every file here is the same kind of thing. Three tiers exist, and knowing which tier a
question belongs to is what keeps the documentation from drifting.

### 1. Normative: intent, boundaries, and settled decisions

- **[`PRODUCT.md`](PRODUCT.md)** — what PreCall should be, and its stable product principles and
  boundaries. Wins over implementation convenience.
- **[`SECURITY.md`](SECURITY.md)** — normative trust, privacy, and security responsibilities and
  the split between core, consumer, and future subsystems.
- **[`DECISIONS.md`](DECISIONS.md)** — important settled choices with rationale, including
  deliberately rejected approaches.
- **[`MVP_SPEC.md`](MVP_SPEC.md)** — the behavioral contract of the first usable version, for as
  long as that contract is still the relevant one.
- **[`RELEASING.md`](RELEASING.md)** — release policy and the external constraints publication
  depends on.

### 2. Mutable roadmap and external state

- **[`PROJECT_STATE.md`](PROJECT_STATE.md)** — current milestone, externally published release
  state, external configuration, unresolved decisions, and the immediate next action. Only state
  that cannot be derived from the working tree belongs here.
- **[`ROADMAP.md`](ROADMAP.md)** — intended future work and sequencing. Deferred material is not a
  current requirement.

### 3. Current implementation truth

Implementation facts are **not** owned by any document in this directory. They come from source,
tests, and configuration, which are authoritative for how the code currently behaves.

Navigation over that code — locating a module, tracing callers and blast radius, reading a file's
API surface — is a derived, regenerable cache (Graft, wired into OMP through `.omp/mcp.json`; see
[`../AGENTS.md`](../AGENTS.md)). A derived graph is a faster way to read the code; it is never
authoritative for product intent, architectural rationale, or trust boundaries, and it does not
replace any document above.

This is why these documents describe responsibilities, boundaries, invariants, and rationale
rather than inventories of current modules, APIs, or tests.

## Supporting documents

- **[`ARCHITECTURE.md`](ARCHITECTURE.md)** — responsibility boundaries, critical separations, and
  runtime direction.
- **[`DATA_MODEL.md`](DATA_MODEL.md)** — conceptual data model, invariants, and schema philosophy.
  Exact shapes live in source.
- **[`AI.md`](AI.md)** — the role of AI, its trust boundary, provider decisions, and
  structured-output rules.
- **[`TESTING.md`](TESTING.md)** — test philosophy, required invariants, and repository gates.

## Precedence

When sources disagree:

1. stable principles in `PRODUCT.md` win over implementation convenience;
2. `SECURITY.md` is normative for trust, privacy, and security responsibilities;
3. newer explicit decisions in `DECISIONS.md` win over older mutable statements elsewhere,
   including `PROJECT_STATE.md`;
4. `MVP_SPEC.md` defines what belongs in the first usable version, while deferred ideas in
   `ROADMAP.md` are not current requirements;
5. for anything about current behavior, source, tests, and configuration win over every document
   in this directory.

## Status terminology

Throughout the docs:

- **Settled** — intentionally decided for the current project state.
- **MVP** — required for the first usable implementation.
- **Direction** — preferred approach, but still subject to implementation validation.
- **To validate** — must be tested before becoming a compatibility or dependency commitment.
- **Superseded** — replaced by a later decision, which wins.
- **Deferred** — explicitly not part of MVP.
- **Speculative** — possible future direction only.

## North-star test

A potential client submits an incomplete service request. Before speaking with them, the
professional should be able to understand what was actually requested, what is known versus
inferred, what is missing, what might be involved, what could go wrong, what is worth validating
or researching, how uncertain the current understanding is, and what questions should be asked
during discovery.

The professional should finish the brief materially better prepared for the real conversation.
