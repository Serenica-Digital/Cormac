# Runbook: secrets and environment

> **Status:** canonical · **Last reviewed:** 2026-06-13

How to generate, inject, and rotate the platform's secrets and environment, local
and on Juno (ADR-034, ADR-035). The variable contract lives in the manifest
([packages/config/src/manifest.ts](../../packages/config/src/manifest.ts)), which
generates `.env.example` and the Helm charts' `env`/`secretEnv`; `pnpm check:env`
fails the build if they drift. Secret *values* live in Infisical, the single
authority. The deployable env inventory is in
[../prd/deployment-setup.md](../prd/deployment-setup.md).

## Principles

- Secret values live in one authority, Infisical (ADR-035). Nothing else keeps a
  copy. Host tooling injects them with `infisical run`; the cluster synthesizes the
  one k8s Secret `cormac-secrets` from Infisical via the External Secrets Operator
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

One-time, per machine:

1. `infisical login` (browser; pick **Infisical Cloud (US Region)**).
2. `pnpm db:start` brings up the local Supabase stack. Its keys are already in
   Infisical's `dev` environment; if you rebuild the stack and they change, push the
   new values: `infisical secrets set SUPABASE_SERVICE_ROLE_KEY=... --env=dev`.

After that, the env-needing commands inject from Infisical automatically because they
wrap `infisical run`: `pnpm seed`, `pnpm smoke`, `pnpm evals*`, and the frontends
(`pnpm --filter @cormac/web dev`, `pnpm --filter @cormac/pane dev`). Vite reads the
`VITE_*` from the injected process env, so the frontends need no `.env` either. The
`check:*` scripts that read the environment (`check:rls`, `check:migrations`) take an
explicit prefix locally: `infisical run -- pnpm check:rls`.

The `dev` environment holds the local Supabase keys, the runtime/MCP tokens, the
Anthropic key, the non-secret config (`SUPABASE_URL`, the `VITE_*`), and the
namespaced `REMOTE_*`/`SUPABASE_DB_*` for the managed-Supabase bootstrap.

## Juno (Kubernetes)

Charts read every secret via `secretKeyRef` from one Secret, `cormac-secrets`. The
intended path is the External Secrets Operator synthesizing it from Infisical, so no
secret value ever lives in a cluster spec ([../../deploy/eso/](../../deploy/eso/),
proven on local k3d, ADR-035): install ESO, create the one bootstrap auth secret
(`infisical-auth`, a machine identity's client id/secret), then apply
`secretstore.yaml` + `externalsecret.yaml`. The hand-made `kubectl` path below is the
bootstrap fallback; either way it must exist **before** `helm install` (a documented
juno_k3s race deploys workloads before a later-created secret exists).

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
confirmations for Juno (ClusterIssuer, secret backend, CronJob RBAC, hostname
stability, Hermes build) are in
[../../deploy/helm/README.md](../../deploy/helm/README.md) and ADR-034.
