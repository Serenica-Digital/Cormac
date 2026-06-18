#!/usr/bin/env bash
# Build arm64 images natively on the Mac and push them to GHCR, then merge
# with the amd64 images CI already pushed into a multi-arch manifest at :dev
# (and :<sha> if provided).
#
# Usage:
#   pnpm push:arm64               # merges into :dev
#   TAG=abc1234 pnpm push:arm64   # also merges into :abc1234
#
# Prerequisites: docker login ghcr.io (once per machine)
#   echo <ghcr-pat> | docker login ghcr.io -u <github-username> --password-stdin
set -euo pipefail

REGISTRY="ghcr.io/serenica-digital"
TAG="${TAG:-dev}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing tool: $1" >&2; exit 1; }; }
need docker

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Confirm logged into GHCR before doing anything slow
if ! docker buildx imagetools inspect "$REGISTRY/api:$TAG" >/dev/null 2>&1; then
  echo "Cannot reach $REGISTRY/api:$TAG — confirm CI has pushed amd64 images"
  echo "and that you are logged in: echo <pat> | docker login ghcr.io -u <user> --password-stdin"
  exit 1
fi

echo "==> Building arm64 images natively (no emulation)"

docker buildx build \
  --platform linux/arm64 \
  -f docker/Dockerfile.node --build-arg SERVICE=api \
  -t "$REGISTRY/api:$TAG-arm64" \
  --push .

docker buildx build \
  --platform linux/arm64 \
  -f docker/Dockerfile.node --build-arg SERVICE=worker \
  -t "$REGISTRY/worker:$TAG-arm64" \
  --push .

docker buildx build \
  --platform linux/arm64 \
  -f docker/Dockerfile.web \
  -t "$REGISTRY/web:$TAG-arm64" \
  --push .

docker buildx build \
  --platform linux/arm64 \
  -f docker/Dockerfile.pane \
  -t "$REGISTRY/pane:$TAG-arm64" \
  --push .

docker buildx build \
  --platform linux/arm64 \
  -f docker/Dockerfile.hermes \
  -t "$REGISTRY/hermes-runtime:$TAG-arm64" \
  --push .

echo "==> Merging into multi-arch manifests at :$TAG"

for name in api worker web pane hermes-runtime; do
  docker buildx imagetools create \
    -t "$REGISTRY/$name:$TAG" \
    "$REGISTRY/$name:$TAG" \
    "$REGISTRY/$name:$TAG-arm64"
  echo "    $name: merged"
done

echo ""
echo "==> Done. $REGISTRY/{api,worker,web,pane,hermes-runtime}:$TAG are now multi-arch."
echo "    Run 'pnpm rehearsal:up' — pods should reach Running on the arm64 kind cluster."
