# Runbook: deploy Cormac to Juno

> **Status:** draft (onboarding prep) · **Last reviewed:** 2026-06-13

Deploy the Cormac application stack to a Juno project. This is the deployment half
of the ADR-017 runtime de-risk spike (#15), and it doubles as the onboarding-session
script. The same Helm charts in [../../deploy/helm/](../../deploy/helm/) already ran
the walking skeleton end to end on local k3d (ADR-038), so this runbook is mostly
"point the proven charts at the pilot cluster and fill in the cluster-facts."

It carries **two tracks**. Track A is Terra-native (the Juno launch UI). Track B is
plain `helm install` and depends on nothing Juno-specific. **Track B is guaranteed
to work on any Kubernetes**, so a deploy is never blocked on resolving Terra's plugin
contract live; use it if Track A fights the structural unknowns (see
[../../deploy/terra/README.md](../../deploy/terra/README.md)).

## What deploys

Five workloads, one namespace (`cormac`). `cormac-pane` is gated on the ADR-028
GO/NO-GO; omit it until a GO. Managed Supabase is the external system of record
(never a workload). The full local↔Juno mapping is in
[../prd/juno-platform-pilot.md](../prd/juno-platform-pilot.md).

## Cluster-facts to fill (the only real unknowns)

Confirm these at the session, then substitute them below. They are facts about the
pilot cluster, not placeholders in our code:

| Fact | Used as | Onboarding question |
| --- | --- | --- |
| Image tag (commit sha) | `image.tag` | Which CI build to deploy |
| Base domain | `ingress.host` (api/web/pane) | DNS delegation for hosts we own |
| ClusterIssuer name | `ingress.tls.clusterIssuer` | Does a `cert-manager` ClusterIssuer exist (else CDN for the pane) |
| Secret backend | the `cormac-secrets` Secret | ESO `SecretStore` provisioned, or plain Secret |
| GHCR pull secret | `imagePullSecret` | Create it BEFORE deploy (juno_k3s race) |

## Prerequisites

1. **CI images in GHCR.** `ghcr.io/serenica-digital/{api,web,worker,hermes-runtime}`
   (and `pane` on a GO) built for `linux/amd64` (Juno's AWS nodes; local k3d uses
   arm64, ADR-038). CI's `publish-images` job builds these on push to `main`/`dev`.
2. **Namespace + GHCR pull secret (BEFORE any workload, juno_k3s race):**
   ```sh
   kubectl create namespace cormac
   kubectl -n cormac create secret docker-registry ghcr-pull \
     --docker-server=ghcr.io --docker-username=<gh-user> \
     --docker-password=<gh-PAT-with-read:packages>
   ```
3. **Managed Supabase ready.** The managed dev project exists, is awake, and is
   seeded (`pnpm seed`, ADR-038). Its URL + anon key (non-secret) and the secret
   values live in Infisical's `dev` environment (ADR-037).
4. **cert-manager.** Install the `cert-manager` Terra plugin (default v1.19.1) and
   confirm a `ClusterIssuer` exists, or plan the CDN fallback for the pane.

## Step 1 — secrets into `cormac-secrets`

The charts consume one Secret, `cormac-secrets`, via `secretKeyRef`. Two ways,
both producing the same Secret:

**Preferred — ESO from Infisical** (the local proof path, ADR-037):
```sh
# Install ESO, then point it at Infisical's dev environment:
helm repo add external-secrets https://charts.external-secrets.io && helm repo update
helm install external-secrets external-secrets/external-secrets \
  -n external-secrets --create-namespace --wait
# Bootstrap auth (machine identity), then the store + sync:
kubectl -n cormac apply -f deploy/eso/infisical-auth.example.yaml   # fill real values first
kubectl -n cormac apply -f deploy/eso/secretstore.yaml
kubectl -n cormac apply -f deploy/eso/externalsecret.yaml
kubectl -n cormac get externalsecret cormac-secrets   # want: SecretSynced
```
See [../../deploy/eso/README.md](../../deploy/eso/README.md). On the pilot cluster,
confirm the ESO `SecretStore` is allowed and who can read secrets back.

**Fallback — plain Secret** (if ESO is not provisioned):
```sh
# From Infisical, without printing values to the terminal history:
infisical export --format=dotenv > /tmp/cormac.env   # then craft the Secret from it
kubectl -n cormac create secret generic cormac-secrets --from-env-file=/tmp/cormac.env
rm -f /tmp/cormac.env
```
`API_SERVER_KEY` must equal `RUNTIME_API_KEY` (the ESO `ExternalSecret` maps both
from one Infisical reference; for the plain Secret, set them to the same value).

## Step 2A — deploy via Terra (the Juno-native track)

1. In Genesis, add this repo as a private **Terra Source**.
2. Launch the **`cormac` bundle** (omit `cormac-pane` pre-GO).
3. Fill the bundle fields: `namespace=cormac`, `image_tag=<sha>`,
   `image_pull_secret=ghcr-pull`, `base_domain=<your-domain>`,
   `cluster_issuer=<issuer>`.
4. If Terra does not discover the plugins (the path unknown,
   [../../deploy/terra/README.md](../../deploy/terra/README.md)) or the field→values
   mapping is unclear, switch to Step 2B. Do not fight it live.

## Step 2B — deploy via `helm install` (the guaranteed track)

Identical result, no Terra. Run per workload (drop `cormac-pane` pre-GO):
```sh
TAG=<commit-sha>; DOMAIN=<your-domain>; ISSUER=<cluster-issuer>
helm upgrade --install cormac-api deploy/helm/api -n cormac \
  -f deploy/helm/values.example.yaml \
  --set image.tag=$TAG --set ingress.host=api.$DOMAIN \
  --set ingress.tls.clusterIssuer=$ISSUER
helm upgrade --install cormac-web deploy/helm/web -n cormac \
  -f deploy/helm/values.example.yaml \
  --set image.tag=$TAG --set ingress.host=app.$DOMAIN \
  --set ingress.tls.clusterIssuer=$ISSUER
helm upgrade --install cormac-worker deploy/helm/worker -n cormac \
  -f deploy/helm/values.example.yaml --set image.tag=$TAG
helm upgrade --install cormac-hermes-runtime deploy/helm/hermes-runtime -n cormac \
  -f deploy/helm/values.example.yaml --set image.tag=$TAG
# pane (on ADR-028 GO; host is manifest-pinned, keep it stable):
# helm upgrade --install cormac-pane deploy/helm/pane -n cormac \
#   -f deploy/helm/values.example.yaml --set image.tag=$TAG \
#   --set ingress.host=pane.$DOMAIN --set ingress.tls.clusterIssuer=$ISSUER
```
Also set the managed-Supabase env on the api (non-secret) via `--set env.SUPABASE_URL=...`,
`--set env.SUPABASE_ANON_KEY=...`, `--set env.CORS_ORIGINS=...`, `--set env.MCP_WORKSPACE_ID=...`,
or via a values overlay. The api boots under `APP_ENV=prod` (or `dev`): JWKS-only,
fail-closed (ADR-037); it refuses to start if a required secret is missing.

## Step 3 — acceptance gate (the walking skeleton, not green checkmarks)

Per the project bar, the milestone is demonstrated, not asserted (ADR-038):
```sh
kubectl -n cormac get pods                 # all workloads 1/1 Running
kubectl -n cormac logs deploy/cormac-hermes-runtime -c wait-for-api --tail=3   # "api reachable"
# Point the smoke at the deployed api (port-forward, or the public api host):
kubectl -n cormac port-forward svc/cormac-api 8088:8088 &
infisical run -- pnpm smoke                 # want 11/11 on substance
```
The smoke drives capture → held proposal → approve → record flip → audit
before/after against the deployed stack with real Hermes (ADR-026). A clean run is
the deploy's definition of done. Then expose the web preview link and confirm the
api's public host is stable for future Twilio webhooks.

## Known deployment gotchas (found on k3d, ADR-038)

- **Hermes MCP startup race.** Hermes opens its one MCP connection at boot; the
  `wait-for-api` init container blocks until the api is reachable. If the api
  restarts while Hermes runs, Hermes does not reconnect — restart Hermes after the
  api stabilizes. (Durable per-run reconnect is a pilot follow-up, not yet filed.)
- **GHCR pull secret must exist before deploy** (juno_k3s race), step 2.
- **Recycle CronJob RBAC.** The hermes-runtime chart's recycler needs a
  Role/RoleBinding to `rollout restart` in the namespace; confirm it is allowed.

## Day-end

Juno asks pilot workloads be shut down at end of day to control their AWS cost:
```sh
helm -n cormac uninstall cormac-api cormac-web cormac-worker cormac-hermes-runtime
# (the namespace, secrets, and ESO store persist for the next day)
```
