# ADR-017: Use Juno as the preferred orchestration platform for the prototype

**Status:** Accepted as preferred prototype direction, pending onboarding and deployment spike
**Date:** 2026-06-06
**Related:** Builds on ADR-003 (Supabase/Postgres as system of record), ADR-005 (control plane is the only writer), ADR-006 (Hermes as agent runtime, which this ADR gives a place to run and shares a spike with), ADR-014 (Lovable UI only, since the real app is containerized services that run here), ADR-015 (security packet as day-one deliverable, which now needs a platform section), and ADR-016 (the pricing constraint that gates production hosting). The pilot-facing summary is [docs/prd/juno-platform-pilot.md](../prd/juno-platform-pilot.md).

## Context

Serenica CRM Agent needs a real place to run. The architecture has outgrown a purely local or frontend-builder workflow: the product requires a web app, a Node/TypeScript control plane, background workers, connector webhooks, a Dockerized Hermes runtime, possibly an MCP server, and eventually preview and production deployments that can be shown to real clients.

The current preferred direction was AWS, but we have also been offered an early-adopter opportunity with Juno Innovations. In the June 5 Juno meeting, Juno presented its platform as "orchestration as a service" for developer workloads: browser-based workstations, Git/Gitea-style sandbox repositories, one-click workload templates, app runtime containers, shared storage, direct AWS-hosted development-cluster access, and active work on Hermes and Claude Code style agentic development plugins. The meeting framed us as an early pilot user who would start on a Juno AWS development cluster with hands-on onboarding from the Juno team.

Juno's public documentation is still mostly enterprise-oriented. It describes Orion as a unified compute plane, Terra as the plugin and workload deployment layer, and Helios as containerized workstations. The public docs therefore support the broad infrastructure claim but do not fully capture the individual-developer pilot path described in the meeting. This decision relies on both: the public platform capabilities and the private pilot conversation.

The engineering case stands on its own. The product already needs container orchestration, preview deployments, and somewhere to run the Hermes runtime, and Juno offers that with hands-on support instead of forcing us to hand-build it now. The relationship is upside, not the driver: if the project becomes a real example of an agentic SaaS product deployed through Juno, that is useful to both sides, but the decision rests on the portability guardrail in section 3, not on goodwill. The guardrail is also what makes this a parallel track rather than a fork. Because every service stays a portable container, adopting Juno changes where the product runs, not what it is, so the Juno pilot and the development-assistant workflow can proceed alongside the product build without gating it.

## Decision

Use Juno as the preferred development and deployment orchestration platform for the prototype, while preserving portability through normal containers, environment variables, Git, and external service boundaries.

### 1. Juno is the orchestration layer, not the product brain

Juno should run and manage the product's workloads. It should not own the product's authority, contracts, tenant logic, writes, or compliance model.

| Concern | Juno's role | Serenica's role |
| --- | --- | --- |
| Developer workstation | Browser IDE, terminal, project-scoped tools, shared storage | Repo structure, docs brain, coding workflow |
| Workload orchestration | Run containers, expose links, scale, route, manage runtime templates | Define services, build commands, env vars, ports, health checks |
| App backend | Host the control-plane/API/worker containers | Own tenant routing, RBAC, connector policy, proposals, writes, audit |
| Hermes | Host development assistant and product runtime containers | Define separation, adapter, skills, permissions, stateless product runs |
| Infrastructure | Provide AWS/container orchestration without forcing Kubernetes fluency | Keep services portable and deployable outside Juno if needed |
| Security posture | Provide platform controls and deployment evidence | Produce the client security packet and enforce product-level controls |

### 2. Two different Hermes uses must stay separate, and they get different names

There are two uses of Hermes in this project. Blurring them is the exact confusion this project is prone to, so they carry different names:

- **Jarvis, the development assistant.** A Hermes instance configured as a development tool, named Jarvis following the convention other Juno developers use for a personal dev agent. It is used while building Serenica. It can read the repo, ADRs, PRD, research docs, and notes, and can help with coding, planning, Git, and documentation. Its memory and skill files can become part of the development workflow. Jarvis is developer tooling, not a tenant-facing product component, and it never touches client data.
- **The Hermes product runtime.** The Hermes runtime invoked by the Serenica control plane to perform tenant-scoped CRM work. It receives tenant context from the control plane, runs stateless per task where possible, emits structured proposals or answers, and never holds canonical database write authority. This is the runtime governed by ADR-006, ADR-008, and ADR-009.

Jarvis can be opinionated and persistent because it is a developer tool. The Hermes product runtime must be isolated, validated, auditable, and controlled because it touches client data. Same upstream software, different names, different trust levels, separate workloads and secrets and storage.

### 3. Keep the product portable

Every Serenica service should be buildable and runnable as a normal container:

- `apps/web`: React/Lovable-exported web UI.
- `apps/api`: Node/TypeScript control-plane API.
- `apps/worker`: background jobs, connector processing, reports, sync tasks.
- `apps/mcp-server`: external MCP adapter if split from the API.
- `services/hermes-runtime`: Dockerized Hermes runtime adapter or wrapper.
- shared packages for contracts, database access, agent tools, and validation.

Juno can be the preferred place to run those services, but the repo should not become structurally dependent on Juno-specific magic. The product should remain deployable on another container platform if the relationship, pricing, maturity, or client requirements change.

### 4. Use Juno for the de-risk spike, and make it the same spike as ADR-006

This is not a second, separate spike. It is the Hermes seam spike of ADR-006 run in the deployed Juno environment instead of locally. ADR-006 owns the seam success criteria (structured output validates with Zod, both write-gate paths hold, persistent memory off, injection contained). This ADR adds the platform criteria (the containers run without platform-specific rewrites, secrets work, a preview link is shareable, the configuration is reproducible). Run them as one exercise so the seam and the deployment are proven together:

1. Launch a project-scoped dev environment with browser VS Code or equivalent, GitHub access, and the Serenica repo.
2. Run a simple web container and API container from the repo.
3. Connect those containers to the existing Supabase project through environment variables.
4. Run a Dockerized Hermes workload behind the control-plane adapter.
5. Process one natural-language CRM update into a Zod-valid proposal without writing directly from Hermes.
6. Expose a preview link suitable for client review.
7. Document the exact Juno workload configuration needed to reproduce the environment.

The spike should answer whether Juno reduces deployment friction enough to justify becoming the preferred platform for the prototype.

## Consequences

- The development workflow becomes cloud/container-first earlier than it otherwise would. This is good for the product's eventual deployment shape, but it adds a learning curve around Juno, containers, env vars, and remote development.
- Lovable remains useful for the web UI, but the real application is a monorepo of containerized services. Juno becomes the place those services run; Lovable does not own the architecture.
- Supabase can remain managed for v1 unless there is a specific reason to self-host. Juno-hosted services can talk to managed Supabase. A self-hosted Supabase/Postgres option can be revisited later for client-hosted deployments.
- The Juno relationship becomes a real architectural dependency for the prototype, but not an irreversible product dependency because the services stay portable.
- Preferred for the prototype is not committed for production. This decision covers the prototype and the development workflow. Whether Juno hosts production for many small tenants is a separate decision, gated on its pricing fitting the sub-$40 per-seat-equivalent constraint (ADR-016), and it is not decided here. "Preferred orchestration platform" must not be read as "where production runs at scale."
- The security packet must include a Juno/platform section: hosting model, data residency, network boundaries, secrets handling, backups, access controls, audit logs, and what evidence Juno can provide versus what Serenica must provide.

## Alternatives considered

**Deploy directly to AWS without Juno.** This gives maximum control and a standard enterprise story, but it forces the team to solve orchestration, preview deployments, scaling, ingress, container management, and operational workflows much earlier. That is valuable learning, but it slows the product. It also remains the fallback that the portability guardrail keeps open, since Juno itself runs on AWS and EKS underneath.

**Stay local plus managed Supabase plus Vercel-style frontend hosting.** This is simpler for a thin app, but it does not fit the agent runtime, workers, webhooks, MCP surface, Hermes containers, and production-like client previews. It would postpone the exact deployment questions the architecture already needs to answer.

**Let Juno own too much of the product.** Rejected. Juno should orchestrate compute. The product's trust model, database authority, contracts, audit pipeline, pricing, and compliance story must remain Serenica-owned.

## Open items

1. **Onboarding outcome.** Whether the Juno developer workflow is comfortable enough for daily use after the first supported session.
2. **Workload model.** Exact containers, build commands, run commands, ports, shared storage, secrets, and environment-variable handling. Includes whether the dev workspace runs its own Supabase stack through the Terra Supabase/Postgres plugin for dev and preview data (the migrations, seed, and isolation test should run identically against it); canonical state stays in managed Supabase either way.
3. **Hermes separation.** Whether the project assistant Hermes and product runtime Hermes use separate workloads, separate storage, separate skills directories, and separate secrets.
4. **Hosting economics.** Whether Juno's eventual pricing can fit the sub-$40 per-seat-equivalent constraint from ADR-016.
5. **Security evidence.** What Juno can provide for platform-level controls and what Serenica must independently document.
6. **Portability test.** Whether the same containers can be run locally or on a vanilla AWS/container platform without Juno-specific assumptions.
