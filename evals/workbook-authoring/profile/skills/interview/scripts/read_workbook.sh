#!/usr/bin/env bash
# read_workbook — the authoring agent's view of the client workbook.
# Two bindings, same name and output shape (ADR-0004: the swap is bindings,
# not cognition):
#   - HTTP (production, #66): CORMAC_CONTROL_PLANE_URL set -> the control
#     plane serves the workspace's latest detection profile; the agent token
#     is the tenant binding (ADR-0005).
#   - Fixture (offline iteration): serves a detection profile from fixture/.
set -euo pipefail

WORKBOOK="${1:-relationship-crm}"

if [[ -n "${CORMAC_CONTROL_PLANE_URL:-}" ]]; then
  : "${CORMAC_AGENT_TOKEN:?CORMAC_AGENT_TOKEN missing from environment (launch the gateway via pnpm agent:hub)}"
  curl -fsS -m 60 \
    "$CORMAC_CONTROL_PLANE_URL/agent/workbook?name=$WORKBOOK" \
    -H "Authorization: Bearer $CORMAC_AGENT_TOKEN"
  exit 0
fi

# The workspace is wherever fixture/ lives: the terminal cwd when the profile is
# run as configured, else the repo checkout this script belongs to (covers the
# copy synced into ~/.hermes, which has no fixtures next to it).
resolve_ws() {
  if [[ -d "$PWD/evals/workbook-authoring/fixture" ]]; then echo "$PWD/evals/workbook-authoring"; return; fi
  if [[ -d "$PWD/fixture" ]]; then echo "$PWD"; return; fi
  local here; here="$(cd "$(dirname "$0")/../../../.." && pwd)"
  if [[ -d "$here/fixture" ]]; then echo "$here"; return; fi
  echo "cannot find the spike workspace (no fixture/ in \$PWD or beside the script); run from evals/workbook-authoring" >&2
  exit 1
}
WS="$(resolve_ws)"
FILE="$WS/fixture/$WORKBOOK.detected.json"

if [[ ! -f "$FILE" ]]; then
  echo "unknown workbook \"$WORKBOOK\"; available:" >&2
  ls "$WS/fixture" | sed 's/\.detected\.json$//' >&2
  exit 1
fi

# Strip fixture meta-commentary ("note"/"comment" fields describe the workbook's
# planted ambiguities for humans). A real workbook read has no analyst notes;
# leaking them would hand the agent the answers the interview must earn.
python3 - "$FILE" <<'EOF'
import json, sys

def strip(node):
    if isinstance(node, dict):
        return {k: strip(v) for k, v in node.items() if k not in ("note", "comment")}
    if isinstance(node, list):
        return [strip(v) for v in node]
    return node

print(json.dumps(strip(json.load(open(sys.argv[1]))), indent=2))
EOF
