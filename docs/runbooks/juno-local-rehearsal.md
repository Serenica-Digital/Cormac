# Juno-shaped local rehearsal

> **Status:** canonical · **Last reviewed:** 2026-06-18

The faithful pre-onboarding rehearsal for the Juno deploy (ADR-039). It stands up a
Juno-shaped Kubernetes stack on a laptop and runs the real GitOps path the platform
uses, so onboarding is "deploy this, fix what breaks" rather than "discover how it
works live." This is materially closer to production than the old plain-k3d loop,
which never exercised ArgoCD, ingress-nginx, or the Terra control plane. Companion
to [deploy-to-juno.md](deploy-to-juno.md) (the real-cluster deploy).

Everything below was run and verified on an Apple Silicon Mac (M3 Pro, Docker
Desktop 11.67 GiB allocation) on 2026-06-15. The Juno control-plane images are
multi-arch with native arm64 builds, so the platform runs without emulation. The
Helios workstation images are amd64-only (no arm64 build), so the dev workstation
is the one piece left for the real cluster, not rehearsed locally.

## Scripted (recommended)

`pnpm rehearsal:up` runs the credential-free base stack and chart deploy below, plus two professional touches. First, browser-trusted TLS: it feeds the mkcert root CA into a cert-manager **CA** ClusterIssuer named `mkcert-ca`, so cert-manager still mints the leaf certs (faithful to the real Let's Encrypt path) and the browser trusts them with no warning. Second, `*.localtest.me` hostnames, which are public DNS that resolves to 127.0.0.1, so there is no `/etc/hosts` edit. It stops at the credential and dashboard click-through boundary and prints the manual steps. `pnpm rehearsal:down` deletes the cluster.

Flags: `WITH_GENESIS=1` (the full Genesis + Terra platform), `SKIP_BUILD=1`, `DOMAIN=...` (for example `127.0.0.1.sslip.io` if localtest.me ever fails to resolve).

The manual commands below remain the source of truth the script mirrors; use them to step through it or diverge. The credentialed Part 3 stays manual either way.

## What this maps to

```
your Mac
└─ Docker Desktop (Linux VM)            container engine
   └─ kind node (one container)         a Kubernetes "machine"
      └─ Kubernetes + containerd        the orchestrator + runtime
         ├─ ArgoCD                      GitOps: git -> cluster
         ├─ ingress-nginx, cert-manager the ingress + TLS we own
         ├─ Genesis / Terra / Titan     Juno's platform layer (optional)
         └─ Cormac plugins              our workloads
```

On the real cluster it is the identical shape, AWS EC2 machines instead of the
Docker VM. Kubernetes is the orchestrator; Genesis/Terra is Juno's platform layer
on top; our workloads stay plain Kubernetes, which is why Juno is swappable (ADR-017).

## Prerequisites

`docker` (running), `kind`, `kubectl`, `helm`, `mkcert`. No credentials are needed for the
base stack or for the Genesis platform. Credentials are needed only to deploy
Cormac itself (private repo, private GHCR images, Infisical), see the last section.

## Part 1: the base stack (no credentials)

```sh
git clone https://github.com/juno-fx/Juno-Bootstrap /tmp/Juno-Bootstrap
cd /tmp/Juno-Bootstrap

# 1. kind cluster shaped like Juno (host ports 80/443, Juno node labels)
kind create cluster --name genesis --config .kind.yaml

# 2. ArgoCD (the GitOps engine Terra drives)
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
# the applicationsets CRD exceeds kubectl's annotation limit; apply it server-side:
kubectl apply --server-side -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl wait -n argocd --for=condition=ready pod --selector=app.kubernetes.io/name=argocd-server --timeout=180s

# 3. ingress-nginx (kind provider; the one shared controller, as on Juno)
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
kubectl wait -n ingress-nginx --for=condition=ready pod --selector=app.kubernetes.io/component=controller --timeout=180s

# 4. cert-manager + a ClusterIssuer (Juno ships NEITHER; the TLS stack is ours, ADR-039)
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.16.2/cert-manager.yaml
kubectl wait -n cert-manager --for=condition=ready pod --selector=app.kubernetes.io/instance=cert-manager --timeout=180s
# selfsigned for local; on the real cluster this is a Let's Encrypt ClusterIssuer (Route53 DNS-01)
kubectl apply -f - <<'EOF'
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata: { name: selfsigned }
spec: { selfSigned: {} }
EOF
```

## Part 2: the Genesis + Terra platform (optional, no credentials)

The base stack already exercises the GitOps path. Add Genesis only when you want
the real Terra controller and the Genesis dashboard (to see Sources, the catalog,
and to settle how Terra injects fields). It is light: control-plane deployments
store state in Kubernetes CRDs, no bundled database. Footprint observed: about
2.6 GiB / 3.2 CPU requested, well under the Docker allocation.

```sh
cd /tmp/Juno-Bootstrap
# Genesis as an ArgoCD Application. test.values.yaml uses basic auth for local dev
# and disables the chart's own ingress-nginx (we installed it in Part 1). The
# chart ref v2.0.2 resolves to genesis image v3.0.2 (arm64), which exists.
helm upgrade -n argocd -i -f test.values.yaml genesis ./chart/
kubectl get deployments -n argocd -o name | xargs -n1 kubectl rollout restart -n argocd
# watch the genesis Application reach Synced/Healthy:
kubectl get applications -n argocd -w
```

Dashboard: `https://localhost/` (accept the self-signed cert), log in with the
local basic-auth account `test@email.com` / `juno`. You get the real Genesis/Orion
UI: Sources, the Terra catalog, workstations.

## Part 3: deploy Cormac

Two paths, matching ADR-039.

**Direct helm (proven, no credentials beyond image access).** Proves our charts run
on a Juno-shaped cluster. Verified 2026-06-15: all five charts install on k8s 1.36;
the three ingress charts (api/web/pane) pass the ingress-nginx admission webhook;
cert-manager auto-issues TLS for each host from the chart's Ingress. Pods sit
`ImagePullBackOff` until a GHCR pull secret exists (the juno_k3s race) and, on this
arm64 cluster, because the CI images are amd64-only. The charts use FLAT operator
keys (`image_tag`, `image_pull_secret`, `ingress_host`, `cluster_issuer`) to match
how Terra injects fields (see Terra-native below).

```sh
kubectl create namespace cormac
for c in api web pane; do
  helm upgrade --install "cormac-$c" "plugins/cormac-$c" -n cormac \
    --set image_tag=<sha> --set ingress_host=$c.<domain> --set cluster_issuer=selfsigned
done
helm upgrade --install cormac-worker         plugins/cormac-worker         -n cormac --set image_tag=<sha>
helm upgrade --install cormac-hermes-runtime plugins/cormac-hermes-runtime -n cormac --set image_tag=<sha>
```

**Terra-native through Genesis (needs credentials + the dashboard).** The full
platform path. Requires:

1. A GitHub PAT so ArgoCD/Terra can read the private Cormac repo, created out of band
   as an ArgoCD repo credential:
   ```sh
   kubectl create secret generic cormac-repo -n argocd \
     --from-literal=type=git --from-literal=url=https://github.com/Serenica-Digital/Cormac \
     --from-literal=username=git --from-literal=password=<PAT>
   kubectl label secret cormac-repo -n argocd argocd.argoproj.io/secret-type=repository
   ```
2. A GHCR pull secret in the `cormac` namespace so pods pull our private images:
   ```sh
   kubectl create secret docker-registry ghcr-pull -n cormac \
     --docker-server=ghcr.io --docker-username=<gh-user> --docker-password=<PAT>
   ```
3. ESO + Infisical for `cormac-secrets` (Juno provides no secret operator; it is ours):
   ```sh
   helm repo add external-secrets https://charts.external-secrets.io
   helm install external-secrets external-secrets/external-secrets -n external-secrets --create-namespace
   kubectl -n cormac create secret generic infisical-auth \
     --from-literal=clientId=<id> --from-literal=clientSecret=<secret>
   kubectl apply -f deploy/eso/secretstore.yaml -f deploy/eso/externalsecret.yaml
   kubectl -n cormac get externalsecret cormac-secrets   # SecretSynced
   ```
4. In the Genesis dashboard: add the Cormac repo as a Source (Terra discovers
   `plugins/*` and `bundles/cormac.yaml`), then launch the `cormac` bundle and fill
   the fields. This step is the one manual click-through; it has no documented CLI.

A workload booting fully `Running` also needs the managed-Supabase env and the
Anthropic key (the api is fail-closed), so the last mile is the capture-to-audit
smoke, genuinely an onboarding step against managed Supabase.

## What this rehearsal proves, and what it does not

Proven locally (2026-06-15):

- The platform is arm64-native and light; it runs on the laptop with no credentials.
- ArgoCD GitOps works on the stack (a public app syncs Healthy).
- All five Cormac charts apply on real k8s 1.36 and pass ingress-nginx admission.
- The TLS stack we own works end to end: cert-manager + ClusterIssuer issues certs from the charts' Ingress specs.
- Terra injects each terra.yaml field as a FLAT top-level value (via `spec.source.helm.values`), and it derives the plugin install path from `resource_id`. Both confirmed by registering the repo as a real Source on the live Terra (v2.1.1); the charts were flattened and the plugin dirs renamed to `plugins/cormac-<workload>/` to match (ADR-039).
- The pull-secret-before-workload requirement (the juno_k3s race) is real and demonstrated.

Still to settle (needs credentials or the real cluster):

- ArgoCD/Terra syncing our private repo and the bundle launch through the Genesis UI.
- ESO -> Infisical -> `cormac-secrets` against the real machine identity.
- The exact Terra field-injection form (`helm.parameters` vs a literal-key `valuesObject`): testable locally with the running Terra by registering a Source, otherwise an onboarding confirmation.
- Real Let's Encrypt TLS (needs public DNS), real GHCR pull, and the full capture-to-audit smoke against managed Supabase.

## Teardown

```sh
kind delete cluster --name genesis
```
