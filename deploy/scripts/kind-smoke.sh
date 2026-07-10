#!/usr/bin/env bash
# Minimal local proof on a kind cluster (ADR-0003: deployment claims come
# from running pods). Loads the locally built native-arch images, creates the
# derived Secret from the staging vault, installs control-plane + web (hermes
# releases behind WITH_HERMES=1), waits for rollout, and curls through
# port-forwards. No ingress/ArgoCD/cert-manager: this smokes the charts and
# images, not the routing.
#
#   deploy/scripts/kind-smoke.sh          # control plane + web
#   WITH_HERMES=1 deploy/scripts/kind-smoke.sh
set -euo pipefail

cd "$(dirname "$0")/../.."
CLUSTER="${CLUSTER:-cormac-smoke}"
NS=cormac

if ! kind get clusters 2>/dev/null | grep -qx "$CLUSTER"; then
  kind create cluster --name "$CLUSTER"
fi
kubectl config use-context "kind-$CLUSTER" >/dev/null

kind load docker-image cormac/control-plane:dev --name "$CLUSTER"
kind load docker-image cormac/web:dev --name "$CLUSTER"
[ "${WITH_HERMES:-0}" = "1" ] && kind load docker-image cormac/hermes:dev --name "$CLUSTER"

kubectl get ns "$NS" >/dev/null 2>&1 || kubectl create ns "$NS"
NS="$NS" deploy/scripts/secrets-from-infisical.sh

helm upgrade --install cormac-control-plane deploy/charts/control-plane \
  -n "$NS" -f deploy/charts/control-plane/values-kind.yaml
helm upgrade --install cormac-web deploy/charts/web \
  -n "$NS" -f deploy/charts/web/values-kind.yaml
if [ "${WITH_HERMES:-0}" = "1" ]; then
  helm upgrade --install cormac-hermes-authoring deploy/charts/hermes \
    -n "$NS" -f deploy/charts/hermes/values-authoring.yaml -f deploy/charts/hermes/values-kind.yaml
  helm upgrade --install cormac-hermes-ops deploy/charts/hermes \
    -n "$NS" -f deploy/charts/hermes/values-ops.yaml -f deploy/charts/hermes/values-kind.yaml
fi

kubectl -n "$NS" rollout status deploy/cormac-control-plane --timeout=180s
kubectl -n "$NS" rollout status deploy/cormac-web --timeout=180s
if [ "${WITH_HERMES:-0}" = "1" ]; then
  kubectl -n "$NS" rollout status deploy/cormac-hermes-authoring --timeout=300s
  kubectl -n "$NS" rollout status deploy/cormac-hermes-ops --timeout=300s
fi

kubectl -n "$NS" port-forward svc/cormac-control-plane 18080:8080 >/dev/null 2>&1 &
CP_PF=$!
kubectl -n "$NS" port-forward svc/cormac-web 15174:5174 >/dev/null 2>&1 &
WEB_PF=$!
trap 'kill $CP_PF $WEB_PF 2>/dev/null || true' EXIT
sleep 3

# The web bundle bakes its API URL at image build; a stale bake fails only in
# the browser ("Failed to fetch"), so check it mechanically here.
BAKED=$(kubectl -n "$NS" exec deploy/cormac-web -- sh -c \
  "grep -roh 'http://localhost:[0-9]*' /usr/share/nginx/html/assets | sort -u" | grep -v ':9999' || true)
if [ "$BAKED" != "http://localhost:8080" ]; then
  echo "WARNING: web bundle bakes API URL '$BAKED', expected http://localhost:8080." >&2
  echo "Rebuild: infisical run --env=staging -- sh -c 'docker build -f deploy/docker/Dockerfile.web \\" >&2
  echo "  --build-arg SUPABASE_URL --build-arg SUPABASE_ANON_KEY --build-arg CORMAC_API_URL=http://localhost:8080 -t cormac/web:dev .'" >&2
fi

echo "--- control plane /health:"; curl -fsS http://localhost:18080/health; echo
echo "--- web / (expect 200):"; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:15174/
echo "--- web SPA fallback (expect 200):"; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:15174/records/deep-route

kubectl -n "$NS" get pods
echo "kind smoke green"
