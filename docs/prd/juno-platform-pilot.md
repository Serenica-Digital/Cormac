# Juno Platform Pilot Plan

> **Status:** canonical · **Last reviewed:** 2026-06-10

**Audience:** the Juno Innovations team and Serenica CRM Agent project collaborators. This is the scope document the June 5 meeting asked for, and the working agenda for the onboarding session. It is written in Juno's own platform vocabulary (projects, workload templates, Terra Sources, plugins, bundles) so the mapping is direct. Platform facts below were verified against the public juno-fx repos and docs on 2026-06-10; items the public record cannot settle are marked as onboarding questions, since the June 5 meeting was clear that the docs trail the platform. The deeper research record is [docs/research/juno-hermes-deployment-research.md](../research/juno-hermes-deployment-research.md).

## Summary

Serenica CRM Agent is a contract-first CRM agent platform for small, relationship-heavy businesses that run on spreadsheets, Microsoft 365, email, and text. Clients bring their Excel workbooks; Serenica lifts each into a governed, versioned semantic contract and operates on it through an agent reachable over web, SMS, email, Excel, and Claude/MCP.

The pilot goal: build and run Serenica on Juno as a real agentic SaaS use case. A multi-service containerized application (web UI, control-plane API, worker, a Dockerized Hermes runtime), managed Supabase/Postgres as the external system of record, and a project-scoped development environment with a dev-assistant agent. Juno is the orchestration and deployment layer; Serenica keeps its application logic, trust model, database authority, and compliance packet in its own repo, and every service stays a portable container.

## What exists today (what the pilot deploys)

This is not a greenfield. The repo is a pnpm monorepo of normal containers, already running end to end locally:

- `apps/web`: minimal React/Vite web surface.
- `apps/api`: the control plane (Node/TypeScript, Fastify). The trust layer and the only writer of business records. Verifies Supabase JWTs, enforces RBAC, runs the proposal/confirmation/audit pipeline.
- `apps/worker`: background jobs (stub for now).
- `services/runtime-stub`: a stand-in implementing the agent runtime's HTTP contract behind a committed adapter seam. The current work increment swaps it for real Hermes (`nousresearch/hermes-agent`), locally first, so the runtime arrives at Juno already proven.
- `supabase/migrations`: app-owned schema, RLS, append-only audit. Canonical state lives in managed Supabase, outside Juno.

The walking skeleton (a natural-language update going capture, propose, validate, confirm, write, audit) runs against real Postgres with CI checks including a cross-tenant isolation test.

## Intended shape on Juno

One Juno project (one namespace) named `serenica`, holding development workloads and application workloads side by side.

| Serenica service | Juno workload | Source or image | Network mode | Notes |
| --- | --- | --- | --- | --- |
| Web UI | `runtime-js` workload | repo `apps/web`, build + run command | `ingress-auth` (or `ingress-noauth` for client previews) | The shareable preview link |
| Control plane API | `runtime-js` workload | repo `apps/api` | `ingress-noauth` | Public webhook routes (Twilio, later Microsoft Graph); verifies provider signatures itself; sole holder of the Supabase service key |
| Worker | `runtime-js` workload | repo `apps/worker` | `clusterip` | No inbound traffic at all |
| Hermes product runtime | Custom workload template | Pinned `nousresearch/hermes-agent` image plus our `serenica-runtime` profile distribution | `clusterip` | Never publicly routable; called only by the control plane; no database credentials; memory off; stateless per task |
| Jarvis (dev assistant) | Official `hermes-agent` plugin | As shipped | `ingress-auth` | Persistent and project-aware; developer tooling only, never touches client data |
| Dev workspace | `web-ide` (code-server) plugin | As shipped | `ingress-auth` | Needs Node 22 + pnpm; Docker availability is an onboarding question |
| Git sandbox | Official `gitea` plugin | As shipped | `ingress-auth` | Agent sandbox repos, mirrored to GitHub on approval |
| MCP server (later) | `runtime-js` workload | future `apps/mcp-server` | `ingress-noauth` | Deferred; external Claude/MCP tool surface |

The `runtime-js`/`runtime-python` workload plugins and the `network_mode` select (`ingress-auth`, `ingress-noauth`, `clusterip`, `nodeport`) are on the public `556-runtime-environments` branch (PR #557). Whether the pilot cluster carries them is the first onboarding question; they fit our services exactly.

```mermaid
flowchart TB
  subgraph project["Juno project: serenica (one namespace)"]
    subgraph devw["Development workloads"]
      ide["Dev workspace\nweb-ide plugin (code-server)"]
      gitea["Git sandbox\ngitea plugin, mirrors to GitHub"]
      jarvis["Jarvis dev assistant\nofficial hermes-agent plugin\ningress-auth, persistent volume"]
    end
    subgraph appw["Application workloads"]
      web["Web UI\nruntime-js, ingress-auth"]
      api["Control plane API\nruntime-js, ingress-noauth\nverifies webhooks itself"]
      worker["Worker\nruntime-js, clusterip"]
      hermes["Hermes product runtime\ncustom headless template\npinned image + serenica-runtime distribution\nclusterip, no public route"]
    end
  end

  subgraph managed["Managed services (outside Juno)"]
    supa["Supabase/Postgres + Auth\nsystem of record"]
  end

  subgraph ext["External providers"]
    twilio["Twilio SMS"]
    models["Anthropic API"]
    graph["Microsoft Graph (later)"]
  end

  web --> api
  api --> hermes
  api --> supa
  worker --> supa
  worker --> hermes
  twilio --> api
  graph --> api
  api --> models
  hermes --> models
  jarvis --> gitea
  ide --> gitea
```

Trust rules survive the move unchanged: the control plane is the only writer; the product runtime has no public route and no database credentials; surfaces and webhooks all enter through the control plane, which verifies them in-app rather than relying on platform auth.

## The two Hermes roles

Same upstream software, two trust levels, two workloads, separate secrets and volumes (full reasoning in ADR-017):

- **Jarvis** is the development assistant: persistent, project-aware, reads the repo and docs, helps build Serenica. The official `hermes-agent` plugin already matches this shape (interactive gateway, dashboard, terminal, durable volume) and can likely be used as-is.
- **The Hermes product runtime** is the tenant-facing executor: headless API server only, messaging gateways off, persistent memory off, fresh stateless session per task, invoked exclusively by the control-plane adapter, output treated as untrusted and schema-validated at our boundary. Configuration is versioned as a Hermes profile distribution (`serenica-runtime`), installed non-interactively at container start, with the image version pinned. We recycle these workers on a schedule (a known upstream memory leak), which is one of the onboarding questions below.

## First pilot milestone

Small and concrete; this doubles as the deployment half of our runtime de-risk spike (ADR-017).

1. Create the `serenica` project; launch the dev workspace and confirm the normal `pnpm` workflow and GitHub access.
2. Register the Terra Source carrying the runtime plugins; confirm `network_mode` options on the pilot cluster.
3. Launch web, API, and worker from the repo via runtime workloads; wire secrets/env to managed Supabase.
4. Deploy the Hermes product runtime workload (pinned image, `serenica-runtime` distribution, `clusterip`).
5. Run the walking-skeleton thread end to end on Juno: a web message becomes a held proposal, approval writes the record and the audit event in Supabase.
6. Expose a preview link for the web UI; confirm the API's public URL shape and stability for future Twilio webhooks.
7. Write down the exact workload configurations and env vars as a repeatable setup note that lands in this repo.

## Onboarding session agenda (the open questions)

1. **Runtime plugins:** is the `556-runtime-environments` branch (PR #557) deployable on the pilot cluster, and is `network_mode: clusterip` the supported pattern for a workload with no public route?
2. **Autoscaling and scale-to-zero:** the June 5 demo described traffic-based horizontal scaling, scale-to-zero, and auto-update on code change for runtime workloads. How do these work, and which workload types do they apply to?
3. **Secrets:** what is the actual mechanism on the pilot cluster for injecting secrets (Supabase service key, Anthropic key, Twilio, GitHub) into specific workloads, and who can read them back?
4. **Webhook URL stability:** is the cluster hostname stable across platform updates, so a Twilio webhook URL set once keeps working?
5. **Per-route auth:** auth appears to be per-workload. Is there a way to gate some routes of one workload behind platform auth while leaving webhook paths public, or do we split workloads (our current plan)?
6. **Scheduled restarts:** any platform pattern for recycling a workload on a schedule or after N requests? We need this for the Hermes runtime regardless of the upstream fix timeline.
7. **Dev workspace Docker:** can the workspace run Docker (socket mount or DinD)? The Supabase CLI's local stack needs it; if not, we develop against a shared dev database instead.
8. **Shared storage:** what backs the shared mounts on the pilot cluster (EFS/NFS), and can multiple workloads mount one workspace volume?
9. **Observability and audit:** what logs, metrics, and platform audit records can we access, and what can be exported? Relevant to our client-facing security packet.
10. **Security evidence in writing:** our product ships with a compliance packet, and its platform-hosting section needs written statements we can cite: the workload-to-workload encryption model (the security page says mTLS; we want the concrete mechanism), namespace isolation, backup/restore, and any certification roadmap.
11. **Pricing shape, later:** deferred by agreement until after discovery. Flagging the constraint early: the product targets small firms and needs hosting economics compatible with a sub-$40 per-seat-equivalent price.

## Success criteria

- The developer works productively in the Juno workspace, and the repo remains a normal portable codebase.
- Web, API, worker, and the Hermes runtime all run from this repo as workloads, with secrets managed sanely.
- The control plane remains the only writer; the product runtime has no public route and no database credentials; managed Supabase remains the system of record.
- Jarvis and the product runtime stay cleanly separated.
- Preview links work for client review, and the webhook URL story holds for SMS.
- The setup is reproducible from a written note, and Juno can contribute written evidence to the security packet rather than being a black box in it.

## Near-term ask

A supported onboarding session focused on this exact stack: create the project, launch the workspace, register the runtime-plugin Source, define the first workloads (web, API, Hermes runtime), settle the secrets mechanism, and walk the milestone list above as far as the session allows. We bring a working system and a written agenda; the output we want is a repeatable configuration and a list of anything the platform needs that we can feed back as pilot users.
