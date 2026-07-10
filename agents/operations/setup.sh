#!/usr/bin/env bash
# One-time (idempotent) profile setup for cormac-operations. config.yaml is
# machine-generated and machine-local; it is never tracked or synced. These
# CLI calls are the entire intended delta from Hermes defaults.
#
# The posture is the point (the ops seam decision):
#   - The tool surface on the API-server platform is exactly the cormac_ops
#     plugin toolset (search_records, get_record, submit_proposal). Everything
#     Hermes enables by default there — web, browser, terminal, files, code
#     execution, delegation, memory — is disabled explicitly.
#   - Memory, the user profile, and the self-improvement curator are OFF.
#     Ungoverned learning on a product profile is the memory-off invariant's
#     failure mode (see the curator incident on cormac-authoring).
#
# Model/provider are NOT set here: the launch slot pins them (hub.sh,
# ADR-0007). Run sync.sh first: the plugin must be installed in the profile
# before it can be enabled.
set -euo pipefail

PROFILE=cormac-operations

if [[ ! -d "$HOME/.hermes/profiles/$PROFILE/plugins/cormac-ops" ]]; then
  echo "cormac-ops plugin not installed in the profile; run agents/operations/sync.sh first" >&2
  exit 1
fi

# Memory-off invariant, enforced at the profile layer.
hermes -p "$PROFILE" config set memory.memory_enabled false
hermes -p "$PROFILE" config set memory.user_profile_enabled false
hermes -p "$PROFILE" config set curator.enabled false

# Load the plugin (standalone plugins are opt-in via plugins.enabled).
hermes -p "$PROFILE" plugins enable cormac-ops

# Tool surface: the plugin toolset on, every default toolset off. The disable
# list is every configurable toolset the api_server platform otherwise
# carries; `tools list` below prints the survivors for eyeball verification.
hermes -p "$PROFILE" tools enable cormac_ops --platform api_server
hermes -p "$PROFILE" tools disable \
  web browser terminal file code_execution vision video image_gen video_gen \
  x_search moa tts skills todo memory context_engine session_search clarify \
  delegation cronjob homeassistant spotify \
  --platform api_server

echo "profile $PROFILE configured; api_server tool surface now:"
hermes -p "$PROFILE" tools list --platform api_server
