#!/usr/bin/env bash
# One interview turn over the production transport (ADR-0001):
# POST /v1/responses with a named conversation; server-side state carries the
# interview across calls. Usage: send-turn.sh <conversation> <client-message>
set -euo pipefail

CONV="${1:?usage: send-turn.sh <conversation> <message>}"
MSG="${2:?usage: send-turn.sh <conversation> <message>}"

ENV_FILE="$HOME/.hermes/profiles/cormac-authoring/.env"
KEY="$(grep '^API_SERVER_KEY=' "$ENV_FILE" | cut -d= -f2-)"
PORT="$(grep '^API_SERVER_PORT=' "$ENV_FILE" | cut -d= -f2- || true)"

BODY="$(CONV="$CONV" MSG="$MSG" python3 -c 'import json,os; print(json.dumps({"model":"cormac-authoring","input":os.environ["MSG"],"conversation":os.environ["CONV"],"store":True}))')"

curl -s -m 600 "http://127.0.0.1:${PORT:-8644}/v1/responses" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  --data "$BODY" \
| python3 -c '
import json, sys
d = json.load(sys.stdin)
if d.get("error"):
    print("API ERROR:", d["error"], file=sys.stderr)
    sys.exit(1)
for item in d.get("output", []):
    if item.get("type") == "message":
        for c in item.get("content", []):
            if c.get("type") == "output_text":
                print(c["text"])
u = d.get("usage") or {}
print("[usage in=%s out=%s total=%s]" % (u.get("input_tokens"), u.get("output_tokens"), u.get("total_tokens")), file=sys.stderr)
'
