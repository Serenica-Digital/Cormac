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
  as a true summary of enforced controls.

## Product constraints

- Sub-$40/seat price ceiling for the target segment. AI inference is the dominant variable
  cost, so per-run cost and caching are first-class design inputs (v0 measured: the
  compiled cached prefix cut runs from ~21s / $0.045 to ~8-15s / $0.03).
- Excel task pane is the primary client surface; web is admin/trust/fallback; SMS is field
  capture. The pane's manifest pins its domain near-permanently, so a stable custom domain
  plus TLS is a deployment prerequisite, not a later step.
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
  all proven in v0). Local Supabase is a CI fixture only.
- Secrets: Infisical as authority, ESO into clusters, per-profile `.env` chmod 600 on dev
  machines. No secrets in git (a Juno Genesis token transited this repo's history on
  2026-07-07 and must be rotated).

## Open questions

- Agent data access during a run: tools bundled in the Hermes profile vs MCP callback to
  the control plane. Owned by the keystone spike; the seam is recorded in ADR-0001.
- Operations-vs-authoring privilege split in the runtime profile(s).
- A2P 10DLC registration timing for the SMS door.
