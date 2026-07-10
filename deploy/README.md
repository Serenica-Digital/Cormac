# Deploy: plain containers + Helm (ADR-0003)

Cormac ships as plain OCI images and vanilla-Kubernetes Helm charts designed
against EKS. No platform packaging: Juno is a swappable dev substrate, and
these charts must apply anywhere (kind, Juno's shared cluster, EKS) unchanged.
Deployment claims count as proven only from running pods, never from rendered
templates.

## Layout

- `docker/` — three images, build context = repo root:
  - `Dockerfile.control-plane` (Fastify via tsx, port 8080)
  - `Dockerfile.web` (Vite build baked at image build → nginx static, port
    5174; args `SUPABASE_URL` `SUPABASE_ANON_KEY` `CORMAC_API_URL` `WEB_BASE`)
  - `Dockerfile.hermes` (upstream `nousresearch/hermes-agent:v2026.6.19` +
    both ADR-0008 profiles baked; `PROFILE` env selects one at start;
    `hermes-entrypoint.sh` applies the lockdown and pins the metered staging
    lane, ADR-0007 — the dev/codex lane is host-only)
- `charts/` — `control-plane`, `web`, `hermes` (the hermes chart installs
  twice: releases `cormac-hermes-authoring` / `cormac-hermes-ops` via
  `values-authoring.yaml` / `values-ops.yaml`; ClusterIP only, no ingress)
- `scripts/` —
  - `secrets-from-infisical.sh` — creates the one `cormac-secrets` Secret as
    a derived copy of the staging vault (explicit allowlist; Infisical stays
    the authority; no ESO on clusters we do not control)
  - `render-manifests.sh` — `helm template` → `rendered/*.yaml`, secret-free
    by construction (safe to hand to a namespace agent); `KIND=1` targets the
    local smoke images
  - `build-push.sh` — linux/amd64 buildx → `ghcr.io/serenica-digital/
    cormac-{control-plane,web,hermes}:<short-sha>`; `--only web` for the
    in-session rebuild once the real API origin is known
  - `kind-smoke.sh` / `kind-smoke-down.sh` — local proof (`WITH_HERMES=1`
    adds both gateways)

## Env contract

The control plane reads process env only (`apps/control-plane/src/config.ts`):
non-secrets ride the chart ConfigMap, secrets ride `cormac-secrets`
(`SUPABASE_SERVICE_ROLE_KEY`, `HERMES_API_KEY`; gateways add
`ANTHROPIC_API_KEY` and their agent token). In-cluster URLs are Service DNS
(`http://cormac-control-plane:8080`); the vault's host-lane URLs
(`CORMAC_CONTROL_PLANE_URL` and friends) never enter the cluster. The web
bundle is static: changing its API origin means rebuilding the image, not
editing values.

The control plane holds one runtime lane per agent kind
(`HERMES_AUTHORING_URL`, `HERMES_OPS_URL`); both are wired to the in-cluster
gateway Services by default, so the interview and capture work
simultaneously. Blank a lane's URL in values to disable it (its feature
answers 503; the other lane is unaffected) — do that when a deployment
deliberately omits the gateway pods.

## Shared-cluster session runbook (Juno)

Pre-flight, in order:

1. **GHCR pull secret before any workload** (the June 2026 race):
   `kubectl -n $NS create secret docker-registry ghcr-pull
   --docker-server=ghcr.io --docker-username=<user> --docker-password=$PAT`
   (packages:read PAT, revoke after the session).
2. Quota: floor+middle needs ~0.5 CPU / 1.2Gi requests; each gateway adds
   250m / 1Gi limit.
3. Egress probes from a throwaway pod: staging Supabase, `api.anthropic.com`,
   `ghcr.io`.
4. Learn the routing shape (shared-host path routing preferred; no
   ClusterIssuer exists there, so TLS stays off in chart values) and record
   the web + API origins.
5. Rebuild web with the real origin: `infisical run --env=staging -- sh -c
   'CORMAC_API_URL=<api-origin> deploy/scripts/build-push.sh --only web'`
   (add `WEB_BASE=/sub/path/` for path routing), patch `CORS_ORIGINS`,
   rollout restart. The pre-pushed web image bakes
   `CORMAC_API_URL=http://localhost:8080`, which works as-is for a
   port-forward-only demo (forward the control plane on 8080 and the web on
   any local port, with `CORS_ORIGINS` including that web origin).
6. Supabase staging dashboard: add the web origin to the auth redirect
   allowlist.

Deploy order: `secrets-from-infisical.sh` → control-plane → web → gateways.
With kubectl: `helm upgrade --install` per chart. Without kubectl: hand the
`render-manifests.sh` output (00→03) to the namespace agent — the derived
Secret must never transit an agent's context; get a one-shot kubectl grant
for the secrets script instead, and never paste secret values to an agent.

Success bars: floor = control-plane pod Running + `/health` 200 through the
cluster route or port-forward; middle = web served, staging sign-in works, a
workspace read renders; stretch = one gateway pod Running and a live turn end
to end on the metered lane.

Cleanup: `helm uninstall` the four releases; delete `cormac-secrets` and
`ghcr-pull`; revoke the session PAT; revoke/re-mint staging agent tokens if
exposure is suspected.

## Known limits (deliberate, this round)

- Gateway conversation state lives on an emptyDir: a spot-instance kill mid
  interview loses the conversation. Acceptable on the dev substrate.
- No CI image pipeline yet; `build-push.sh` is the manual path.
- Control-plane image ships dev deps (tsx path, no compile step) — follow-up.
