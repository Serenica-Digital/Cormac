#!/usr/bin/env bash
# Read-only readiness check for the meeting artifacts. It verifies the remote
# image tag, both chart paths, script syntax, and the no-Secret-in-manifests
# invariant. It never reads or prints secret values.
set -euo pipefail

cd "$(dirname "$0")/../.."
# Deployment-only commits do not rebuild the application images. Default to
# the tag pinned by the adapter; allow TAG to override it for a new release.
TAG="${TAG:-$(awk '/^[[:space:]]+tag:/{gsub(/"/, "", $2); print $2; exit}' plugins/cormac-preview/values.yaml)}"

bash -n deploy/scripts/ghcr-pull-secret.sh
bash -n deploy/scripts/secrets-from-infisical.sh
bash -n deploy/juno/prepare-terra-source.sh

for chart in control-plane web hermes; do
  helm lint "deploy/charts/$chart" >/dev/null
done

deploy/juno/prepare-terra-source.sh >/dev/null

if [ "$(grep -c "tag: \"$TAG\"" plugins/cormac-preview/values.yaml)" -ne 4 ]; then
  echo "Terra adapter is not pinned to all four :$TAG image slots" >&2
  exit 1
fi

rendered="$(mktemp)"
trap 'rm -f "$rendered"' EXIT
helm template cormac-preview plugins/cormac-preview > "$rendered"
if grep -q '^kind: Secret$' "$rendered"; then
  echo "REFUSING: Terra adapter rendered a Secret" >&2
  exit 1
fi

for image in cormac-control-plane cormac-web cormac-hermes; do
  docker buildx imagetools inspect \
    "ghcr.io/serenica-digital/$image:$TAG" >/dev/null
done

echo "Juno meeting artifacts ready (tag $TAG): direct Helm + Terra application"
