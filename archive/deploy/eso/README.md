# Secrets via Infisical + the External Secrets Operator

> **Status:** drafted · **Last reviewed:** 2026-06-13

Infisical is Cormac's single secret authority (ADR-037). One authority holds every
secret value once; host tooling, CI, and the cluster reference it and keep no copy.
This directory wires the cluster half via the External Secrets Operator (ESO),
which synthesizes the one `cormac-secrets` k8s Secret the charts already consume by
`secretKeyRef`. No deployment template changes; only the Secret's provenance does.

## What the operator provisions (one time)

1. **Infisical project + environments.** Create the project; create `local`, `dev`,
   `prod` environments. The local k3d stack uses the **`dev`** environment (it talks
   to the managed dev Supabase project, `APP_ENV=dev`).
2. **Secret values in the `dev` environment**, named exactly:
   - `SUPABASE_SERVICE_ROLE_KEY` — the managed dev project's service-role key.
   - `RUNTIME_API_KEY` — `openssl rand -hex 24` (also serves as the runtime's `API_SERVER_KEY`).
   - `MCP_WORKSPACE_TOKEN` — `openssl rand -hex 24`.
   - `ANTHROPIC_API_KEY` — from console.anthropic.com.
3. **A machine identity** (Universal Auth) with read on the `dev` environment. Note its
   client id and secret.
4. **`.infisical.json`** at the repo root binds `infisical run` to the project; replace
   the placeholder `workspaceId` with the real project id (`infisical init` also writes it).

## Cluster wiring

```sh
# 1. Bootstrap auth secret (out of band; never committed). See infisical-auth.example.yaml.
kubectl -n cormac create secret generic infisical-auth \
  --from-literal=clientId=<client-id> --from-literal=clientSecret=<client-secret>

# 2. Install ESO.
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets -n external-secrets --create-namespace

# 3. Fill the PLACEHOLDER projectSlug/hostAPI in secretstore.yaml, then apply.
kubectl apply -f deploy/eso/secretstore.yaml
kubectl apply -f deploy/eso/externalsecret.yaml

# 4. ESO synthesizes cormac-secrets. Confirm, then bring the stack up.
kubectl -n cormac get externalsecret cormac-secrets   # STATUS: SecretSynced
kubectl -n cormac get secret cormac-secrets
pnpm k3d:up
```

## Host tooling and CI

- **Host:** `pnpm seed` and `pnpm smoke` (they self-wrap `infisical run`) inject the
  secrets at run time, so no real `.env` of values sits on disk.
- **CI:** CI is Infisical-free. Its hermetic test database uses local Supabase
  (`supabase start`), so CI needs no secret values from Infisical (ADR-038).

## Rotation and audit

Rotate a value once in Infisical; local (`infisical run`), CI, and the cluster (ESO
refresh, 1h) pick it up. Every read is logged in Infisical, which is the evidence the
security packet's secrets section and control-register rows 12/29 point at.
