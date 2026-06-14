# Juno Platform Pilot Plan

> **Status:** canonical · **Last reviewed:** 2026-06-14

**Audience:** the Juno Innovations team and Serenica Digital project collaborators. This is the scope document the June 5 meeting asked for, and the working agenda for the onboarding session. It is written in Juno's own platform vocabulary (projects, workload templates, Terra Sources, plugins, bundles) so the mapping is direct. Platform facts below were verified against the public juno-fx repos and docs on 2026-06-10; items the public record cannot settle are marked as onboarding questions, since the June 5 meeting was clear that the docs trail the platform. The deeper research record is [docs/research/juno-hermes-deployment-research.md](../research/juno-hermes-deployment-research.md).

## Summary

**Cormac** is Serenica Digital's product (ADR-029): a contract-first CRM agent platform for small, relationship-heavy businesses that run on spreadsheets, Microsoft 365, email, and text. Clients bring their Excel workbooks; Cormac lifts each into a governed, versioned semantic contract and operates on it through an agent reachable over web, SMS, email, Excel, and Claude/MCP.

The pilot goal: build and run Cormac on Juno as a real agentic SaaS use case. A multi-service containerized application (web UI, control-plane API, worker, a Dockerized Hermes runtime), managed Supabase/Postgres as the external system of record, and a project-scoped development environment with a dev-assistant agent. Juno is the orchestration and deployment layer; Cormac's application logic, trust model, database authority, and compliance packet stay in its own repo, and every service stays a portable container.

## The vocabulary for the room

The mapping between how this repo already works and how Juno talks about it. The short version: the charts under `plugins/` are each a Terra plugin and a plain Helm chart at once (ADR-039), Terra/ArgoCD is the deploy path, Juno is the venue, and the images are identical everywhere. The faithful pre-onboarding rehearsal runs on a Juno-shaped `kind` stack; plain k3d is a fast chart-correctness loop being retired (ADR-039).

| Term in the room | What it means | What it maps to in this repo |
| --- | --- | --- |
| Image | A frozen, shippable snapshot of one program and everything it needs to run. Built by CI, pushed to a registry (GHCR for us). Contains no secrets. | The four published images in [deployment-setup.md](deployment-setup.md) (api, worker, web, hermes-runtime), plus the planned addin image |
| Container | A running copy of an image, isolated from everything else on the machine. Start one, stop one, throw it away; the image is unchanged. | What `pnpm dev` (the charts on k3d) starts locally; what Juno starts in the cluster |
| Workload | Juno's unit of management: one container plus its resources (CPU/memory), networking, and env vars. | One Helm chart and workload. The translation is one-to-one |
| Workload template / plugin (Terra) | A reusable recipe for launching a workload, parameterized (image, env, ports, resources). | The official plugins we use as-is for dev tools; one custom template for the Hermes runtime |
| Project / namespace | The isolation boundary that groups workloads; nothing outside it can reach `clusterip` services inside it. | The one `cormac` project |
| `ingress-auth` / `ingress-noauth` / `clusterip` | Who can reach a workload: public behind Juno's login / public and open (the app does its own auth) / internal to the namespace only. | web is `ingress-auth`, api is `ingress-noauth` (webhooks verify themselves), worker and hermes-runtime are `clusterip` |
| Cluster DNS | Workloads address each other by service name inside the namespace. | `http://cormac-api:8088` works identically in local k3d and on Juno |
| Secret | A sensitive env value injected into a workload at deploy, never baked into an image or a template default. | The pre-session checklist in [deployment-setup.md](deployment-setup.md) |
| Volume / mount | Persistent disk attached to a workload, surviving restarts. | Jarvis's memory volume. The app workloads are deliberately stateless; state lives in managed Supabase |

## What exists today (what the pilot deploys)

This is not a greenfield. The repo is a pnpm monorepo of normal containers, already running end to end locally:

- `apps/web`: minimal React/Vite web surface.
- `apps/api`: the control plane (Node/TypeScript, Fastify). The trust layer and the only writer of business records. Verifies Supabase JWTs, enforces RBAC, runs the proposal/confirmation/audit pipeline, and serves the agent runtime's tool surface over MCP at `/mcp` (workspace-scoped bearer token; the runtime's only reach into data).
- `apps/worker`: a minimal long-running job container (health endpoint today; the weekly change report and inbound connector processors land here).
- The agent runtime: real Hermes (`nousresearch/hermes-agent`, pinned version), configured by a profile versioned in `docker/hermes-runtime/`: headless API server only, messaging gateways off, memory off, tools allowlisted to the control plane's MCP endpoints, no database credentials. Landed and proven locally (ADR-026), then optimized: the control plane compiles each tenant's context into a cached prompt prefix, and a typical agent task now runs 2-3 tool calls, 8-15 seconds, about three cents (ADR-027). The runtime arrives at Juno already measured, which matters for the capacity and pricing conversation. (`services/runtime-stub` remains in the repo as a test fixture only; it no longer runs in the stack.)
- `docker/`: the Dockerfiles for every service and the Hermes runtime profile. `plugins/`: the charts that run the whole stack, each a Terra plugin and a plain Helm chart at once (ADR-039); the Terra bundle is `bundles/cormac.yaml`.
- `supabase/migrations`: app-owned schema, RLS, append-only audit. Canonical state lives in managed Supabase, outside Juno.

The walking skeleton (a natural-language update going capture, propose, validate, confirm, write, audit) runs against real Postgres with CI checks including a cross-tenant isolation test.

## Intended shape on Juno

One Juno project (one namespace) named `cormac`, holding development workloads and application workloads side by side.

The translation rule is mechanical. Each chart under `plugins/` is one Juno workload running the same image, and the same chart runs locally. Cluster DNS (`http://cormac-api:8088`) is identical everywhere; secret values come from Infisical, synced into Kubernetes Secrets by ESO (which we own and install ourselves, since Juno ships no secret operator, ADR-039). Each `plugins/<workload>/` directory is a Terra plugin (it carries `terra.yaml`) and a plain Helm chart at once, and the `cormac` bundle is [../../bundles/cormac.yaml](../../bundles/cormac.yaml). Terra discovers the plugins under `plugins/` at the Source repo root, creates one ArgoCD Application per plugin, and ArgoCD syncs each chart. That is the one deploy path; direct `helm install` stays available as a portability escape hatch, not a second pipeline. We also own cert-manager and the ClusterIssuer for TLS, and cluster internet egress is a hard prerequisite (ADR-039). The step-by-step deploy is [../runbooks/deploy-to-juno.md](../runbooks/deploy-to-juno.md).

The application workloads, end to end from repo to cluster:

| Service | Repo source | Build recipe | Local k3d service (port) | Published image | Juno workload (network mode) |
| --- | --- | --- | --- | --- | --- |
| Web UI | `apps/web` | `docker/Dockerfile.web` | `web` (5174) | `ghcr.io/serenica-digital/web` | Image workload, `ingress-auth` (or `ingress-noauth` for client previews); the shareable preview link |
| Control plane API | `apps/api` | `docker/Dockerfile.node` | `api` (8088) | `ghcr.io/serenica-digital/api` | Image workload, `ingress-noauth`: public webhook routes (Twilio, later Microsoft Graph) with in-app signature verification; sole holder of the Supabase service key; serves the runtime's MCP tools at `/mcp` |
| Worker | `apps/worker` | `docker/Dockerfile.node` | `worker` (8070) | `ghcr.io/serenica-digital/worker` | Image workload, `clusterip`; no inbound traffic at all |
| Hermes product runtime | upstream `nousresearch/hermes-agent` (pinned) + profile in `docker/hermes-runtime/` | `docker/Dockerfile.hermes` (bakes the profile; secrets stay env-injected) | `hermes` (8642) | `ghcr.io/serenica-digital/hermes-runtime` | Custom workload template, `clusterip`: never publicly routable, called only by the control plane, tools only via the control plane's MCP surface, no database credentials, memory off, stateless per task |
| Excel pane assets (planned; gated on the ADR-028 GO/NO-GO) | `apps/addin` (planned) | static-server Dockerfile (planned) | none yet | `ghcr.io/serenica-digital/addin` | Image workload, `ingress-noauth`: a pure static file server for the task pane's web assets. Office.js itself runs in Excel's webview on the client machine, never here. No secrets, no database access. Must be publicly reachable (Excel loads it directly), must NOT send `X-Frame-Options: SAMEORIGIN`, and needs a stable custom domain because the add-in manifest pins the source URL effectively permanently (see onboarding question 12) |
| System of record | `supabase/migrations` (schema only) | none | managed dev Supabase (the local CLI stack is CI-only, ADR-038) | none | **Not a workload.** Managed Supabase/Postgres outside Juno; every workload reaches it over the network |

The development workloads are official plugins used as shipped:

| Workload | Juno plugin | Network mode | Notes |
| --- | --- | --- | --- |
| Jarvis (dev assistant) | Official `hermes-agent` plugin | `ingress-auth` | Persistent and project-aware; developer tooling only, never touches client data |
| Dev workspace | `web-ide` (code-server) plugin | `ingress-auth` | Needs Node 22 + pnpm; Docker availability is an onboarding question |
| Git sandbox | Official `gitea` plugin | `ingress-auth` | Agent sandbox repos, mirrored to GitHub on approval |

The eventual external Claude/MCP connector is a later surface on the control plane API (an adapter over the same agent pipeline, per ADR-007), not a separate service; it adds no workload to this table.

A note on the build path: the `runtime-js`/`runtime-python` plugins on the public `556-runtime-environments` branch (PR #557) clone a repo and run a build command per workload, which fits single-package repos. Ours is a pnpm monorepo with workspace dependencies and a build order, so the app services deploy as CI-built images from the Dockerfiles already in the repo, and the runtime plugins remain attractive for quick one-off previews. What we want from PR #557 either way is its `network_mode` select (`ingress-auth`, `ingress-noauth`, `clusterip`, `nodeport`); whether the pilot cluster supports those modes for image workloads is the first onboarding question.

```mermaid
%%{init: {"theme": "base", "themeVariables": {
  "fontSize": "18px",
  "primaryTextColor": "#111111",
  "lineColor": "#495057",
  "edgeLabelBackground": "#f1f3f5",
  "clusterBkg": "#ffffff",
  "clusterBorder": "#adb5bd",
  "titleColor": "#111111"
}}}%%
flowchart LR
  subgraph people["People"]
    direction TB
    clients["Client users\nbrowser · Excel pane · texts"]
    developer["The developer"]
  end

  twilio["Twilio\nSMS provider"]

  subgraph juno["Juno project: cormac — one namespace"]
    direction TB
    subgraph appw["Application workloads — CI-built images from this repo"]
      direction TB
      web["web\nReact UI\ningress-auth"]
      pane["addin — planned\nExcel pane static assets\ningress-noauth, custom domain\ngated on ADR-028 GO/NO-GO"]
      api["api — control plane\nthe only writer\ningress-noauth, verifies\nwebhooks itself, serves /mcp"]
      worker["worker\njobs, no inbound traffic\nclusterip"]
      hermes["hermes-runtime\npinned image + baked profile\nclusterip, no public route,\nno database credentials"]
    end
    subgraph devw["Development workloads — official plugins, used as shipped"]
      direction TB
      ide["Dev workspace\nweb-ide plugin\ncode-server"]
      jarvis["Jarvis dev assistant\nhermes-agent plugin\npersistent volume"]
      gitea["Git sandbox\ngitea plugin\nmirrors to GitHub"]
    end
  end

  subgraph managed["Managed services — outside Juno"]
    direction TB
    supa["Supabase\nPostgres + Auth\nsystem of record"]
    anthropic["Anthropic API\nmodel provider"]
  end

  clients --> web
  clients --> pane
  clients -->|"text message"| twilio
  twilio -->|"signed webhook"| api
  developer --> ide
  developer --> jarvis

  web --> api
  pane --> api
  api -->|"task + context"| hermes
  hermes -->|"MCP tool calls"| api
  ide --> gitea
  jarvis --> gitea

  api --> supa
  worker --> supa
  hermes --> anthropic

  classDef surface fill:#fff3cd,stroke:#b58900,color:#222;
  classDef plannedSurface fill:#fff3cd,stroke:#b58900,color:#222,stroke-dasharray:6 4;
  classDef trust fill:#d1e7dd,stroke:#146c43,color:#111;
  classDef runtime fill:#e7f1ff,stroke:#0d6efd,color:#111;
  classDef data fill:#f8d7da,stroke:#842029,color:#111;
  classDef third fill:#e2e3e5,stroke:#41464b,color:#111;
  classDef devtool fill:#ede7f6,stroke:#5e35b1,color:#111;

  class web surface;
  class pane plannedSurface;
  class api,worker trust;
  class hermes runtime;
  class supa data;
  class anthropic,twilio,developer,clients third;
  class ide,jarvis,gitea devtool;

  style people fill:#ffffff,stroke:#adb5bd,color:#111111;
  style juno fill:#ffffff,stroke:#495057,stroke-width:2px,color:#111111;
  style appw fill:#f8f9fa,stroke:#adb5bd,color:#111111;
  style devw fill:#f8f9fa,stroke:#adb5bd,color:#111111;
  style managed fill:#ffffff,stroke:#adb5bd,color:#111111;
```

Color language matches [architecture.md](architecture.md): yellow = client surfaces, green = our trust layer, blue = the agent runtime, red = the system of record, gray = external parties, purple = development tooling that never touches client data. Dashed border = planned, not yet built. Reading it left to right: people reach the surfaces, surfaces talk only to the api, the api is the only path to the runtime and the only writer to Supabase, and the runtime's only reaches are its tool calls back into the api and the model provider.

Trust rules survive the move unchanged: the control plane is the only writer; the product runtime has no public route and no database credentials; surfaces and webhooks all enter through the control plane, which verifies them in-app rather than relying on platform auth.

## The two Hermes roles

Same upstream software, two trust levels, two workloads, separate secrets and volumes (full reasoning in ADR-017):

- **Jarvis** is the development assistant: persistent, project-aware, reads the repo and docs, helps build Cormac. The official `hermes-agent` plugin already matches this shape (interactive gateway, dashboard, terminal, durable volume) and can likely be used as-is.
- **The Hermes product runtime** is the tenant-facing executor: headless API server only, messaging gateways off, persistent memory off, fresh stateless session per task, invoked exclusively by the control-plane adapter. Its tools are MCP endpoints served by the control plane and allowlisted per agent role, so every action passes through our validation and lands as a held proposal, never a direct write. Configuration is versioned in-repo at `docker/hermes-runtime/` and baked into the pinned `hermes-runtime` image; secrets are env-injected at deploy. We recycle these workers on a schedule (a known upstream memory leak), which is one of the onboarding questions below.

## First pilot milestone

Small and concrete; this doubles as the deployment half of our runtime de-risk spike (ADR-017).

1. Create the `cormac` project; launch the dev workspace and confirm the normal `pnpm` workflow and GitHub access.
2. Register the Terra Source carrying the runtime plugins; confirm `network_mode` options on the pilot cluster.
3. Launch web, API, and worker as CI-built image workloads; wire secrets/env to managed Supabase.
4. Deploy the Hermes product runtime workload (the baked `hermes-runtime` image, `clusterip`).
5. Run the walking-skeleton thread end to end on Juno: a web message becomes a held proposal, approval writes the record and the audit event in Supabase.
6. Expose a preview link for the web UI; confirm the API's public URL shape and stability for future Twilio webhooks.
7. Finalize the repeatable setup note: the image list, per-workload env inventory, and the managed-database bootstrap are already drafted in [deployment-setup.md](deployment-setup.md); the session fills in whatever the cluster changes.

## Onboarding session agenda (the open questions)

> **Resolved against the live juno-fx docs and repos, deepened by the ADR-039 research pass** (these were "unknown" on 2026-06-10; the charts that encode them live in [../../plugins/](../../plugins/)): **#1** our own charts render a ClusterIP Service and no Ingress, so `clusterip` needs no dependency on PR #557 (still open). **#3** secrets are standard k8s Secrets injected via `secretKeyRef`; Juno ships no secret operator, so ESO + Infisical is fully Cormac-owned and we install ESO ourselves (ADR-039). **#6** Juno has no native recycle, so the Hermes chart ships a CronJob `rollout restart` plus a memory limit (the upstream leak #25315 is unfixed in v0.16.0). **#10** the security page claims pod-to-pod mTLS. **#12** Juno ships no cert-manager and no issuer, so we own the whole TLS stack: install the `cert-manager` Terra plugin and create our own `ClusterIssuer` (Let's Encrypt, Route53 DNS-01 on AWS), optionally with ExternalDNS (ADR-039). The residual asks are now operational confirmations: DNS for the pane domain can be delegated (#12); who can read the ESO-synced secret back (#3); CronJob RBAC in our namespace (#6); hostname stability across updates (#4); cluster internet egress is provisioned (the EKS template defaults to NAT gateway disabled, a cluster-creation gate, ADR-039); and which Hermes build the pilot runs.

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
12. **Custom domains with TLS on a workload:** can a specific workload be served under a stable custom domain we own (for example `pane.<product-domain>`), with certificate management? This is stricter than question 4's webhook stability: the planned Excel task-pane workload's domain gets pinned into the Office add-in manifest, which propagates to client machines slowly and is effectively permanent. A Juno-generated cluster hostname is not sufficient for that one workload; if custom domains are not supportable, the pane's static assets move to a CDN while everything else stays on Juno.

## Success criteria

- The developer works productively in the Juno workspace, and the repo remains a normal portable codebase.
- Web, API, worker, and the Hermes runtime all run from this repo as workloads, with secrets managed sanely.
- The control plane remains the only writer; the product runtime has no public route and no database credentials; managed Supabase remains the system of record.
- Jarvis and the product runtime stay cleanly separated.
- Preview links work for client review, and the webhook URL story holds for SMS.
- The setup is reproducible from a written note, and Juno can contribute written evidence to the security packet rather than being a black box in it.

## Near-term ask

A supported onboarding session focused on this exact stack: create the project, launch the workspace, register the runtime-plugin Source, define the first workloads (web, API, Hermes runtime), settle the secrets mechanism, and walk the milestone list above as far as the session allows. We bring a working system and a written agenda; the output we want is a repeatable configuration and a list of anything the platform needs that we can feed back as pilot users.
