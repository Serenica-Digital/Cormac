# 0012 — The beta is an open self-serve beta on the EKS path

- **Status:** Accepted (2026-07-12)
- **Builds on:** ADR-0003 (deployment posture: plain k8s → EKS, Juno dev-substrate only),
  ADR-0010 (web-first build order), ADR-0002 (keystone-first build order)
- **Relates to:** `.jarvis/prd/roadmap.md` (the sequenced plan this decision heads)

## Context

Direction set with the owner on 2026-07-12 after a verification pass (three scouts) found
the beta-blocking gaps that prior work had not started: onboarding publishes a contract but
imports no client data (empty CRM); the app runs only on local kind and agent features 503
without a deployed runtime; there is no self-serve front door. Juno as a deploy target is
blocked platform-side (#97; `.jarvis/research/juno-deploy-findings.md`). The prior framing
was a pane-first milestone set (tracker M1–M8) that ADR-0010 had already reversed and that
named beta stages without loading them with the actual blocking work.

## Decision

- **The beta target is an open self-serve beta** (public signup, self-serve workspace
  creation), **hosted on the EKS path** (ADR-0003's product-deployment route), not Juno.
- A **single design-partner pilot is a strict subset and an intermediate checkpoint**, not a
  competing target: reached when data import is done, EKS is minimally up (reachable URL,
  TLS, runtime deployed), and auth delivery works; the one partner is hand-provisioned in the
  already-built operator console. It de-risks the open launch and retires ADR-0004 criterion
  3 (human-played interview) on real infra.
- Open signup makes **inference cost and abuse launch-blocking**: per-tenant quotas and rate
  limiting (Beta 4) are prerequisites, not optional. Public data processing makes **terms,
  privacy policy, and DPA** prerequisites.
- Tracked as milestones Beta 1–5 with #98–109; the stale pane-first M1–M8 were archived
  2026-07-12.

## Consequences

- Adds the self-serve-onboarding and public-safety workstreams that a closed pilot would not
  have needed; EKS is weeks, not days, of lead time, so the pilot checkpoint is how real
  usage happens earlier.
- ADR-0003 is reinforced, not amended: EKS is the product deploy path; Juno stays a swappable
  dev substrate.
- `.jarvis/prd/roadmap.md` is the sequenced source of truth for the workstreams and critical
  path.

## Alternatives considered

- **Closed hand-provisioned design-partner pilot on a fast host:** rejected as the *end
  target* (kept as the intermediate checkpoint). A shortcut host would not exercise the real
  deployment story and would defer, not remove, the self-serve and public-safety work.
- **Keep pushing Juno as the deploy target:** rejected; blocked platform-side (#97) and off
  the critical path per ADR-0003.
