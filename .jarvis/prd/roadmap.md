# Road to beta

Direction set 2026-07-12 with the owner. Current project truth. It supersedes the pane-first
milestone framing (tracker milestones M1-M8), which was archived the same day.

## Target

An open self-serve beta, hosted on the EKS path (ADR-0003). Not a hand-provisioned pilot on a
shortcut host, and not Juno (blocked platform-side, #97; see `.jarvis/research/juno-deploy-findings.md`).
A single design-partner pilot is a strict subset of this road and is the intermediate checkpoint
(see Sequencing).

Two owner decisions, both reversals worth recording:

- **Beta is open self-serve** (public signup, self-serve workspace creation), not a closed
  hand-provisioned pilot. This adds the onboarding and public-safety workstreams and turns
  inference cost and abuse into launch-blocking concerns.
- **SMS is a core beta surface**, not a deferred later door. Texting an update in from the field
  is the headline use case for the target user (a realtor). Web remains the first surface
  (ADR-0010); SMS is added to beta scope, not placed ahead of web.

## The gap that reframes the work (verified 2026-07-12)

What is built is real: the whole web app is wired end to end to the control plane (no mocks),
both agents work, the pipeline is proven. But three things block a real beta, and none was in
progress:

1. **A client's data never enters the product.** Onboarding publishes a contract but produces an
   empty CRM. No workbook-to-records import exists (verified across control plane, web, and agent
   layers). This breaks the core promise. Highest-leverage gap.
2. **Nowhere to reach it.** The app runs only on local kind; agent features return 503 without a
   deployed runtime. Juno is blocked; EKS is unbuilt (#68).
3. **No self-serve front door.** No signup; workspace creation is operator-only.

The pre-pilot checklist in `docs/security/known-gaps-and-roadmap.md` covers security hardening but
none of these three product gaps. Naming them as tracked P0 work (below) is the correction.

## Workstreams (tracker milestones Beta 1-5)

- **Beta 1 Product-complete:** workbook data import (#98, the #1 gap); interview cadence and
  modeling pass (#76, in flight on `feat/interview-cadence`).
- **Beta 2 Self-serve onboarding:** signup + self-serve workspace creation + onboarding wizard
  (#99); auth delivery, custom SMTP + Google/Microsoft OAuth registrations (#103).
- **Beta 3 EKS infrastructure:** EKS cluster (#68); deploy the Hermes runtime to kill the 503s
  (#100); CI (#95); production dist images (#94); durable session state (#96); observability (#106).
- **Beta 4 Public-safety gate:** rate limiting (#104); per-tenant cost/abuse quotas (#105); secret
  rotation (#92); restore drill (#107); ported v0 security tests (#109); legal terms/privacy/DPA (#108).
- **Beta 5 SMS field-capture door:** Twilio inbound adapter + confirm-by-text UX (#101); A2P 10DLC
  registration (#102, refile of the reset-closed #24).

## Sequencing

Two build long poles are independent; start both now:

- **Data import (#98)** — buildable and testable on the local stack, no infra dependency, highest
  product leverage.
- **EKS (#68)** — longest lead time, independent of product features.

Two external clocks are owner-side and slow to approve, so start them now regardless of build order
or they become the critical path:

- **A2P 10DLC registration (#102)** — days-to-weeks carrier lead time.
- **SMTP + OAuth app registrations (#103)** — Entra + Google app registrations, staging SMTP.

Then self-serve onboarding (Beta 2) stacks on import, and the public-safety gate (Beta 4) is the
final gate before opening signup to the public.

**Intermediate checkpoint (design-partner pilot):** reached when import is done, EKS is minimally up
(reachable URL, TLS, runtime deployed), and auth delivery works. Hand-provision the one partner in
the operator console (already built). This gives real-user contact and retires ADR-0004 criterion 3
(human-played interview on real infra) before the full self-serve build and full public-safety gate
land. Do not skip it; it de-risks the open launch.

## Consequences to hold

- Open signup plus an agent product is a live cost surface driven by strangers; quotas and rate
  limits (Beta 4) are launch-blocking, not optional.
- Public data processing is a legal surface; terms, privacy policy, and DPA are prerequisites.
- EKS is weeks, not days. The pilot checkpoint is how real usage happens earlier.

## ADR candidates (not yet written)

Two decisions here are settled forks with rejected alternatives and may warrant ADRs, paralleling
ADR-0010's web-first reversal: (a) open self-serve beta on EKS as the target (rejected: a closed
design-partner pilot on a fast host), and (b) SMS elevated to a core beta surface (rejected: SMS as
a deferred later door). Flagged for a PM review to decide whether to formalize.

## Status

Board restructured 2026-07-12: Beta 1-5 milestones created; 12 issues filed (#98-109); 8 labeled P0
(the first P0-labeled work in v2); stale pane-first M1-M8 milestones archived. The owner's working
plan (local `road-to-beta.md`) carries the full reasoning, effort sizing, and verification bars.
