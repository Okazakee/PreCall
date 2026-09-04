# Project Reference Documentation

This directory is the consolidated reference set for the unnamed AI-assisted service-intake project.

The product's permanent name has **not** been selected. Names such as `PreCallResult` are working technical names, not a product-brand decision.

## How to use these files

Different files have different authority:

1. **`PRODUCT.md`** — stable product principles and boundaries.
2. **`MVP_SPEC.md`** — expected first-version product behavior.
3. **`ARCHITECTURE.md`** — current technical architecture and ownership boundaries.
4. **`DATA_MODEL.md`** — current conceptual data model and schema direction.
5. **`AI.md`** — AI boundary, provider strategy, structured-output rules, and Pi evaluation plan.
6. **`SECURITY.md`** — trust boundaries, privacy, rendering safety, abuse/cost responsibility split.
7. **`TESTING.md`** — test philosophy, required invariants, CI package/runtime verification.
8. **`RELEASING.md`** — CI/release/publishing policy.
9. **`DECISIONS.md`** — explicit settled decisions and rationale.
10. **`PROJECT_STATE.md`** — mutable current state, current stack, unresolved items, and next implementation step.
11. **`ROADMAP.md`** — implementation sequence and future product phases.

When files disagree, use this precedence:

- stable principles in `PRODUCT.md` win over implementation convenience;
- newer explicit decisions in `DECISIONS.md` and `PROJECT_STATE.md` win over older mutable assumptions;
- `MVP_SPEC.md` defines what belongs in the first usable version;
- deferred ideas in `ROADMAP.md` are not current requirements.

## Status terminology

Throughout the docs:

- **Settled** — intentionally decided for the current project state.
- **MVP** — required for the first usable implementation.
- **Direction** — preferred approach, but still subject to implementation validation.
- **To validate** — must be tested before becoming a compatibility or dependency commitment.
- **Deferred** — explicitly not part of MVP.
- **Speculative** — possible future direction only.

## North-star test

A potential client submits an incomplete service request. Before speaking with them, the professional should be able to understand what was actually requested, what is known versus inferred, what is missing, what might be involved, what could go wrong, what is worth validating or researching, how uncertain the current understanding is, and what questions should be asked during discovery.

The professional should finish the brief materially better prepared for the real conversation.
