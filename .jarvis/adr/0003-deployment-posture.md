# 0003 — Deployment posture: plain Kubernetes mapping to EKS; Juno is dev substrate only

- **Status:** Accepted (2026-07-07)
- **Supersedes (in spirit):** v0 ADR-017/034-039 (`archive/docs/adr/`), the
  Juno-platform-pilot and Terra-packaging track.

## Context

v0 adopted the Juno platform on day one, after a single meeting, and every deployment
decision after that chased a moving target: features on unmerged branches, stale docs,
closed-source behaviors provable only on a live cluster, and finally the 2026-06-18 Juno
call that invalidated the entire container/Terra/multi-arch track ("build it as an
external app on EKS; use Juno for dev"). Hands-on time on the real cluster (June 22-29)
hit three blocker-class platform bugs in one session. The portability guardrail v0 wrote
into its ADR-017 was the only reason the archive was survivable.

## Decision

- Cormac ships as **plain OCI images + Helm charts on vanilla Kubernetes primitives**,
  designed against EKS. No Juno plugin packaging, no Terra bundles, no platform-specific
  manifests.
- Local proof runs on a **kind rehearsal cluster** (mkcert-trusted TLS, `*.localtest.me`,
  ESO + Infisical for secrets; the v0 scripts under `archive/scripts/kind/` are the
  porting reference, proven 2026-06-18).
- **Juno's role is development substrate only** (dev workspace, dev cluster), adopted
  when it runs the app without vendor intervention, and swappable at all times. Product
  deployment decisions never depend on Juno features.
- Deployment claims in ADRs and docs are marked **proven** only after running pods, never
  from rendered templates (`helm lint`/`template` proves YAML validity only; v0 learned
  this twice).

## Consequences

- One deployment story that works with or without Juno; the EKS path is the product path.
- We keep the v0 assets that survive: kind rehearsal pattern, ESO/Infisical wiring,
  managed Supabase posture, GHCR images, multi-arch build knowledge.
- Cost: we forgo whatever leverage Juno's packaging might eventually provide; that trade
  is deliberate until the platform demonstrates readiness.

## Alternatives considered

- **Build on Juno's packaging (v0's track):** rejected; empirically invalidated by the
  platform's own guidance and its readiness record.
- **Docker-compose-first local dev:** rejected; v0 retired compose for cluster-shaped
  local dev, and the pane's TLS-and-stable-domain prerequisite wants the ingress stack
  from day one.
