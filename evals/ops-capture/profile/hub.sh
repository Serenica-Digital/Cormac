#!/usr/bin/env bash
# hub.sh — run the cormac-operations gateway with secrets from the injected
# environment only (ADR-0005 as amended; environments per ADR-0006; billing
# lanes per ADR-0007). Modeled on the authoring hub.
#
#   pnpm ops:hub run                       # dev: Codex OAuth, gpt-5.5 (flat-rate; cheap iteration)
#   INFISICAL_ENV=staging pnpm ops:hub run # staging: metered Anthropic key, Sonnet (the only evidence lane)
#   pnpm ops:hub status | stop
#
# Deltas from the authoring hub, all deliberate:
#   - The profile's only tools are the cormac-ops plugin, installed
#     per-profile by sync.sh (~/.hermes/profiles/cormac-operations/plugins/),
#     so no other gateway on this machine ever loads it.
#   - The ops agent token lives in the vault as CORMAC_OPS_AGENT_TOKEN
#     (distinct from the authoring token) and is mapped to the plugin's
#     CORMAC_AGENT_TOKEN here. One value per consumer name, no drift.
#   - Port 8645 (authoring holds 8644).
set -uo pipefail

PROFILE="cormac-operations"
PORT="${API_SERVER_PORT:-8645}"
CMD="${1:-status}"; shift || true
while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="$2"; shift 2;;
    *) echo "unknown arg: $1" >&2; exit 2;;
  esac
done

case "$CMD" in
  run)
    : "${HERMES_API_KEY:?HERMES_API_KEY missing from environment — launch via 'pnpm ops:hub' (infisical run)}"
    : "${CORMAC_OPS_AGENT_TOKEN:?CORMAC_OPS_AGENT_TOKEN missing — seed the workspace first (pnpm seed:ops-e2e)}"
    : "${CORMAC_CONTROL_PLANE_URL:?CORMAC_CONTROL_PLANE_URL missing from the slot}"
    if [ -f "$HOME/.hermes/profiles/$PROFILE/.env" ]; then
      echo "REFUSING to start: $HOME/.hermes/profiles/$PROFILE/.env exists." >&2
      echo "Hermes loads that file into the process env, overriding the injected slot" >&2
      echo "(billing mode would silently flip). Delete it; Infisical is the authority." >&2
      exit 1
    fi
    SLOT="${INFISICAL_ENV:-dev}"
    if [ "$SLOT" = "dev" ]; then
      hermes -p "$PROFILE" config set model.provider codex >/dev/null
      hermes -p "$PROFILE" config set model.default gpt-5.5 >/dev/null
      BILLING="codex plan (gpt-5.5)"
    else
      : "${ANTHROPIC_API_KEY:?ANTHROPIC_API_KEY missing — the $SLOT slot is the metered mode and needs the key}"
      hermes -p "$PROFILE" config set model.provider anthropic >/dev/null
      hermes -p "$PROFILE" config set model.default anthropic/claude-sonnet-4.6 >/dev/null
      BILLING="metered anthropic (sonnet-4.6)"
    fi
    echo "starting $PROFILE gateway on :$PORT (slot: $SLOT, billing: $BILLING)"
    exec env \
      API_SERVER_ENABLED=true \
      API_SERVER_KEY="$HERMES_API_KEY" \
      API_SERVER_PORT="$PORT" \
      CORMAC_AGENT_TOKEN="$CORMAC_OPS_AGENT_TOKEN" \
      hermes -p "$PROFILE" gateway run
    ;;
  status)
    if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
      echo "UP on :$PORT"
    else
      echo "DOWN (:$PORT not listening)"; exit 1
    fi
    ;;
  stop)
    if pgrep -f "hermes -p $PROFILE gateway run" >/dev/null 2>&1; then
      pkill -f "hermes -p $PROFILE gateway run" && echo "stopped"
    else
      echo "not running"
    fi
    ;;
  *) echo "usage: hub.sh run|status|stop [--port N]" >&2; exit 2;;
esac
