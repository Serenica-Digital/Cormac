# Juno and Hermes Deployment Research: Verified Findings

> **Status:** reference · **Last reviewed:** 2026-06-10

Five parallel research agents swept the Juno and Hermes documentation, GitHub source, Helm manifests, and issue trackers on 2026-06-10. Every claim below was tagged verified, inferred, or unknown by the agent that found it; this doc keeps that discipline. It feeds two things: the Juno-facing deployment plan (a refresh of [docs/prd/juno-platform-pilot.md](../prd/juno-platform-pilot.md)) and the real-Hermes integration work (ADR-021 open item 1). Where a finding supersedes an earlier research doc, that is flagged inline rather than silently edited.

## Juno: what the platform actually is

The public vocabulary (Orion, Genesis, Hubble, Terra, Helios) hides a more specific internal architecture, visible in the Helm charts:

| Component | Role | Evidence |
| --- | --- | --- |
| Orion | Umbrella name for the compute plane | Marketing plus Orion-Deployment chart |
| Genesis | Admin dashboard: projects, users/groups, storage, Terra app store, workload template catalog | Orion docs, Genesis-Deployment chart |
| Hubble | Per-project portal: browse workload catalog, launch and connect to workloads | Startup guide; runs in each project namespace |
| Kuiper | Workload lifecycle controller: renders workload-template Helm charts with user values and applies them; API under `/kuiper/` | Terra docs, deployment templates |
| Rhea | Authorization service using AWS Cedar policies; sidecar on workload deployments | `system-policies.cedar`, changelogs |
| Terra | Plugin/bundle layer backed by ArgoCD; plugins are Helm charts with a `terra.yaml`; Sources are git repos | Terra-Official-Plugins repo |
| Titan | Licensing/identity bootstrap | Deployment values |
| Helios | Containerized Linux desktop (XFCE streamed via Selkies/WebRTC), launchable as a workload | Helios repo |

A **project** is a Kubernetes namespace with its own Hubble and workload catalog. A **workload template** is a Terra plugin that registers a parameterized Helm chart; launching one renders a **workload**, by convention a single-replica StatefulSet. A **bundle** groups plugins with shared install parameters; a private git repo can be registered as a custom Terra Source, so a "Serenica stack" bundle is feasible.

## Confirmed platform constraints

- **Linux only.** k3s on systemd hosts, WireGuard and cgroupv2 prerequisites. Both amd64 and arm64 nodes supported. No Windows-container story anywhere. (Verified)
- **Workloads are prebuilt images.** `registry`/`repo`/`tag` fields; private registries via `image_pull_secret`. There is no build pipeline; we build and push images ourselves. No Compose support; multi-container means sidecars in the chart. (Verified)
- **No scale-to-zero, no cron workload type, no scheduled-restart mechanism.** Platform HPA exists only for Juno's own services. Hermes leak recycling is therefore our problem to solve (liveness-probe-driven restart or control-plane-driven). (Verified absence)
- **Pricing.** The free Community tier is capped at 2 concurrent workloads; our minimum stack is 5 or more. The pilot has to run under enterprise/pilot terms, which are not public. Per-seat economics cannot be evaluated from public numbers. (Verified)
- **Portability verdict: good.** Everything renders to standard Kubernetes objects via Helm. The only Juno-specific glue is the Hubble `auth-url` ingress annotation and Kuiper labels (which are inert off-platform). Leaving Juno means extracting the embedded chart and replacing the auth annotation. (Verified for the mechanics; effort inferred)

## Networking, and the private-workload gap

- Ingress is NGINX with path-based routing (`/<plugin>/<workload-name>/` on one cluster host). URLs are stable while the workload name and cluster host are stable; whether the pilot cluster hostname is stable across redeployments is unknown.
- Workload auth is per-workload, not per-route: a `publicAccess` toggle (seen in the Helios plugin) switches between Hubble-auth-gated and fully public. The control plane API needs public routes for Twilio and Graph webhooks, so that workload runs public and does its own signature verification, which matches our architecture (ADR-005).
- SSE and WebSocket work through the ingress; timeouts are per-workload annotations (the hermes-agent plugin sets 600s).
- **There is no documented way to deploy a workload with zero ingress.** Every official plugin creates an Ingress. The Hermes product runtime must never be publicly routable, so this is the top question for the Juno team. A custom template that simply omits the Ingress resource should work on plain Kubernetes grounds, but it is unverified on the platform.
- **The mTLS claim on the security page is not substantiated by the manifests.** No service mesh is deployed; cross-node traffic is WireGuard-encrypted at the k3s layer, which is not pod-to-pod mTLS. Do not cite mTLS in the client security packet until Juno explains the mechanism in writing.

## Secrets, storage, observability

- **Secrets reality:** standard Kubernetes Secrets and env vars. The `secret: true` field flag in `terra.yaml` is a UI mask, not a backend. External Secrets Operator / Vault / SOPS are "compatible with", not operated by, the platform; no plugin for any of them exists in the official repo. What the hosted pilot actually provides is a question for Juno.
- **Storage:** `local-path` (k3s default) is the default storage class; Longhorn (pinned to v1.10.x), NFS, and hostpath are available as plugins; Velero for backup. PVCs survive pod restarts per StatefulSet semantics.
- **Observability:** kube-prometheus-stack plugin (in the orion-essentials bundle). No log-aggregation plugin exists. The security page's "immutable audit logs" and "SIEM syslog export" claims are not substantiated by manifests; webhook export is stated as roadmap. Treat platform audit logging as unproven until evidenced.

## The official hermes-agent plugin, and Helios, examined

- An official **hermes-agent Terra plugin exists** (chart v0.0.1). It runs the `nousresearch/hermes-agent` image as a StatefulSet with a 1Gi PVC mounted at `/opt/data` (set as `HERMES_HOME`), an nginx sidecar, and an always-auth-gated ingress, and it starts the gateway, the dashboard, and a Wetty browser terminal. That shape is interactive and persistent: it matches **Jarvis**, not the product runtime. The product runtime needs our own headless workload template (API server only, no dashboard, no terminal, no ingress if possible).
- **Helios is a streamed Linux desktop, not a code IDE.** Stock images have no Node, no pnpm, and no Docker, so `supabase start` cannot run in a stock Helios workspace. The `web-ide` plugin (code-server) is the closer fit for our dev workflow. Docker-in-workspace (socket mount or DinD) is a Juno question.
- **No Supabase/Postgres plugin exists in the official Terra repo** (verified absent from the full plugin listing). The board item "Try the Terra Supabase/Postgres plugin as the dev-workspace database" and the matching line in the Juno evaluation are based on something the official repo does not contain; the item needs to be re-grounded (community plugin, custom plugin, or drop).
- A **Gitea plugin** exists for the sandbox-repo workflow.

## Hermes delta check (against the v0.16.0 / 2026-06-05 baseline)

| Item | Status | Evidence |
| --- | --- | --- |
| Current version | No change. v0.16.0 is still latest (no release since 2026-06-05) | GitHub releases |
| Memory leak #25315 | **Still open, unpatched, P1.** 400MB grows to 20-37GB over 20-35h | Issue tracker |
| Structured output over HTTP | **No change: still absent.** Zero `response_format` hits in current `api_server.py`; instruct-and-parse remains the HTTP path; `complete_structured` remains skill-side only | Source inspection |
| Hooks | **Material change, and it supersedes the hook caveat in [hermes-agent-runtime-evaluation.md](hermes-agent-runtime-evaluation.md) and ADR-006 section 2.** Issue #2817 was closed as implemented on 2026-04-27 (PR #2820): `pre_llm_call`, `post_llm_call`, `on_session_start`, `on_session_end` are wired, plus `transform_tool_result`, `transform_llm_output`, `pre_gateway_dispatch`, `pre_approval_request`, `post_approval_response`, and others. The evaluation was stale on this point even at its June 6 review date | Issue #2817 comments with line numbers; hooks docs |
| Approval endpoint / SSE / run cap | No change (`_MAX_CONCURRENT_RUNS = 10`); approval body now also accepts `"all": true` to bulk-resolve | Source inspection |
| New security issues | Two open, neither blocking: #41374 (moderate dependency CVE pins) and #42667 (Matrix-adapter XSS, a gateway we never enable). No published GHSA advisories | Issue tracker |

The hooks expansion does not force any redesign (the `pre_tool_call` write-gate plan stands) but it widens our options: `on_session_start`/`on_session_end` exist for lifecycle audit, and `transform_llm_output` could enforce output policy runtime-side.

## Running Hermes headless: the verified recipe

- **Image:** `nousresearch/hermes-agent:latest` (~1GB, Docker Hub), s6-overlay as PID 1, state under `/opt/data` (`HERMES_HOME`), API on port 8642. Pin a tag, not `latest`.
- **API server:** `API_SERVER_ENABLED=true`, `API_SERVER_HOST=0.0.0.0`, `API_SERVER_KEY=<secret>`, `API_SERVER_PORT=8642`.
- **Gateways off:** there is no master switch. Each messaging adapter activates only if its platform token env var is present; an `.env` with no platform tokens yields an API-server-only gateway. Open item to verify locally: that `hermes gateway run` runs cleanly with zero messaging adapters configured.
- **Memory off (verified keys):** `memory.memory_enabled: false` and `memory.user_profile_enabled: false` in `config.yaml`. The Python-library path also supports `skip_memory=True`.
- **Cron:** driven by the gateway's 60s tick reading `cron/jobs.json`; an empty jobs file means no cron activity; no disable flag exists.
- **Resources:** 300-600MB resident for an API-only profile; plan ~1GB per concurrent container; official compose ceiling 4G/2cpu. The leak makes periodic recycling mandatory.
- **State:** SQLite only (`state.db`); no external-DB option. If the control plane reads provenance synchronously after each run, `state.db` can be ephemeral; Jarvis needs a durable volume for the full `HERMES_HOME`.
- **Health and restarts:** `GET /health` exists, but the image's Docker HEALTHCHECK is process-liveness only (issue #9751); use an HTTP probe. Graceful drain (`agent.restart_drain_timeout`) is unreliable in practice (issues #27745, #19153): treat a mid-run restart as a failed run and retry from the control plane.
- **Profiles and distributions (the per-tenant and templating mechanism):** profile creation and `hermes profile install <git-url> --name <n> -y` are non-interactive and container-suitable. `distribution.yaml` supports `env_requires` (install-time env checks), `hermes_requires` (minimum version), and `distribution_owned` (files replaced on update; user data and `.env` never touched). One `serenica-runtime` distribution repo can version the product agent across all tenant profiles; a separate `jarvis` distribution versions the dev assistant. Unverified edge: whether a missing `required: true` env var hard-fails a `-y` install.
- **Isolation:** profiles do not sandbox the filesystem (verified caveat). The container is the tenant isolation boundary; the profile is the config layout inside it. One container per tenant remains the supported pattern (single-daemon multi-tenant serving, issue #9514, is open and unassigned).

## Hermes doc triage: where the signal is

- **Product-runtime core (read before building):** configuration, api-server, docker, hooks, profiles, profile-distributions, creating-skills, plugin-llm-access, architecture, cli-commands, python-library, credential-pools, fallback-providers.
- **Control-plane reference (we never enable these in Hermes, we reimplement the pattern):** microsoft-graph-app-registration (Azure AD registration and consent for our Graph connector); msgraph-webhook (the exact Graph validation handshake and subscription lifecycle); messaging/sms (Twilio HMAC-SHA1 signature validation); the teams-meeting-pipeline skill (Graph subscription 72h renewal pattern); messaging/webhooks (HMAC, idempotency, rate-limit patterns); finance-excel-author (auditable-workbook conventions for the ADR-022 workbook generator).
- **Jarvis:** personality/SOUL, tips, team-telegram-assistant, memory-providers, context-files, kanban, slash-commands.
- **Noise:** the ~20 consumer messaging gateways, the 75-skill bundled catalog, voice mode, desktop app, ACP/IDE integration, Nous Portal.
- **Flag to verify locally:** the API server starts under `hermes gateway` as a platform adapter; confirm an API-server-only profile starts the gateway runner cleanly (same as the gateways-off item above).

## Open questions

**For the Juno team (the ask list for the pilot doc):** zero-ingress workloads for the product runtime; pilot hostname stability for webhook URLs; the actual secrets mechanism in the hosted pilot; what mTLS concretely is; Docker inside the dev workspace; any scheduled-restart pattern; the pilot license tier versus the 2-workload Community cap; audit-log access and export; SOC 2 / ISO roadmap; the pricing model against sub-$40 per-seat economics.

**For local verification (cheap, this week):** gateway behavior with zero messaging adapters; cron tick with an empty jobs file; whether `state.db` tolerates tmpfs; `env_requires` failure behavior on non-interactive install.

## Mapping draft: Serenica services to Juno constructs

| Serenica component | Juno construct | Key config | Open question |
| --- | --- | --- | --- |
| Web UI | Custom workload template (private Terra Source) | Prebuilt image; public or auth-gated ingress for previews | Preview links for non-Juno users |
| Control plane API | Custom workload template | Public ingress (webhooks); secrets as k8s Secrets; SSE timeout annotation | Stable hostname; per-route auth |
| Worker | Custom workload template | No ingress; queue/cron driven | Zero-ingress support |
| Hermes product runtime | Custom **headless** workload template (not the official plugin) | API server only; no ingress; HTTP liveness probe; recycling policy; one container per tenant | Zero-ingress support; scheduled restarts |
| Jarvis | Official hermes-agent plugin fits as-is | Auth-gated ingress, durable PVC, gateway+dashboard | None blocking |
| MCP server (future) | Custom workload template | Public, token-authenticated | Deferred |
| Dev workspace | web-ide (code-server) plugin, or extended Helios image | Needs Node 22 + pnpm; Docker for `supabase start` | Docker-in-workspace |
| Git sandbox | Official gitea plugin | Mirrors to GitHub | None blocking |
| Supabase/Postgres | Stays managed, external | Env/secrets from workloads | No official Terra plugin exists; dev-DB board item needs re-grounding |

## How this applies to us

1. **Nothing blocks starting real-Hermes integration locally today.** The headless recipe is documented and verified; the adapter seam is committed (ADR-021); the open questions are all cheap local tests.
2. **The product runtime on Juno is a custom Terra workload template we author**, in a private Terra Source repo, ideally as part of a Serenica bundle. The official hermes-agent plugin is effectively a ready-made Jarvis.
3. **The pilot doc refresh can now be written in Juno's exact vocabulary** (workload templates, Kuiper, Terra Sources, bundles, projects) with a verified ask list instead of generic questions.
4. **Two earlier docs are stale on specific points:** the Hermes evaluation's hook caveat (superseded above) and the Juno evaluation's Supabase-plugin mention (no such official plugin). The board item on the Terra Supabase plugin needs re-grounding.

## Primary sources

Juno: Orion docs (juno-fx.github.io/Orion-Documentation), Genesis/Orion/Terra/Helios GitHub repos under github.com/juno-fx, juno-innovations.com (security, pricing). Hermes: hermes-agent.nousresearch.com/docs (configuration, api-server, docker, profiles, profile-distributions, hooks, messaging, guides), github.com/NousResearch/hermes-agent (releases, `gateway/platforms/api_server.py`, issues #25315, #2817, #9514, #9751, #19153, #27745, #41374, #42667). Full per-claim URL logs are preserved in the session transcript of 2026-06-10.
