# 0016 — Runtime fleet: one gateway pair per workspace; conversations rebuilt from server truth

- **Status:** Proposed (2026-07-13)
- **Builds on:** ADR-0003 (plain k8s → EKS), ADR-0005 (token = tenant binding, one
  profile per (workspace, agent kind)), ADR-0008 (locked-down profiles)
- **Feeds:** #100 (runtime deployment), #68 (kind rehearsal), #96 (durable
  conversation state)

## Context

The runtime is not deployed anywhere (#100 blocks the agent half of the product). The
chart layer exists and is kind-proven (PR #93: `deploy/charts/hermes`,
`Dockerfile.hermes` baking both locked-down profiles, `PROFILE` selects one per
container), but three fleet questions were open: the multi-tenant unit, where per-client
difference lives, and what happens when a pod dies mid-interview (#96). Hermes 0.17
facts that decide them (verified; `.jarvis/research/agent-system-round-2026-07.md`):
toolsets and env freeze at conversation start, there is no per-run toolset override on
the API server, and `/v1/responses` accepts `conversation_history`.

## Decision

1. **The fleet unit is one gateway pair (authoring + operations) per workspace.** The
   env-bound agent token is the tenant binding (ADR-0005); with no safe per-run tenant
   injection, tenancy is process-level by construction. Parameterize the existing
   `cormac-hermes` chart per workspace (workspace in the release name; per-workspace
   token secrets via ESO); do not build per-client images — profile content is
   identical across clients, and ALL per-client difference rides env (token) plus the
   compiled `instructions` prefix (ADR-0015).
2. **Conversations are rebuilt from server truth, not preserved on disk.** The control
   plane stores interview turns (it already relays every turn; capture is already
   server-truth per #116) and, on gateway loss, replays them into a fresh named
   conversation via `conversation_history` (verified live: a fresh conversation seeded
   with stored turns continues with full context). No persistent volumes for gateway
   state; pods stay disposable. Resolves #96's design question.
3. **Beta scale runs the pairs flat** (a handful of workspaces = a handful of small
   pods, ~512Mi-1Gi each). Pooling, scale-to-zero, or a gateway-per-node packing
   design is deferred until client count makes it matter, and must not leak into the
   chart's interface.

## Consequences

- #100 implements this shape once: chart parameterization + turn storage + the replay
  path. EKS work (#68) does not get rebuilt when per-client Cormacs arrive.
- Workspace provisioning grows two steps: mint tokens (exists), release a gateway pair.
- Residual to verify at build time (assumed, flagged): real interviews carry tool
  calls/results in history; text-turn replay is expected to suffice because workbook
  and contract state ride the prefix, but a full killed-pod interview resume must be
  proven before the claim enters the packet.
- Cost: N clients = 2N small pods. Accepted at beta scale; the deferred packing design
  is the relief valve.

## Alternatives considered

- **Shared multi-tenant gateway with per-run tenant injection:** rejected; no verified
  mechanism (env/toolsets freeze at start), and a forgeable in-band tenant id would
  move the boundary from authority to trust.
- **PersistentVolumes for gateway session state:** rejected for now; couples pods to
  disks, complicates spot instances, and duplicates state the control plane already
  owns (server truth). Revisit only if replay proves insufficient.
- **Per-client images with baked learned content:** rejected; learned content is
  governed data (ADR-0015) and must not require an image build to change.
