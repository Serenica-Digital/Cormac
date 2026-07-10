#!/usr/bin/env bash
# Render every release to plain kubectl-appliable YAML under deploy/rendered/
# (gitignored). This is the no-kubectl path for the Juno session: the files
# contain NO Secret by construction (cormac-secrets is created only by
# secrets-from-infisical.sh), so they are safe to hand to a namespace agent
# or paste into a dashboard. Apply order is the numeric prefix.
#
#   TAG=<image tag> deploy/scripts/render-manifests.sh [extra helm args]
set -euo pipefail

cd "$(dirname "$0")/../.."
TAG="${TAG:-$(git rev-parse --short HEAD)}"
OUT=deploy/rendered
mkdir -p "$OUT"

# KIND=1 renders against the local kind smoke images (per-chart values-kind
# overlay, tag dev) for the apply-standalone dress rehearsal.
kindf() { [ "${KIND:-0}" = "1" ] && echo "-f" "deploy/charts/$1/values-kind.yaml" || true; }
[ "${KIND:-0}" = "1" ] && TAG=dev

common=(--set "image.tag=$TAG" "$@")

# shellcheck disable=SC2046
helm template cormac-control-plane deploy/charts/control-plane \
  $(kindf control-plane) "${common[@]}" > "$OUT/00-control-plane.yaml"
# shellcheck disable=SC2046
helm template cormac-web deploy/charts/web \
  $(kindf web) "${common[@]}" > "$OUT/01-web.yaml"
# shellcheck disable=SC2046
helm template cormac-hermes-authoring deploy/charts/hermes \
  -f deploy/charts/hermes/values-authoring.yaml $(kindf hermes) "${common[@]}" > "$OUT/02-hermes-authoring.yaml"
# shellcheck disable=SC2046
helm template cormac-hermes-ops deploy/charts/hermes \
  -f deploy/charts/hermes/values-ops.yaml $(kindf hermes) "${common[@]}" > "$OUT/03-hermes-ops.yaml"

if grep -rl "kind: Secret" "$OUT" >/dev/null 2>&1; then
  echo "REFUSING: a rendered manifest contains a Secret; that must never happen" >&2
  exit 1
fi
echo "rendered to $OUT (tag $TAG); apply order 00 -> 03; secrets ride separately"
