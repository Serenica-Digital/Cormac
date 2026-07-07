# 0002 — Keystone first: the authoring agent is built before any infrastructure

- **Status:** Accepted (2026-07-07)

## Context

v0 named the Workbook Contract Agent its keystone risk (v0 ADR-023), spiked it honestly
(real workbooks produced invalid, unstable contracts one-shot), and then starved it: over
thirteen days, roughly 90% of effort went to operations-agent infrastructure and
deployment while the keystone stayed at zero build. The v0 retrospective
(`.jarvis/research/v0-retrospective.md`) identifies this as one of three fatal patterns.
Deployment and platform work is always more tractable than the keystone, so it eats the
schedule unless structurally blocked.

## Decision

Build order for v2, enforced as a gate, not a preference:

1. **The authoring-agent keystone spike**: a Hermes profile (SOUL + tools) running the
   consultative interview loop over a real workbook fixture, driven via named
   conversations (ADR-0001), until it produces a valid, stable, published contract. The
   v0 eval assets (anonymized real-workbook fixture, `archive/evals/`) are the starting
   corpus; the Jarvis golden-scenario pattern (frozen state + prompt + human-judged run)
   is the harness shape.
2. The spike also settles the OPEN data-access seam (ADR-0001).
3. Only after the keystone holds: control plane walking skeleton (port v0's proven
   proposal/apply/audit patterns), then Excel pane probes, then deployment (ADR-0003).

**The rule:** no deployment work, no pane work, no platform onboarding lands on `dev`
before the keystone spike has a GO verdict. Infrastructure PRs before that point require
a superseding ADR.

## Consequences

- The riskiest bet gets the first and freshest effort; if the keystone fails, we learn it
  before paying for infrastructure around it.
- Early work happens without a deployed environment; the spike runs locally against a
  Hermes profile, which ADR-0001's verified transport makes sufficient.
- Cost: the walking skeleton and pane, which are motivating to build, wait. That is the
  point.

## Alternatives considered

- **Infrastructure-first / walking-skeleton-first (v0's actual order):** rejected; it is
  the documented failure.
- **Parallel keystone + infrastructure tracks:** rejected for now; solo-founder attention
  is the scarce resource, and v0 showed the infrastructure track wins that competition.
