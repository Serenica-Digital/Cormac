# Runbook: secrets and environment

> **Status:** canonical · **Last reviewed:** 2026-06-13

How to generate, inject, and rotate the platform's secrets and environment, local
and on Juno (ADR-034). The variable contract itself lives in the manifest
([packages/config/src/manifest.ts](../../packages/config/src/manifest.ts)); `pnpm
check:env` proves `.env.example`, `docker/compose.yaml`, and the Helm charts agree
with it. The deployable env inventory and the managed-Supabase bootstrap live in
[../prd/deployment-setup.md](../prd/deployment-setup.md).

## Principles

- Secrets are never committed and never baked into an image or a chart default.
  They are read from the environment at boot (server) or injected via
  `secretKeyRef` (Kubernetes). `.env` is gitignored; only `.env.example` is committed.
- The Supabase service-role key is held only by the api (and bootstrap scripts),
  never the browser or the runtime (ADR-003/005).
- In `dev`/`prod` (`APP_ENV`), a missing or unsafe secret fails the boot, loudly
  (`enforceProdRules`); it does not start degraded.

## Local

1. `cp .env.example .env`.
2. Fill the Supabase values from `pnpm db:start` (or `pnpm exec supabase status -o env`).
3. Generate the runtime/MCP secrets:
   ```sh
   echo "RUNTIME_API_KEY=$(openssl rand -hex 24)"
   echo "MCP_WORKSPACE_TOKEN=$(openssl rand -hex 24)"
   ```
4. `ANTHROPIC_API_KEY` from console.anthropic.com (synthetic data only locally).
5. Leave `APP_ENV` at `local`; the dev JWT secret default is fine on a laptop only.

The `REMOTE_*` and `SUPABASE_DB_*` values are namespaced for the managed-Supabase
bootstrap (`db:push:remote`, `seed`, `check:remote`) and never collide with the
local stack.

## Juno (Kubernetes)

Charts read every secret via `secretKeyRef` from one Secret, `cormac-secrets`.
Create it and the GHCR pull secret **before** `helm install` (a documented juno_k3s
race deploys workloads before a later-created secret exists).

```sh
# 1. App secrets. Generate fresh values for the deployment; do not reuse local ones.
RUNTIME_KEY="$(openssl rand -hex 24)"
kubectl create secret generic cormac-secrets -n cormac \
  --from-literal=SUPABASE_SERVICE_ROLE_KEY="<sb_secret_... from the project>" \
  --from-literal=RUNTIME_API_KEY="$RUNTIME_KEY" \
  --from-literal=API_SERVER_KEY="$RUNTIME_KEY" \  # MUST equal RUNTIME_API_KEY
  --from-literal=MCP_WORKSPACE_TOKEN="$(openssl rand -hex 24)" \
  --from-literal=ANTHROPIC_API_KEY="<from the Anthropic console>"
# SUPABASE_JWT_SECRET is intentionally omitted: prod verifies ES256 against the
# JWKS, and the api refuses the public dev secret (ADR-020/034).

# 2. GHCR image pull secret (a default gh token lacks read:packages; mint a PAT).
kubectl create secret docker-registry ghcr-pull -n cormac \
  --docker-server=ghcr.io --docker-username=<gh-user> \
  --docker-password=<PAT with read:packages>
```

Template and the optional External Secrets Operator path:
[../../deploy/helm/secrets.example.yaml](../../deploy/helm/secrets.example.yaml).
On Juno an ESO `ExternalSecret` can synthesize `cormac-secrets` from Vault / AWS
Secrets Manager / Azure Key Vault, changing no chart wiring.

### The pane's custom domain and TLS

The Excel add-in manifest pins the pane's URL near-permanently, so the pane needs a
stable custom domain with TLS. `cert-manager` is an available Terra plugin: set
`ingress.host`, `ingress.tls.enabled`, and `ingress.tls.clusterIssuer` in
[../../deploy/helm/pane/values.yaml](../../deploy/helm/pane/values.yaml), point the
domain's DNS at the cluster ingress, and confirm a `ClusterIssuer` exists. If Juno
cannot serve a per-workload custom host, front the pane with a CDN (Cloudflare).

## Rotation

- **Supabase keys**: rotate in the Supabase project, then update `cormac-secrets`
  (`kubectl create secret ... --dry-run=client -o yaml | kubectl apply -f -`) and
  restart the api. Verification is JWKS-based, so no JWT secret rotation is needed
  in prod.
- **RUNTIME_API_KEY / API_SERVER_KEY (one value) and MCP_WORKSPACE_TOKEN**: generate
  new values, update the Secret, and `kubectl rollout restart` both the api and the
  hermes-runtime so they pick up the new pair together (re-key without downtime:
  brief in-flight runs may fail and are retried by the control plane).
- **ANTHROPIC_API_KEY**: rotate in the Anthropic console, update the Secret, restart
  the hermes-runtime.
- **GHCR PAT (ghcr-pull)**: mint a new fine-grained PAT with `read:packages`,
  recreate the docker-registry secret.

## Pre-onboarding checklist

The deployment-side checklist (keys to generate, GHCR PAT, hosted migration state)
is in [../prd/deployment-setup.md](../prd/deployment-setup.md). The operational
confirmations for Juno (ClusterIssuer, secret backend, CronJob RBAC, hostname
stability, Hermes build) are in
[../../deploy/helm/README.md](../../deploy/helm/README.md) and ADR-034.
