#!/usr/bin/env bash
# Create/update the private GHCR pull Secret without writing credentials to
# disk. Supply a short-lived packages:read token in GHCR_TOKEN and revoke it
# after the meeting.
#
#   NS=<namespace> GHCR_USERNAME=<user> GHCR_TOKEN=<token> \
#     deploy/scripts/ghcr-pull-secret.sh
set -euo pipefail

NS="${NS:?set NS to the target namespace}"
GHCR_USERNAME="${GHCR_USERNAME:?set GHCR_USERNAME}"
GHCR_TOKEN="${GHCR_TOKEN:?set GHCR_TOKEN to a short-lived packages:read token}"

kubectl -n "$NS" create secret docker-registry ghcr-pull \
  --docker-server=ghcr.io \
  --docker-username="$GHCR_USERNAME" \
  --docker-password="$GHCR_TOKEN" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "ghcr-pull applied to namespace $NS"
