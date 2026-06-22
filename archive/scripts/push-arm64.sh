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
  --build-arg VITE_API_URL="${VITE_API_URL:-}" \
  --build-arg VITE_SUPABASE_URL="${VITE_SUPABASE_URL:-}" \
  --build-arg VITE_SUPABASE_ANON_KEY="${VITE_SUPABASE_ANON_KEY:-}" \
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

# Always merge from two clean single-arch sources: the amd64 digest from CI's
# push and the arm64 image we just built. Never feed the existing merged manifest
# back in — imagetools create accumulates entries rather than replacing them, so
# repeated runs would add a second arm64 entry instead of replacing the first.
for name in api worker web pane hermes-runtime; do
  amd64_digest=$(docker buildx imagetools inspect "$REGISTRY/$name:$TAG" --raw \
    | python3 -c "
import json, sys
m = json.load(sys.stdin)
for e in m.get('manifests', []):
    if e.get('platform', {}).get('architecture') == 'amd64':
        print(e['digest']); break
")
  if [ -z "$amd64_digest" ]; then
    echo "    $name: no amd64 entry found in :$TAG — skipping merge, pushing arm64 only"
    docker buildx imagetools create -t "$REGISTRY/$name:$TAG" "$REGISTRY/$name:$TAG-arm64"
  else
    docker buildx imagetools create \
      -t "$REGISTRY/$name:$TAG" \
      "$REGISTRY/$name:$TAG@$amd64_digest" \
      "$REGISTRY/$name:$TAG-arm64"
  fi
  echo "    $name: merged"
done

echo ""
echo "==> Done. $REGISTRY/{api,worker,web,pane,hermes-runtime}:$TAG are now multi-arch."
echo "    Run 'pnpm rehearsal:up' — pods should reach Running on the arm64 kind cluster."
