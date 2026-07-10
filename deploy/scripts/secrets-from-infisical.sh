#!/usr/bin/env bash
# Create/update the one k8s Secret every chart consumes, as a DERIVED COPY of
# the Infisical staging environment (Infisical stays the sole authority,
# ADR-0005/0006; there is no ESO on clusters we do not control). Explicit
# allowlist, never a blanket export: host-lane names (legacy HERMES_URL,
# CORMAC_CONTROL_PLANE_URL, SUPABASE_DB_*) must not enter the cluster —
# in-cluster URLs are chart ConfigMap values. Applies straight to the current
# kubecontext; writes no file.
#
#   NS=<namespace> deploy/scripts/secrets-from-infisical.sh
set -euo pipefail

NS="${NS:?set NS to the target namespace}"
ENV_SLUG="${INFISICAL_ENV:-staging}"

infisical run --env="$ENV_SLUG" -- sh -c '
  kubectl -n "'"$NS"'" create secret generic cormac-secrets \
    --from-literal=SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:?}" \
    --from-literal=HERMES_API_KEY="${HERMES_API_KEY:?}" \
    --from-literal=ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}" \
    --from-literal=CORMAC_AGENT_TOKEN="${CORMAC_AGENT_TOKEN:-}" \
    --from-literal=CORMAC_OPS_AGENT_TOKEN="${CORMAC_OPS_AGENT_TOKEN:-}" \
    --dry-run=client -o yaml | kubectl apply -f -'

echo "cormac-secrets applied to namespace $NS (slot: $ENV_SLUG)"
