# Requirements

Durable outcomes and constraints the rebuild must preserve. Each carries its origin;
"proven in v0" means validated against real Postgres before the archive.

## Invariants (violating any of these requires a new ADR)

- **The control plane is the only writer.** Surfaces and the runtime never mutate business
  records; the runtime holds no database write credentials. Proven in v0.
- **Contract-first.** Business objects come from each workspace's published, versioned
  contract, not hard-coded tables. App-owned tables are operational only.
- **One agent service, many doors.** Every surface is an adapter over one
  capture/proposal/confirm/apply/audit pipeline. Surfaces never write directly.
- **The runtime is private and stateless per task.** Only the control plane reaches it,
  via its HTTP API (ADR-0001). Per-tenant learning lives as governed data in the control
  plane, never in runtime memory.
- **Memory off; typed governed learning only.** Record-bound aliases and enum synonyms
  through a review gate; no free-text agent memory, no auto-compaction of inbound content
  into durable context, ever. Backed by red-team evidence (v0 research: memory-on roughly
  doubles prompt-injection success).
- **Security evidence is a deliverable.** Build so a client-facing security packet reads
  as a true summary of enforced controls. Mechanism: the tracked packet at
  `docs/security/` with its control register and `pnpm check:controls` guard (ADR-0011).

## Product constraints

- Sub-$40/seat price ceiling for the target segment. AI inference is the dominant variable
  cost, so per-run cost and caching are first-class design inputs (v0 measured: the
  compiled cached prefix cut runs from ~21s / $0.045 to ~8-15s / $0.03).
- The web app is the first client surface built (ADR-0010): interview, capture, review
  queue, records, per-record timeline. It presents a governed spreadsheet view (ADR-0014):
  an editable grid over the record store, beside the agent, whose edits commit through the
  pipeline; it is not a copy or two-way mirror of the client's Excel. The Excel task pane is
  the flagship enhancement for tenants that can
  install add-ins; an unsized share of the segment cannot (verified: GoDaddy-resold
  tenants block every add-in path), so tenant qualification (reseller, SKU, desktop vs
  web) is routine at sales time. SMS is field capture. When the pane ships, its manifest
  pins its domain near-permanently, so a stable custom domain plus TLS is a pane-track
  prerequisite (ADR-0009/#67, deferred).
- Onboarding must populate the CRM from the client's existing workbook, not only publish a
  contract. Schema-only onboarding leaves an empty CRM and fails the core promise (keep the
  spreadsheet you already trust). Verified 2026-07-12: no import path exists in v2; the data
  model is import-ready (stable record IDs, contract-versioned records). Tracked #98 (Beta 1).
- SMS is a core beta surface per the 2026-07-12 roadmap (owner decision, ADR-0013), not a
  deferred later door; web remains the first surface (ADR-0010). The pipeline is already
  door-agnostic, so SMS is an inbound adapter plus a confirm-by-text trust UX. Tracked
  #101/#102 (Beta 5).
- The authoring interview is consultative and free-form with checkpoints (structure
  agreed, fill, review), not batched question rounds. One-shot contract authoring is
  proven insufficient on real workbooks (v0 spike: invalid and unstable across runs).
- Multi-turn conversation state for the authoring agent is a hard dependency; Hermes named
  conversations provide it natively (verified live in the Jarvis project, 2026-06-20).

## Platform constraints

- Deployment is plain Kubernetes primitives that map one-to-one to EKS; local proof runs
  on a kind rehearsal cluster. Juno is a development substrate only and must remain
  swappable (ADR-0003).
- Managed Supabase/Postgres is the system of record (JSONB-hybrid, RLS, ES256/JWKS auth,
  proven in v0 and re-proven on v2 in #66 phase 7). One Supabase project per tier; the
  local CLI stack is the dev/test tier, never the system of record (ADR-0006).
- Secrets: Infisical as sole authority (ADR-0006 environments), ESO into clusters. On dev
  machines every secret consumer launches under `infisical run`; Hermes profiles hold no
  `.env` (ADR-0005 as amended 2026-07-08). No secrets in git (a Juno Genesis token
  transited this repo's history on 2026-07-07 and must be rotated).

## Open questions

- (settled) Operations-agent data access: typed per-profile plugin tools over `/agent/*`,
  no shell, no MCP callback — ADR-0008. Authoring's migration off its shell-script
  binding is follow-up work under the same ADR.
- (settled) The ops/authoring privilege split is per-agent-kind capability sets on
  `/agent/*`, one profile instance per (workspace, agent kind) — ADR-0005.
- (active) A2P 10DLC registration for the SMS door: SMS is now a core beta surface (2026-07-12
  roadmap, ADR-0013); registration is filed as #102 and should start now given the long carrier
  lead time.
