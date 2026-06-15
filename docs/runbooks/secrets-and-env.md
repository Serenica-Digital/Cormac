# Runbook: secrets and environment

> **Status:** canonical · **Last reviewed:** 2026-06-14

How to generate, inject, and rotate the platform's secrets and environment, local
and on Juno (ADR-037, ADR-038, ADR-039). The variable contract lives in the manifest
([packages/config/src/manifest.ts](../../packages/config/src/manifest.ts)), which
generates `.env.example` and the charts' `env`/`secretEnv`; `pnpm check:env`
fails the build if they drift. Secret *values* live in Infisical, the single
authority. The deployable env inventory is in
[../prd/deployment-setup.md](../prd/deployment-setup.md).

## Principles

- Secret values live in one authority, Infisical (ADR-037). Nothing else keeps a
  copy. Host tooling injects them with `infisical run`; the cluster synthesizes the
  one k8s Secret `cormac-secrets` from Infisical via the External Secrets Operator,
  which we own and install ourselves since Juno ships no secret operator (ADR-039)
  ([../../deploy/eso/](../../deploy/eso/)). Every read is logged.
- **There is no local `.env`.** A developer runs `infisical login` once; after that
  the env-needing commands pull from Infisical. `.infisical.json` (a committed
  project pointer, not a secret) binds the repo to the project.
- Secrets are never committed and never baked into an image or a chart default.
- The Supabase service-role key is held only by the api (and bootstrap scripts),
  never the browser or the runtime (ADR-003/005).
- In `dev`/`prod` (`APP_ENV`), a missing or unsafe secret fails the boot, loudly
  (`enforceProdRules`); it does not start degraded.

## Local

Local dev, k3d, and Juno all run against the **managed dev Supabase** (ADR-038). One-time, per machine:

1. `infisical login` (browser; pick **Infisical Cloud (US Region)**).
2. Install ESO and apply [../../deploy/eso/](../../deploy/eso/) (`secretstore.yaml` + `externalsecret.yaml`) so the local stack reads `cormac-secrets` from Infisical. The same steps run on Juno, where ESO is a cluster-level concern we install ourselves (ADR-039); see the ESO README.

After that, `pnpm dev` brings the backend up in k3d against managed Supabase, and the
env-needing host commands inject from Infisical automatically because they wrap
`infisical run`: `pnpm seed`, `pnpm smoke`, `pnpm evals*`, and the frontends
(`pnpm --filter @cormac/web dev`, `pnpm --filter @cormac/pane dev`). Vite reads the
`VITE_*` from the injected process env, so the frontends need no `.env`. The `check:*`
scripts that read the environment (`check:rls`, `check:migrations`) take an explicit
prefix locally: `infisical run -- pnpm check:rls`.

The `dev` environment holds the managed Supabase keys, the runtime/MCP tokens, the
Anthropic key, and the non-secret config (`SUPABASE_URL`, the `VITE_*`). The local
Supabase stack (`pnpm db:start`) is for CI and offline tests only; its throwaway keys
(`APP_ENV=local`, HS256) never enter Infisical.

## Juno (Kubernetes)

Charts read every secret via `secretKeyRef` from one Secret, `cormac-secrets`. The
path is the External Secrets Operator synthesizing it from Infisical, so no
secret value ever lives in a cluster spec ([../../deploy/eso/](../../deploy/eso/)).
ESO is fully Cormac-owned because Juno ships no secret operator (ADR-039): install
ESO ourselves as a cluster-level concern, create the one bootstrap auth secret
(`infisical-auth`, a machine identity's client id/secret), then apply
`secretstore.yaml` + `externalsecret.yaml`. The hand-made `kubectl` path below is the
bootstrap fallback; either way the Secret must exist **before** the workloads deploy
(a documented juno_k3s race deploys workloads before a later-created secret exists).

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
# JWKS, and the api refuses the public dev secret (ADR-020/037).

# 2. GHCR image pull secret (a default gh token lacks read:packages; mint a PAT).
kubectl create secret docker-registry ghcr-pull -n cormac \
  --docker-server=ghcr.io --docker-username=<gh-user> \
  --docker-password=<PAT with read:packages>
```

Template and the External Secrets Operator path:
[../../plugins/secrets.example.yaml](../../plugins/secrets.example.yaml).
Our ESO `SecretStore` syncs `cormac-secrets` from Infisical; the same chart wiring
works against any ESO backend.

### The pane's custom domain and TLS

The Excel add-in manifest pins the pane's URL near-permanently, so the pane needs a
stable custom domain with TLS. We own the whole TLS stack since Juno ships no
cert-manager and no issuer (ADR-039): install the `cert-manager` Terra plugin and
create our own `ClusterIssuer` (Let's Encrypt, Route53 DNS-01 on AWS), set
`ingress_host`, `ingress.tls.enabled`, and `cluster_issuer` in
[../../plugins/cormac-pane/values.yaml](../../plugins/cormac-pane/values.yaml), and point the
domain's DNS at the shared ingress-nginx (optionally via ExternalDNS). If a
per-workload custom host cannot be served, front the pane with a CDN (Cloudflare).

## Rotation

Rotate a value once in Infisical; host tooling picks it up on the next `infisical
run`, and ESO refreshes the cluster Secret (1h interval, or force with `kubectl
annotate externalsecret cormac-secrets force-sync=$(date +%s) --overwrite`). Then
restart the consuming workload so it re-reads the env. Specifics:

- **Supabase keys**: rotate in the Supabase project, set the new value in Infisical,
  restart the api. Verification is JWKS-based, so no JWT secret rotation in prod.
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
confirmations for Juno (DNS delegation for our ClusterIssuer, who can read the
ESO-synced secret, CronJob RBAC, hostname stability, cluster egress, Hermes build)
are in [../../plugins/README.md](../../plugins/README.md), ADR-038, and ADR-039.
