#!/usr/bin/env bash
# Stand the Cormac backend up in a local k3d cluster from the Helm charts
# (ADR-035). Builds the api/worker/hermes-runtime images arm64-native, imports
# them into k3d (no GHCR pull), and installs the charts with the local overlay.
# Secrets are NOT created here: create `cormac-secrets` out-of-band first, either
# via ESO/Infisical (deploy/eso/) or the bootstrap path in
# deploy/helm/secrets.example.yaml. Frontends run on the host (pnpm --filter
# @cormac/{web,pane} dev), not in-cluster.
set -euo pipefail

CLUSTER=cormac
NS=cormac
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing tool: $1" >&2; exit 1; }; }
need docker; need k3d; need kubectl; need helm

if ! k3d cluster list "$CLUSTER" >/dev/null 2>&1; then
  echo "==> creating k3d cluster '$CLUSTER'"
  k3d cluster create --config deploy/k3d/cluster.yaml
else
  echo "==> k3d cluster '$CLUSTER' already exists"
fi
kubectl create namespace "$NS" --dry-run=client -o yaml | kubectl apply -f -

if [ "${SKIP_BUILD:-}" != "1" ]; then
  echo "==> building backend images (arm64-native)"
  docker build -f docker/Dockerfile.node   --build-arg SERVICE=api    -t cormac/api:dev .
  docker build -f docker/Dockerfile.node   --build-arg SERVICE=worker -t cormac/worker:dev .
  docker build -f docker/Dockerfile.hermes                            -t cormac/hermes-runtime:dev .
fi
echo "==> importing images into k3d"
k3d image import -c "$CLUSTER" cormac/api:dev cormac/worker:dev cormac/hermes-runtime:dev

if ! kubectl -n "$NS" get secret cormac-secrets >/dev/null 2>&1; then
  echo "!! cormac-secrets is not present in namespace '$NS'."
  echo "   Create it first (ESO via deploy/eso/, or the bootstrap in deploy/helm/secrets.example.yaml)."
  echo "   The api will not boot without it (fail-closed, APP_ENV=dev)."
fi

echo "==> installing charts"
helm upgrade --install cormac-worker         deploy/helm/worker         -n "$NS" -f deploy/helm/worker/values.local.yaml
helm upgrade --install cormac-hermes-runtime deploy/helm/hermes-runtime -n "$NS" -f deploy/helm/hermes-runtime/values.local.yaml
helm upgrade --install cormac-api            deploy/helm/api            -n "$NS" -f deploy/helm/api/values.local.yaml

echo "==> waiting for rollouts"
kubectl -n "$NS" rollout status deploy/cormac-worker         --timeout=120s || true
kubectl -n "$NS" rollout status deploy/cormac-hermes-runtime --timeout=180s || true
kubectl -n "$NS" rollout status deploy/cormac-api            --timeout=180s || true

cat <<EOF

==> stack is up in namespace '$NS'. Next:
  kubectl -n $NS get pods
  kubectl -n $NS port-forward svc/cormac-api 8088:8088   # reach the control plane from the host
  infisical run -- pnpm seed                              # seed the managed dev project (once)
  pnpm smoke                                              # walking-skeleton proof (needs the port-forward)
  pnpm --filter @cormac/pane dev                          # the pane, on the host, against the k3d api
EOF
