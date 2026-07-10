#!/usr/bin/env bash
# Sync the tracked profile source into the installed Hermes profile.
# The repo copy is the source of truth: edit here, run this, relaunch the hub.
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/.hermes/profiles/cormac-operations"

if [[ ! -d "$DEST" ]]; then
  echo "profile not found at $DEST" >&2
  echo "create it first: hermes profile create cormac-operations --no-skills" >&2
  echo "then run agents/operations/setup.sh" >&2
  exit 1
fi

# config.yaml is deliberately NOT synced: it is machine-generated, and Hermes
# mutates it (e.g. `tools enable`). Settings are applied via setup.sh instead.
# There is no skills dir on purpose: the skills mechanism needs the skills
# toolset (including skill_manage, agent self-editing), which this profile
# must not carry. The whole procedure lives in SOUL.md.
cp "$SRC/SOUL.md" "$DEST/SOUL.md"

# The cormac-ops plugin installs per-profile: Hermes scans
# <profile>/plugins/ as the user plugin dir under -p, so only this profile's
# gateway ever loads these tools (no global install, no project-plugin flag).
mkdir -p "$DEST/plugins"
rm -rf "$DEST/plugins/cormac-ops"
cp -R "$SRC/plugin" "$DEST/plugins/cormac-ops"
rm -rf "$DEST/plugins/cormac-ops/__pycache__"

echo "synced SOUL.md, plugins/cormac-ops -> $DEST"
