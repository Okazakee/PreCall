# Roadmap

This roadmap separates the immediate implementation path from later product capabilities.

## Phase 0 — Product and architecture decisions

**Status: complete enough to implement**

Completed decisions include:

- core product purpose;
- MVP boundary;
- golden brief behavior;
- request maturity handling;
- facts/inferences/assumptions/unknowns;
- discovery-question prioritization;
- risk behavior;
- roadmap depth;
- confidence model;
- no-AI fallback;
- architecture boundaries;
- field privacy;
- email attachment behavior;
- server runtime direction;
- validation/tooling/test/CI direction;
- simplified AI adapter strategy.

## Phase 1 — Repository bootstrap

**Status: complete**

The minimum project baseline is configured and verified:

- package metadata;
- Bun lockfile pinned to Bun 1.3.14;
- strict TypeScript configuration;
- tsdown;
- Biome;
- Oxlint;
- `src/index.ts`;
- README;
- AGENTS guidance;
- GitHub Actions CI;
- lightweight repository/script contract.

Success verified:

- frozen install;
- repository contract;
- non-mutating formatting and linting;
- typecheck;
- deterministic test;
- build

all pass before substantial product code exists.

## Phase 2 — Intake and normalization

Implement:

- `FieldDefinition`;
- field defaults;
- arbitrary structured submission handling;
- normalized field array;
- source preservation;
- request/field limits.

Tests:

- arbitrary fields;
- source fidelity;
- invalid config;
- excessive fields/values;
- suspicious keys;
- sensitive defaults.

## Phase 3 — AI-visible input boundary

Implement deterministic field filtering before AI.

Tests:

- hidden fields never reach adapter;
- sensitive default works;
- explicit override works;
- hostile client instructions remain data.

## Phase 4 — Analysis schema

Implement Zod schemas for:

- summary;
- clarity;
- facts;
- inferences;
- assumptions;
- unknowns;
- risks;
- discovery questions;
- roadmap;
- confidence.

Use representative and vague golden fixtures.

## Phase 5 — Core processing vertical slice

Implement:

- tiny `AIAdapter`;
- fake adapter;
- `process()`;
- analysis validation;
- `PreCallResult`;
- raw fallback.

Tests:

- successful analysis;
- adapter exception;
- malformed output;
- abort handling;
- source preservation;
- fallback status.

**Milestone:** core product works end-to-end without external services.

## Phase 6 — Default renderer

Implement deterministic:

- HTML;
- plain text;
- successful brief;
- fallback brief.

Tests:

- client/AI escaping;
- empty-section behavior;
- output privacy;
- clarity/uncertainty presentation.

## Phase 7 — Raw attachment

Implement:

- permitted source view;
- JSON attachment;
- default `attachRawSubmission=true`;
- fixed safe filename;
- disable override.

## Phase 8 — Email transport boundary

Implement:

- `EmailTransport`;
- fake transport;
- delivery outcome;
- result survival on delivery failure.

Then select one real email provider/transport.

Do not build a universal email framework.

## Phase 9 — Package contract

After public API is real:

- build;
- npm pack;
- validate artifact;
- clean-consumer install;
- Bun smoke;
- Node smoke.

## Phase 10 — Next.js integration proof

Add a small example using:

- Server Action and/or;
- Route Handler.

Goal:

- verify server-side developer experience;
- catch package/bundling problems.

A full demo application is unnecessary.

## Phase 11 — Pi AI spike

After the fake-adapter core is green:

Test a small Pi-based AI transport.

Acceptance criteria are defined in `AI.md`.

Possible outcome A:

- Pi becomes first official AI transport.

Possible outcome B:

- use a direct provider adapter.

Either outcome keeps the core unchanged.

## Phase 12 — First public package preparation

Before publishing, settle:

- permanent package/repository name;
- license;
- minimum Node version;
- exact Bun support policy;
- first real AI adapter;
- first email transport.

Add release workflow:

```text
vX.Y.Z tag
→ version verification
→ frozen install
→ full checks
→ package/runtime validation
→ trusted npm publish
→ GitHub Release
```

# After MVP

Only add these after the core product is proven and a concrete need exists.

## Focused research

Potential capability:

- company/product research;
- website/product inspection;
- relevant public documentation;
- sourced findings.

Requirements:

- optional;
- opportunity-focused;
- source-aware;
- prompt-injection aware;
- SSRF-safe;
- must not destroy intake when unavailable.

## Budget decision support

Potential capability:

- compare stated budget with apparent workload/risk;
- custom professional pricing rules;
- explicit uncertainty;
- refusal to manufacture estimates when information is insufficient.

Not a quotation engine.

## Modular skills

Potentially split analysis capabilities when there is evidence that independent configuration/replacement is useful.

Do not begin with a plugin marketplace.

## Additional outputs

Potentially:

- PDF;
- Slack;
- Teams;
- Discord;
- CRM;
- webhook;
- dashboards.

All consume the same structured result.

## Multiple AI providers / fallback

Potentially:

```text
primary
→ alternate
→ alternate provider
→ no-AI fallback
```

Only build once reliability/cost requirements justify it.

## Hosted service

Possible later business direction:

- managed AI;
- managed delivery;
- anti-abuse infrastructure;
- dashboard/history;
- integrations;
- storage;
- team features.

The open-source core should remain useful independently.

## Post-discovery workflow

Possible second stage:

```text
pre-call brief
→ discovery call
→ professional notes
→ second analysis
→ clearer requirements
→ more meaningful roadmap/budget/scope
```

This is valuable but deliberately outside the initial version.
