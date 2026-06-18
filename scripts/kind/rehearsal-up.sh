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
# Genesis/Terra version for the optional WITH_GENESIS step. v4.1.0 (the chart ref)
# resolves to genesis v5.1.0 / terra v2.1.1 (arm64, the current stack); test.values.yaml
# ships a stale v2.0.2 pin we override here.
GENESIS_VERSION="${GENESIS_VERSION:-v4.1.0}"

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

echo "==> [1/8] mkcert root CA (one-time trusted-CA install into your keychain)"
# mkcert -install can exit non-zero when it can't write a SECONDARY trust store it
# auto-detects (e.g. a SIP-protected Android Studio / Java keystore) even though the
# system (and Firefox) stores succeeded. We don't use those stores, so tolerate the
# error and gate on the CA actually existing below.
mkcert -install || echo "    (mkcert -install hit a non-fatal trust-store error; the system store is what we need, continuing)"
CAROOT="$(mkcert -CAROOT)"
[ -f "$CAROOT/rootCA.pem" ] && [ -f "$CAROOT/rootCA-key.pem" ] || {
  echo "mkcert root CA not found in $CAROOT after -install" >&2; exit 1; }

echo "==> [2/8] kind cluster '$CLUSTER'"
if kind get clusters 2>/dev/null | grep -qx "$CLUSTER"; then
  echo "    cluster '$CLUSTER' already exists, reusing it"
else
  kind create cluster --name "$CLUSTER" --config scripts/kind/kind-config.yaml
fi

echo "==> [3/8] ArgoCD (the GitOps engine Terra drives)"
kubectl create namespace argocd --dry-run=client -o yaml | kubectl apply -f -
# The applicationsets CRD exceeds kubectl's client-side annotation limit, so the
# plain apply errors on that one object (expected); the server-side apply is the
# authoritative one and handles the oversized CRD.
kubectl apply -n argocd -f "$ARGOCD_MANIFEST" >/dev/null 2>&1 || true
kubectl apply --server-side --force-conflicts -n argocd -f "$ARGOCD_MANIFEST" >/dev/null
kubectl wait -n argocd --for=condition=ready pod \
  --selector=app.kubernetes.io/name=argocd-server --timeout=180s

echo "==> [4/8] ingress-nginx (one shared controller, as on Juno)"
kubectl apply -f "$INGRESS_NGINX_MANIFEST" >/dev/null
kubectl wait -n ingress-nginx --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller --timeout=180s

echo "==> [5/8] cert-manager $CERT_MANAGER_VERSION"
kubectl apply -f "https://github.com/cert-manager/cert-manager/releases/download/${CERT_MANAGER_VERSION}/cert-manager.yaml" >/dev/null
kubectl wait -n cert-manager --for=condition=ready pod \
  --selector=app.kubernetes.io/instance=cert-manager --timeout=180s

echo "==> [6/8] mkcert -> cert-manager CA ClusterIssuer '$ISSUER' (browser-trusted leaf certs)"
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

echo "==> [7/8] deploy the Cormac charts (issuer=$ISSUER, hosts=*.$DOMAIN)"
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

echo "==> [8/8] waiting for the TLS certs to issue"
for c in api web pane; do
  kubectl -n "$NS" wait --for=condition=ready certificate "cormac-$c-tls" --timeout=120s || true
done

# Optional: the full Genesis + Terra platform (the dashboard, the Terra catalog).
# Needs the Juno-Bootstrap repo; the base stack above already exercises the GitOps path.
if [ "${WITH_GENESIS:-}" = "1" ]; then
  GENESIS_HOST="${GENESIS_HOST:-genesis.$DOMAIN}"
  CERTNAME="default-${DOMAIN//./-}"
  echo "==> [opt] Genesis + Terra platform ($GENESIS_VERSION) at https://$GENESIS_HOST/"
  BOOT="${BOOT:-/tmp/Juno-Bootstrap}"
  [ -d "$BOOT" ] || git clone https://github.com/juno-fx/Juno-Bootstrap "$BOOT"

  # Genesis's upstream ingress declares no TLS of its own, so it rides ingress-nginx's
  # DEFAULT certificate (a built-in self-signed one = the browser warning). Make that
  # default a trusted *.$DOMAIN cert from the mkcert CA, so the dashboard loads trusted
  # on a real host instead of bare localhost.
  kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: ${CERTNAME}
  namespace: ingress-nginx
spec:
  secretName: ${CERTNAME}-tls
  dnsNames: ["*.${DOMAIN}", "${DOMAIN}"]
  issuerRef:
    name: ${ISSUER}
    kind: ClusterIssuer
EOF
  kubectl -n ingress-nginx wait --for=condition=ready certificate "$CERTNAME" --timeout=120s || true
  # Point ingress-nginx at it as the default cert (idempotent: add the arg only once).
  if ! kubectl -n ingress-nginx get deploy ingress-nginx-controller \
       -o jsonpath='{.spec.template.spec.containers[0].args}' | grep -q default-ssl-certificate; then
    kubectl -n ingress-nginx patch deploy ingress-nginx-controller --type=json \
      -p="[{\"op\":\"add\",\"path\":\"/spec/template/spec/containers/0/args/-\",\"value\":\"--default-ssl-certificate=ingress-nginx/${CERTNAME}-tls\"}]"
    kubectl -n ingress-nginx rollout status deploy/ingress-nginx-controller --timeout=120s || true
  fi

  # test.values.yaml pins a stale v2.0.2 and host=localhost; override both.
  helm upgrade -n argocd -i -f "$BOOT/test.values.yaml" \
    --set genesis.version="$GENESIS_VERSION" --set genesis.config.host="$GENESIS_HOST" \
    genesis "$BOOT/chart/"
  kubectl get deployments -n argocd -o name | xargs -n1 kubectl rollout restart -n argocd
  echo "    waiting for ArgoCD to sync Genesis..."
  for _ in $(seq 1 60); do
    if kubectl -n argocd get deploy genesis >/dev/null 2>&1; then break; fi
    sleep 3
  done
  kubectl -n argocd rollout status deploy/genesis --timeout=150s || true
  kubectl -n argocd rollout status deploy/terra   --timeout=150s || true
  echo "    Genesis dashboard: https://$GENESIS_HOST/  (login test@email.com / juno, trusted, no warning)"
fi

cat <<EOF

==> Rehearsal stack is up.

  Trusted, no /etc/hosts, no cert warning:
    https://api.$DOMAIN/     https://app.$DOMAIN/     https://pane.$DOMAIN/
  Verify the chain:  curl -v https://api.$DOMAIN  (terminates at the mkcert root)

  What this proves: the platform path. ArgoCD/ingress admission, cert-manager
  issuing browser-trusted TLS from the mkcert CA, and the charts applying.

  What it does NOT do (and why): the pods stay ErrImagePull. All five charts
  reference private amd64 GHCR images, so with no pull secret on this arm64
  cluster they cannot pull, by design. Running them needs the GHCR pull secret on
  Juno's amd64 nodes (and, for the api, the managed-Supabase env, it is
  fail-closed). Running pods + the capture-to-audit smoke are the onboarding step.

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
