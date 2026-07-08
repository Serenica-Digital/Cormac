#!/usr/bin/env bash
# hub.sh — run the cormac-authoring gateway with secrets from the injected
# environment only (ADR-0005 as amended; environments per ADR-0006).
#
# There is no profile .env and no `setup` command: Infisical is the sole
# secret path. Launch through the package script, which injects the slot:
#
#   pnpm agent:hub run                       # dev slot (no ANTHROPIC_API_KEY -> subscription billing)
#   INFISICAL_ENV=staging pnpm agent:hub run # staging slot (metered; the only source of cost evidence)
#   pnpm agent:hub status | stop
#
# The API server needs API_SERVER_KEY; the control plane authenticates with
# the same value as HERMES_API_KEY. One vault secret, two consumer names —
# mapped here so no duplicate value can drift.
set -uo pipefail

PROFILE="cormac-authoring"
PORT="${API_SERVER_PORT:-8644}"
CMD="${1:-status}"; shift || true
while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="$2"; shift 2;;
    *) echo "unknown arg: $1" >&2; exit 2;;
  esac
done

case "$CMD" in
  run)
    : "${HERMES_API_KEY:?HERMES_API_KEY missing from environment — launch via 'pnpm agent:hub' (infisical run)}"
    if [ -f "$HOME/.hermes/profiles/$PROFILE/.env" ]; then
      echo "REFUSING to start: $HOME/.hermes/profiles/$PROFILE/.env exists." >&2
      echo "Hermes loads that file into the process env, overriding the injected slot" >&2
      echo "(billing mode would silently flip). Delete it; Infisical is the authority." >&2
      exit 1
    fi
    echo "starting $PROFILE gateway on :$PORT (slot: ${INFISICAL_ENV:-dev}$( [ -n "${ANTHROPIC_API_KEY:-}" ] && echo ', billing: metered' || echo ', billing: subscription'))"
    exec env \
      API_SERVER_ENABLED=true \
      API_SERVER_KEY="$HERMES_API_KEY" \
      API_SERVER_PORT="$PORT" \
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
