#!/usr/bin/env bash
# submit_contract — the authoring agent's single write path.
# Two bindings, same output shape (ADR-0004; the verbatim issues are the
# repair signal and must not change):
#   - HTTP (production, #66): CORMAC_CONTROL_PLANE_URL set -> the control
#     plane's validating publish gate. 200 publishes a contract_versions row;
#     422 returns every Zod issue verbatim, nothing published.
#   - Fixture (offline iteration): local schema validation, publish to the
#     run log under .jarvis/tmp/.
set -euo pipefail

DRAFT="${1:?usage: submit_contract.sh <contract.json>}"

DRAFT_ABS="$(cd "$(dirname "$DRAFT")" && pwd)/$(basename "$DRAFT")"
if [[ ! -f "$DRAFT_ABS" ]]; then
  echo "no such file: $DRAFT" >&2
  exit 1
fi

if [[ -n "${CORMAC_CONTROL_PLANE_URL:-}" ]]; then
  : "${CORMAC_AGENT_TOKEN:?CORMAC_AGENT_TOKEN missing from the profile .env}"
  BODY="$(python3 -c 'import json,sys; print(json.dumps({"contract": json.load(open(sys.argv[1]))}))' "$DRAFT_ABS")"
  HTTP_CODE=0
  RESPONSE="$(curl -sS -m 120 -w '\n%{http_code}' \
    -X POST "$CORMAC_CONTROL_PLANE_URL/agent/contract/submit" \
    -H "Authorization: Bearer $CORMAC_AGENT_TOKEN" \
    -H "Content-Type: application/json" \
    --data "$BODY")" || HTTP_CODE=$?
  STATUS="$(echo "$RESPONSE" | tail -1)"
  PAYLOAD="$(echo "$RESPONSE" | sed '$d')"

  if [[ "$STATUS" == "200" ]]; then
    echo "$PAYLOAD" | python3 -c '
import json, sys
d = json.load(sys.stdin)
print("VALID")
print(d["summary"])
print("PUBLISHED: version %s (contract_version_id %s)" % (d["version"], d["contractVersionId"]))
'
    exit 0
  elif [[ "$STATUS" == "422" ]]; then
    echo "$PAYLOAD" | python3 -c '
import json, sys
d = json.load(sys.stdin)
print("INVALID")
for issue in d.get("issues", []):
    print("%s: %s" % (issue["path"], issue["message"]))
'
    echo "NOT PUBLISHED: fix the issues above and resubmit."
    exit 1
  else
    echo "submit failed (HTTP $STATUS): $PAYLOAD" >&2
    exit 1
  fi
fi

# Same workspace resolution as read_workbook.sh: terminal cwd first, then the
# repo checkout this script belongs to.
resolve_ws() {
  if [[ -d "$PWD/evals/workbook-authoring/fixture" && -f "$PWD/evals/workbook-authoring/scripts/validate-contract.ts" ]]; then echo "$PWD/evals/workbook-authoring"; return; fi
  if [[ -d "$PWD/fixture" && -f "$PWD/scripts/validate-contract.ts" ]]; then echo "$PWD"; return; fi
  local here; here="$(cd "$(dirname "$0")/../../../.." && pwd)"
  if [[ -d "$here/fixture" && -f "$here/scripts/validate-contract.ts" ]]; then echo "$here"; return; fi
  echo "cannot find the spike workspace (no fixture/ in \$PWD or beside the script); run from evals/workbook-authoring" >&2
  exit 1
}
WS="$(resolve_ws)"
REPO="$(cd "$WS/../.." && pwd)"
OUT_DIR="$REPO/.jarvis/tmp/notes/authoring-runs"

if OUTPUT=$(cd "$WS" && npx tsx scripts/validate-contract.ts "$DRAFT_ABS" 2>&1); then
  mkdir -p "$OUT_DIR"
  DEST="$OUT_DIR/$(date +%Y%m%d-%H%M%S).contract.json"
  cp "$DRAFT_ABS" "$DEST"
  echo "$OUTPUT"
  echo "PUBLISHED: $DEST"
else
  echo "$OUTPUT"
  echo "NOT PUBLISHED: fix the issues above and resubmit."
  exit 1
fi
