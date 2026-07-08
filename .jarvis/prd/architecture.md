# Architecture

How Cormac v2 is structured. This is the target shape; as of 2026-07-07 the authoring
agent exists (keystone spike, ADR-0004) and nothing else is built. Diagrams originated
in the June 2026 post-archive sessions (formerly `v2-architecture/diagrams1.md`).

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
  hermes -.->|"data access: bundled profile tools<br/>(authoring, ADR-0004); operations seam<br/>open, owned by #66"| cp
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

## Data-access seam (half settled)

For the **authoring agent** the seam is settled: tools bundled in the Hermes profile,
with names and shapes that mirror the future control-plane interface (ADR-0004; the #66
swap is bindings, not cognition). For the **operations agent** it stays open, owned by
the walking skeleton (#66). The write gate stays a schema-enforced proposal either way;
the boundary is authority (credentials, RLS, the validated gate), not transport. The
authoring profile's tracked source is `evals/workbook-authoring/profile/`; spike
mechanics and cost evidence live in `.jarvis/research/authoring-spike-findings.md`.

## Deployment shape

Plain OCI images + Helm charts; local proof on a kind rehearsal cluster (mkcert TLS,
`*.localtest.me`, ESO + Infisical, ArgoCD optional) mapping one-to-one to EKS. Juno is a
dev substrate only (ADR-0003). The v0 rehearsal scripts under `archive/scripts/kind/` are
the porting reference.

## Development plane (not product)

This repo is PM-managed by the Jarvis instance `jarvis-cormac` (port 8643); see
`AGENTS.md`. Jarvis is developer tooling, never a product component.
