#!/usr/bin/env bash
# Build and push linux/amd64 images (Juno's nodes) to GHCR, tagged with the
# short commit sha. Requires `docker login ghcr.io` with a packages-scoped
# PAT. The web image bakes its env at build time, so pass CORMAC_API_URL
# (and WEB_BASE for sub-path routing) once the session settles the routing
# shape; the Supabase args ride in from the staging vault.
#
#   infisical run --env=staging -- deploy/scripts/build-push.sh [--only control-plane|web|hermes] [--tag t]
set -euo pipefail

cd "$(dirname "$0")/../.."
ONLY=""
TAG="$(git rev-parse --short HEAD)"
while [ $# -gt 0 ]; do
  case "$1" in
    --only) ONLY="$2"; shift 2;;
    --tag) TAG="$2"; shift 2;;
    *) echo "unknown arg: $1" >&2; exit 2;;
  esac
done

REG=ghcr.io/serenica-digital
PLATFORM=linux/amd64

want() { [ -z "$ONLY" ] || [ "$ONLY" = "$1" ]; }

if want control-plane; then
  docker buildx build --platform "$PLATFORM" --push \
    -f deploy/docker/Dockerfile.control-plane \
    -t "$REG/cormac-control-plane:$TAG" .
fi

if want web; then
  : "${SUPABASE_URL:?run under infisical run --env=staging}"
  : "${SUPABASE_ANON_KEY:?run under infisical run --env=staging}"
  : "${CORMAC_API_URL:?set CORMAC_API_URL to the API origin the browser will use}"
  docker buildx build --platform "$PLATFORM" --push \
    -f deploy/docker/Dockerfile.web \
    --build-arg SUPABASE_URL --build-arg SUPABASE_ANON_KEY \
    --build-arg CORMAC_API_URL --build-arg WEB_BASE="${WEB_BASE:-/}" \
    -t "$REG/cormac-web:$TAG" .
fi

if want hermes; then
  docker buildx build --platform "$PLATFORM" --push \
    -f deploy/docker/Dockerfile.hermes \
    -t "$REG/cormac-hermes:$TAG" .
fi

echo "pushed :$TAG for ${ONLY:-all three images} ($PLATFORM)"
