#!/usr/bin/env bash
# Tear down the local k3d cluster created by scripts/k3d/up.sh (ADR-035).
set -euo pipefail
CLUSTER=cormac
if k3d cluster list "$CLUSTER" >/dev/null 2>&1; then
  echo "==> deleting k3d cluster '$CLUSTER'"
  k3d cluster delete "$CLUSTER"
else
  echo "==> no k3d cluster '$CLUSTER' to delete"
fi
