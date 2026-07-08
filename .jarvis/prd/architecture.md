# Architecture

How Cormac v2 is structured. This is the current shape as of the #66 walking skeleton
(2026-07-08): the authoring agent (ADR-0004), the control plane, the v2 schema, and the
runtime module exist; the operations agent, surfaces, and deployment do not. Diagrams
originated in the June 2026 post-archive sessions (formerly `v2-architecture/diagrams1.md`).

## The product

```mermaid
flowchart TB
  subgraph surfaces["Surfaces (untrusted)"]
    excel["Excel pane"]
    web["Web app"]
    sms["SMS / Twilio"]
    email["Email"]
  end

  subgraph auth["Auth"]
    supaAuth["Supabase Auth (JWT)"]
  end

  subgraph ours["Cormac trust boundary"]
    cp["Control Plane (Fastify)<br/>only writer: RBAC, proposals,<br/>confirmation, audit<br/>rate-limit + validate before Hermes"]
  end

  subgraph runtime["Hermes runtime (private)"]
    hermes["Hermes API server<br/>/v1/runs, API_SERVER_KEY set,<br/>stateless per task, ephemeral disk,<br/>reachable from control plane only"]
  end

  subgraph data["System of record"]
    db[("Managed Supabase / Postgres")]
  end

  model["Anthropic API"]

  excel & web & sms & email --> supaAuth
  supaAuth --> cp
  cp -->|"submit run + compiled context, SSE back"| hermes
  hermes -->|"LLM calls"| model
  hermes -.->|"data access: profile tools over /agent/*<br/>(ops: typed plugin tools, ADR-0008;<br/>authoring: scripts, migration pending)"| cp
  cp -->|"the only writer"| db
```

## Components

- **Control plane** (Node/TypeScript, Fastify): tenant routing, RBAC, contract publishing,
  the capture/proposal/confirm/apply/audit pipeline, connector webhooks, every write. The
  v0 implementations of the pipeline (atomic apply RPC, append-only audit, RLS isolation,
  JWKS auth) were proven live and are the porting reference under `archive/apps/api`.
- **Hermes runtime**: two agent roles over one runtime. The **authoring agent** (the
  keystone; interviews a client over their real workbook, produces the contract) and the
  **operations agent** (daily capture into proposals). Driven via the API server:
  `/v1/responses` with named conversations for interactive multi-turn (authoring),
  `/v1/runs` + SSE + the approval endpoint for gated work. Compiled, cache-stable
  workspace context rides the `instructions` seam. Transport pattern is live-proven in the
  sibling Jarvis project (see `.jarvis/research/jarvis-project-digest.md`).
- **Contract + knowledge layer**: published versioned contract per workspace; typed
  governed learning (record-bound aliases, enum synonyms) behind a review gate; compiled
  into the cached prefix. Prose memory rejected by design.
- **System of record**: managed Supabase/Postgres, JSONB-hybrid with generated hot
  columns, RLS, ES256/JWKS.

## Data-access seam (settled for ops; authoring migration pending)

Both agents reach data through the control plane's `/agent/*` API; the seam question was
only ever how a tool call leaves the model. For the **operations agent** it is settled
(ADR-0008): typed tools registered by the per-profile `cormac-ops` plugin
(`evals/ops-capture/plugin/`), handlers making stateless HTTP calls — no shell, no MCP
callback, no connection state. The ops profile is locked down to exactly those three
tools, with memory, user profile, and curator off, and its whole procedure in SOUL.md
(no skills toolset). The **authoring agent** still runs its ADR-0004 shell-script
binding (`evals/workbook-authoring/profile/`); migrating it to typed tools and retiring
its terminal is follow-up work under ADR-0008. The write gate stays a schema-enforced
proposal either way; the boundary is authority (credentials, RLS, the validated gate),
not transport. Evidence: `.jarvis/research/ops-seam-findings.md` and
`.jarvis/research/authoring-spike-findings.md`.

Bundled tools authenticate to the control plane's `/agent/*` surface with
workspace-scoped agent tokens: hashed at rest, revocable, per-agent-kind privilege
split (ADR-0005). Infisical holds the only copy of every secret; the gateway launches
under `infisical run` (`pnpm agent:hub run`) so credentials reach Hermes and its tool
subprocesses as injected process env, never through a file (ADR-0005 as amended
2026-07-08). Billing and model ride the ADR-0006 environment (ADR-0007): `dev` = gpt-5.5
on the Codex OAuth plan (cheap iteration), `staging` = metered Sonnet 4.6 (the only
source of cost and behavior evidence).

## Environments

One Supabase project per tier, with the Infisical environment slug as the single switch
(ADR-0006): `dev` = the local CLI stack (tests, everyday dev), `staging` = the managed
project (remote proofs, later the deployment rehearsal target), `prod` = reserved for the
production project at deployment time. `APP_ENV` rides in each vault environment, so the
prod auth posture flips with the environment, never by hand.

## Deployment shape

Plain OCI images + Helm charts; local proof on a kind rehearsal cluster (mkcert TLS,
`*.localtest.me`, ESO + Infisical, ArgoCD optional) mapping one-to-one to EKS. Juno is a
dev substrate only (ADR-0003). The v0 rehearsal scripts under `archive/scripts/kind/` are
the porting reference.

## Development plane (not product)

This repo is PM-managed by the Jarvis instance `jarvis-cormac` (port 8643); see
`AGENTS.md`. Jarvis is developer tooling, never a product component.
