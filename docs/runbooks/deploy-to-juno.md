# Runbook: deploy Cormac to Juno

> **Status:** draft (onboarding prep) · **Last reviewed:** 2026-06-14

Deploy the Cormac application stack to a Juno project. This is the deployment half
of the ADR-017 runtime de-risk spike (#15), and it doubles as the onboarding-session
script. The five charts now live under [../../plugins/](../../plugins/), each one a
Terra plugin (it carries `terra.yaml`) and a plain Helm chart at once (ADR-039).

There is **one deploy path**: Terra creates an ArgoCD Application per plugin and
ArgoCD syncs the chart. Direct `helm install` of a `plugins/<workload>/` chart
stays available because the plugins are plain Helm, which is the ADR-017
portability property and a debugging or first-touch convenience. It is not a
second pipeline kept in sync. The bundle lives at [../../bundles/cormac.yaml](../../bundles/cormac.yaml).

## What deploys

Five workloads, one namespace (`cormac`). `cormac-pane` is gated on the ADR-028
GO/NO-GO; omit it until a GO. Managed Supabase is the external system of record
(never a workload). The full local↔Juno mapping is in
[../prd/juno-platform-pilot.md](../prd/juno-platform-pilot.md).

Three stacks we own and install ourselves, because Juno ships none of them
(ADR-039): the External Secrets Operator (secrets), cert-manager plus our own
ClusterIssuer (TLS), and the cluster's outbound internet egress (a
cluster-creation gate). Each is covered below.

## Hard prerequisite: cluster egress

Cormac needs outbound internet for three dependencies: ESO reaching Infisical
SaaS, GHCR private image pulls, and managed Supabase over the network. The EKS
template defaults to `nat gateway: Disable` (no egress), so the pilot cluster must
be created with a NAT gateway (Single for dev, HighlyAvailable for prod) or VPC
endpoints sufficient for those three (ADR-039). Confirm this before onboarding and
run an egress reachability check in the smoke.

## Cluster-facts to fill

Confirm these at the session, then substitute them below. They are facts about the
pilot cluster, not placeholders in our code:

| Fact | Used as | Onboarding question |
| --- | --- | --- |
| Image tag (commit sha) | `image_tag` | Which CI build to deploy |
| Per-workload hosts | `api_host` / `web_host` / `pane_host` | DNS delegation for hosts we own |
| ClusterIssuer name | `cluster_issuer` | The name of the Issuer we create (ADR-039) |
| GHCR pull secret | `image_pull_secret` | Create it BEFORE deploy (juno_k3s race) |

## Prerequisites

1. **CI images in GHCR.** `ghcr.io/serenica-digital/{api,web,worker,hermes-runtime}`
   (and `pane` on a GO) built for `linux/amd64` (Juno's AWS nodes). CI's
   `publish-images` job builds these on push to `main`/`dev`.
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
4. **cert-manager + our ClusterIssuer.** Juno ships neither cert-manager nor an
   issuer (ADR-039), so we own the whole TLS stack: install the `cert-manager`
   Terra plugin (cluster-level), then create our own `ClusterIssuer` (Let's
   Encrypt, Route53 DNS-01 on the AWS pilot), optionally with ExternalDNS managing
   the Route53 records. See Step 0.

## Step 0: cluster-level operators (ESO, cert-manager) we own

Juno provides no secret operator and no cert-manager (ADR-039), so we install both
as cluster-level concerns before the app plugins. Each is a Terra cluster-level
plugin or our own ArgoCD Application:

```sh
# External Secrets Operator:
helm repo add external-secrets https://charts.external-secrets.io && helm repo update
helm install external-secrets external-secrets/external-secrets \
  -n external-secrets --create-namespace --wait
# cert-manager: install the Terra cert-manager plugin (cluster-level), then create
# our own ClusterIssuer (Let's Encrypt, Route53 DNS-01 on AWS). Juno bundles no Issuer.
```

## Step 1: secrets into `cormac-secrets` (ESO, ours)

The charts consume one Secret, `cormac-secrets`, via `secretKeyRef`. ESO syncs it
from Infisical (ADR-037). This mechanism is fully Cormac-owned: Juno ships no
secret operator (ADR-039), so there is no platform SecretStore to inherit.

```sh
# Point ESO at Infisical's dev environment (ESO installed in Step 0):
kubectl -n cormac apply -f ../../deploy/eso/infisical-auth.example.yaml   # fill real values first
kubectl -n cormac apply -f ../../deploy/eso/secretstore.yaml
kubectl -n cormac apply -f ../../deploy/eso/externalsecret.yaml
kubectl -n cormac get externalsecret cormac-secrets   # want: SecretSynced
```

See [../../deploy/eso/README.md](../../deploy/eso/README.md).
`API_SERVER_KEY` must equal `RUNTIME_API_KEY`; the ESO `ExternalSecret` maps both
from one Infisical reference.

The hand-made `kubectl create secret generic cormac-secrets` path
([secrets-and-env.md](secrets-and-env.md)) stays available as a bootstrap
fallback for the same reason the charts are plain Helm: it produces the same
Secret without the operator.

## Step 2: deploy via Terra / ArgoCD (the deploy path)

1. In Genesis, add this repo as a private **Terra Source**. Terra discovers the
   plugins under `plugins/*/terra.yaml` at the repo root (ADR-039).
2. Launch the **`cormac` bundle** ([../../bundles/cormac.yaml](../../bundles/cormac.yaml);
   omit `cormac-pane` pre-GO). Terra creates one ArgoCD Application per plugin
   pointing at `plugins/<name>/`, and ArgoCD syncs each chart.
3. Fill the bundle fields: `image_tag=<sha>`, `image_pull_secret=ghcr-pull`,
   `cluster_issuer=<our-issuer>`, `api_host=<api-host>`, `web_host=<web-host>`
   (and `pane_host` on a GO).
4. Watch the ArgoCD Applications reach Synced/Healthy.

### Portability escape hatch: direct `helm install`

The plugins are plain Helm charts, so a direct install of `plugins/<workload>/`
produces the same result without Terra. Use it for debugging, a first-touch
bootstrap, or to demonstrate Juno swappability (ADR-017); it is not a maintained
second pipeline (ADR-039). Run per workload (drop `cormac-pane` pre-GO):

```sh
# Run from the repo root.
TAG=<commit-sha>; DOMAIN=<your-domain>; ISSUER=<cluster-issuer>
helm upgrade --install cormac-api plugins/api -n cormac \
  -f plugins/values.example.yaml \
  --set image.tag=$TAG --set ingress.host=api.$DOMAIN \
  --set ingress.tls.clusterIssuer=$ISSUER
helm upgrade --install cormac-web plugins/web -n cormac \
  -f plugins/values.example.yaml \
  --set image.tag=$TAG --set ingress.host=app.$DOMAIN \
  --set ingress.tls.clusterIssuer=$ISSUER
helm upgrade --install cormac-worker plugins/worker -n cormac \
  -f plugins/values.example.yaml --set image.tag=$TAG
helm upgrade --install cormac-hermes-runtime plugins/hermes-runtime -n cormac \
  -f plugins/values.example.yaml --set image.tag=$TAG
# pane (on ADR-028 GO; host is manifest-pinned, keep it stable):
# helm upgrade --install cormac-pane plugins/pane -n cormac \
#   -f plugins/values.example.yaml --set image.tag=$TAG \
#   --set ingress.host=pane.$DOMAIN --set ingress.tls.clusterIssuer=$ISSUER
```

Also set the managed-Supabase env on the api (non-secret) via `--set env.SUPABASE_URL=...`,
`--set env.SUPABASE_ANON_KEY=...`, `--set env.CORS_ORIGINS=...`, `--set env.MCP_WORKSPACE_ID=...`,
or via a values overlay. The api boots under `APP_ENV=prod` (or `dev`): JWKS-only,
fail-closed (ADR-037); it refuses to start if a required secret is missing.

## Networking note

The pilot fronts everything with one shared ingress-nginx behind one AWS NLB with
`proxy_protocol_v2` on, TLS terminating in-cluster (ADR-039). There are no
per-chart load balancers. `ingress-noauth` (the api public webhook door) versus
`ingress-auth` (web) are ingress-nginx annotations on the shared controller, not
separate LBs. The api webhook ingress deliberately drops the Genesis `auth-url`
annotation (the platform default is authenticated ingress); webhooks verify
themselves in-app.

## Step 3: acceptance gate (the walking skeleton, not green checkmarks)

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

## Local rehearsal before onboarding

The faithful pre-onboarding rehearsal runs on a Juno-shaped `kind` stack, not
plain k3d (ADR-039). `Juno-Bootstrap` `make bootstrap` gives kind + ArgoCD +
ingress-nginx + Genesis; `Terra-Official-Plugins` `make test` exercises the true
plugin → ArgoCD Application → sync path. Add cert-manager as a deliberate step
since neither bootstrap installs it. Plain k3d is demoted to a fast
chart-correctness loop and is being retired; it never exercised the ArgoCD sync,
the ingress-nginx/proxy-protocol topology, or the pull-secret ordering, so it is
not byte-identical to Juno.

## Known deployment gotchas

- **Hermes MCP startup race.** Hermes opens its one MCP connection at boot; the
  `wait-for-api` init container blocks until the api is reachable. If the api
  restarts while Hermes runs, Hermes does not reconnect; restart Hermes after the
  api stabilizes. (Durable per-run reconnect is a pilot follow-up, not yet filed.)
- **GHCR pull secret must exist before deploy** (juno_k3s race), step 2.
- **Recycle CronJob RBAC.** The hermes-runtime chart's recycler needs a
  Role/RoleBinding to `rollout restart` in the namespace; confirm it is allowed.

## Day-end

Juno asks pilot workloads be shut down at end of day to control their AWS cost.
With the Terra/ArgoCD path, scale or delete the Applications; with the direct-helm
escape hatch:
```sh
helm -n cormac uninstall cormac-api cormac-web cormac-worker cormac-hermes-runtime
# (the namespace, secrets, and ESO store persist for the next day)
```
