#!/usr/bin/env bash
# Tear down the Juno-shaped rehearsal cluster created by rehearsal-up.sh (ADR-039).
# Leaves the mkcert root CA installed in your keychain (reusable across runs);
# remove it manually with `mkcert -uninstall` if you ever want it gone.
set -euo pipefail
CLUSTER="${CLUSTER:-genesis}"
if kind get clusters 2>/dev/null | grep -qx "$CLUSTER"; then
  echo "==> deleting kind cluster '$CLUSTER'"
  kind delete cluster --name "$CLUSTER"
else
  echo "==> no kind cluster '$CLUSTER' to delete"
fi
