#!/usr/bin/env bash
# One-time (idempotent) profile setup. config.yaml is machine-generated and
# machine-local; it is not tracked or synced. These commands are the entire
# intended delta from Hermes defaults, applied through the hermes CLI so the
# rest of the file stays owned by Hermes.
set -euo pipefail

WS="$(cd "$(dirname "$0")/.." && pwd)"
PROFILE=cormac-authoring

hermes -p "$PROFILE" config set model.default anthropic/claude-sonnet-4.6
hermes -p "$PROFILE" config set model.provider anthropic
hermes -p "$PROFILE" config set terminal.cwd "$WS"
# The interview tools run through the terminal on the API server platform
# (off by default there). Without this the agent falls back to execute_code,
# which is approval-gated and stalls the interview at submit.
hermes -p "$PROFILE" tools enable terminal --platform api_server

echo "profile $PROFILE configured (model, terminal.cwd=$WS, api_server terminal)"
