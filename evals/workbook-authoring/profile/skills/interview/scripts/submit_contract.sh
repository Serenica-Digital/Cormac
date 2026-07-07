#!/usr/bin/env bash
# submit_contract — the authoring agent's single write path.
# Validates the draft against the contract schema; on success publishes it to
# the run log. Mirrors the control plane's submit interface (#66): validation
# issues come back verbatim, nothing is published on failure.
set -euo pipefail

DRAFT="${1:?usage: submit_contract.sh <contract.json>}"

# Same workspace resolution as read_workbook.sh: terminal cwd first, then the
# repo checkout this script belongs to.
resolve_ws() {
  if [[ -d "$PWD/fixture" && -f "$PWD/scripts/validate-contract.ts" ]]; then echo "$PWD"; return; fi
  local here; here="$(cd "$(dirname "$0")/../../../.." && pwd)"
  if [[ -d "$here/fixture" && -f "$here/scripts/validate-contract.ts" ]]; then echo "$here"; return; fi
  echo "cannot find the spike workspace (no fixture/ in \$PWD or beside the script); run from evals/workbook-authoring" >&2
  exit 1
}
WS="$(resolve_ws)"
REPO="$(cd "$WS/../.." && pwd)"
OUT_DIR="$REPO/.jarvis/tmp/notes/authoring-runs"

DRAFT_ABS="$(cd "$(dirname "$DRAFT")" && pwd)/$(basename "$DRAFT")"
if [[ ! -f "$DRAFT_ABS" ]]; then
  echo "no such file: $DRAFT" >&2
  exit 1
fi

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
