#!/usr/bin/env bash
# Sync the tracked profile source into the installed Hermes profile.
# The repo copy is the source of truth: edit here, run this, then rerun chat.
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/.hermes/profiles/cormac-authoring"

if [[ ! -d "$DEST" ]]; then
  echo "profile not found at $DEST" >&2
  echo "create it first: hermes profile create cormac-authoring --no-skills" >&2
  exit 1
fi

cp "$SRC/SOUL.md" "$DEST/SOUL.md"
cp "$SRC/config.yaml" "$DEST/config.yaml"
mkdir -p "$DEST/skills"
rm -rf "$DEST/skills/interview"
cp -R "$SRC/skills/interview" "$DEST/skills/interview"

echo "synced SOUL.md, config.yaml, skills/interview -> $DEST"
