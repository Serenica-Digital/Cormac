#!/usr/bin/env bash
# Professional Juno-shaped local rehearsal (ADR-039). Stands up the real GitOps
# stack the platform uses, on a kind cluster, with BROWSER-TRUSTED TLS and clean
# wildcard hostnames, then deploys the Cormac charts. Credential-free: it stops at
# the credential / dashboard click-through boundary and prints what to do by hand.
#
# Professional touches over the bare rehearsal:
#   - mkcert root CA fed into a cert-manager CA ClusterIssuer, so cert-manager
#     still mints the leaf certs (faithful to the real Let's Encrypt path) but the
#     browser trusts them (no warning).
#   - *.localtest.me hostnames (public DNS -> 127.0.0.1), so no /etc/hosts edits.
#
# This is the rehearsal only. It sits ALONGSIDE the k3d `pnpm dev` loop; it does
# not retire k3d or change daily dev. Companion: docs/runbooks/juno-local-rehearsal.md
# (the manual source of truth this mirrors) and deploy-to-juno.md (the real cluster).
set -euo pipefail

CLUSTER="${CLUSTER:-genesis}"
NS="${NS:-cormac}"
TAG="${TAG:-dev}"
# Wildcard-localhost domain: *.localtest.me resolves to 127.0.0.1 with no host-file
# edits. If localtest.me ever fails to resolve, set DOMAIN=127.0.0.1.sslip.io.
DOMAIN="${DOMAIN:-localtest.me}"
ISSUER="${ISSUER:-mkcert-ca}"

# Upstream refs (overridable to pin for reproducibility). Defaults match the proven
# runbook. cert-manager is version-pinned; ArgoCD/ingress-nginx track their stable
# channels as in the runbook.
ARGOCD_MANIFEST="${ARGOCD_MANIFEST:-https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml}"
INGRESS_NGINX_MANIFEST="${INGRESS_NGINX_MANIFEST:-https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml}"
CERT_MANAGER_VERSION="${CERT_MANAGER_VERSION:-v1.16.2}"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing tool: $1" >&2; exit 1; }; }
need docker; need kind; need kubectl; need helm; need mkcert

echo "==> [1/9] mkcert root CA (one-time trusted-CA install into your keychain)"
mkcert -install
CAROOT="$(mkcert -CAROOT)"
[ -f "$CAROOT/rootCA.pem" ] && [ -f "$CAROOT/rootCA-key.pem" ] || {
  echo "mkcert root CA not found in $CAROOT after -install" >&2; exit 1; }

echo "==> [2/9] kind cluster '$CLUSTER'"
if kind get clusters 2>/dev/null | grep -qx "$CLUSTER"; then
  echo "    cluster '$CLUSTER' already exists, reusing it"
else
  kind create cluster --name "$CLUSTER" --config scripts/kind/kind-config.yaml
fi

echo "==> [3/9] ArgoCD (the GitOps engine Terra drives)"
kubectl create namespace argocd --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -n argocd -f "$ARGOCD_MANIFEST" >/dev/null
# the applicationsets CRD exceeds kubectl's client-side annotation limit; server-side wins
kubectl apply --server-side -n argocd -f "$ARGOCD_MANIFEST" >/dev/null
kubectl wait -n argocd --for=condition=ready pod \
  --selector=app.kubernetes.io/name=argocd-server --timeout=180s

echo "==> [4/9] ingress-nginx (one shared controller, as on Juno)"
kubectl apply -f "$INGRESS_NGINX_MANIFEST" >/dev/null
kubectl wait -n ingress-nginx --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller --timeout=180s

echo "==> [5/9] cert-manager $CERT_MANAGER_VERSION"
kubectl apply -f "https://github.com/cert-manager/cert-manager/releases/download/${CERT_MANAGER_VERSION}/cert-manager.yaml" >/dev/null
kubectl wait -n cert-manager --for=condition=ready pod \
  --selector=app.kubernetes.io/instance=cert-manager --timeout=180s

echo "==> [6/9] mkcert -> cert-manager CA ClusterIssuer '$ISSUER' (browser-trusted leaf certs)"
# The CA issuer needs the mkcert root cert + key in the cert-manager namespace so
# cert-manager can sign leaf certs with it. This is your LOCAL CA private key in a
# throwaway local cluster; never do this with a shared or real CA.
kubectl create secret tls "$ISSUER" \
  --cert="$CAROOT/rootCA.pem" --key="$CAROOT/rootCA-key.pem" \
  -n cert-manager --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: ${ISSUER}
spec:
  ca:
    secretName: ${ISSUER}
EOF

echo "==> [7/9] backend images (arm64-native) -> kind"
if [ "${SKIP_BUILD:-}" != "1" ]; then
  docker build -f docker/Dockerfile.node   --build-arg SERVICE=api    -t cormac/api:"$TAG" .
  docker build -f docker/Dockerfile.node   --build-arg SERVICE=worker -t cormac/worker:"$TAG" .
  docker build -f docker/Dockerfile.hermes                            -t cormac/hermes-runtime:"$TAG" .
fi
kind load docker-image --name "$CLUSTER" \
  cormac/api:"$TAG" cormac/worker:"$TAG" cormac/hermes-runtime:"$TAG"

echo "==> [8/9] deploy the Cormac charts (issuer=$ISSUER, hosts=*.$DOMAIN)"
kubectl create namespace "$NS" --dry-run=client -o yaml | kubectl apply -f -
# api/web/pane carry an Ingress; one issuer drives all three, host is per-chart.
helm upgrade --install cormac-api  plugins/cormac-api  -n "$NS" \
  --set image_tag="$TAG" --set image_pull_secret="" \
  --set ingress_host="api.$DOMAIN" --set cluster_issuer="$ISSUER"
helm upgrade --install cormac-web  plugins/cormac-web  -n "$NS" \
  --set image_tag="$TAG" --set image_pull_secret="" \
  --set ingress_host="app.$DOMAIN" --set cluster_issuer="$ISSUER"
helm upgrade --install cormac-pane plugins/cormac-pane -n "$NS" \
  --set image_tag="$TAG" --set image_pull_secret="" \
  --set ingress_host="pane.$DOMAIN" --set cluster_issuer="$ISSUER"
# worker/hermes-runtime are clusterip (no Ingress).
helm upgrade --install cormac-worker         plugins/cormac-worker         -n "$NS" --set image_tag="$TAG"
helm upgrade --install cormac-hermes-runtime plugins/cormac-hermes-runtime -n "$NS" --set image_tag="$TAG"

echo "==> [9/9] waiting for the TLS certs to issue"
for c in api web pane; do
  kubectl -n "$NS" wait --for=condition=ready certificate "cormac-$c-tls" --timeout=120s || true
done

# Optional: the full Genesis + Terra platform (the dashboard, the Terra catalog).
# Needs the Juno-Bootstrap repo; the base stack above already exercises the GitOps path.
if [ "${WITH_GENESIS:-}" = "1" ]; then
  echo "==> [opt] Genesis + Terra platform"
  BOOT="${BOOT:-/tmp/Juno-Bootstrap}"
  [ -d "$BOOT" ] || git clone https://github.com/juno-fx/Juno-Bootstrap "$BOOT"
  helm upgrade -n argocd -i -f "$BOOT/test.values.yaml" genesis "$BOOT/chart/"
  kubectl get deployments -n argocd -o name | xargs -n1 kubectl rollout restart -n argocd
  echo "    Genesis dashboard: https://localhost/  (login test@email.com / juno)"
fi

cat <<EOF

==> Rehearsal stack is up.

  Trusted, no /etc/hosts, no cert warning:
    https://api.$DOMAIN/     https://app.$DOMAIN/     https://pane.$DOMAIN/
  Verify the chain:  curl -v https://api.$DOMAIN  (terminates at the mkcert root)

  What this proves: the platform path. ArgoCD/ingress admission, cert-manager
  issuing browser-trusted TLS from the mkcert CA, and the charts applying.

  What it does NOT do (and why): pods may not reach Running. Backend images are
  arm64-native here, but web/pane pull amd64 GHCR images that won't run on this
  arm64 cluster, and the api is fail-closed without the managed-Supabase env.
  Running pods + the capture-to-audit smoke are the real-cluster / onboarding step.

  Manual from here (needs your credentials; deliberately not scripted):
    1. ESO + Infisical -> cormac-secrets:
         kubectl -n $NS create secret generic infisical-auth \\
           --from-literal=clientId=<id> --from-literal=clientSecret=<secret>
         helm repo add external-secrets https://charts.external-secrets.io
         helm install external-secrets external-secrets/external-secrets \\
           -n external-secrets --create-namespace
         kubectl apply -f deploy/eso/secretstore.yaml -f deploy/eso/externalsecret.yaml
    2. Private images / repo (Terra-native path): GHCR pull secret + ArgoCD repo PAT
       (see docs/runbooks/deploy-to-juno.md), then register the repo as a Terra
       Source and launch the bundle in the Genesis dashboard (WITH_GENESIS=1).

  Tear down:  pnpm rehearsal:down
EOF
