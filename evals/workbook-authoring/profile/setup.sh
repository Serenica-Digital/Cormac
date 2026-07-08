#!/usr/bin/env bash
# One-time (idempotent) profile setup for cormac-authoring. config.yaml is
# machine-generated and machine-local; it is never tracked or synced. These
# CLI calls are the entire intended delta from Hermes defaults.
#
# The posture is the point (issue #72; the ADR-0008 authoring follow-up):
#   - The tool surface on the API-server platform is the cormac_authoring
#     plugin (read_workbook, submit_contract) plus the skills toolset, and
#     nothing else. Everything Hermes enables by default there — terminal,
#     web, browser, files, code execution, delegation, memory — is disabled
#     explicitly. The old ADR-0004 shell binding (terminal + scripts) is gone.
#   - Memory, the user profile, and the self-improvement curator are OFF, and
#     skill writes are gated behind approval. The curator silently rewriting
#     the installed interview skill was the memory-off invariant's failure
#     mode on this profile (#72); curator.enabled false kills the background
#     rewriter, skills.write_approval true stages any in-session skill_manage
#     write for review instead of applying it silently.
#
# Why keep the skills toolset here when cormac-ops disables it entirely: the
# authoring procedure IS a skill (skills/interview), and the agent must read
# it (skill_view). Hermes tool controls are toolset-level — you cannot drop
# only skill_manage — so we keep skills and neutralize self-modification with
# curator-off + write-approval instead. The injection-facing ops agent has no
# skill and takes the stronger posture (skills off); authoring does not.
#
# Model/provider are NOT set here: the launch slot pins them (hub.sh,
# ADR-0007). Run sync.sh first: the plugin must be installed in the profile
# before it can be enabled.
set -euo pipefail

PROFILE=cormac-authoring

if [[ ! -d "$HOME/.hermes/profiles/$PROFILE/plugins/cormac-authoring" ]]; then
  echo "cormac-authoring plugin not installed in the profile; run profile/sync.sh first" >&2
  exit 1
fi

# Memory-off invariant, enforced at the profile layer.
hermes -p "$PROFILE" config set memory.memory_enabled false
hermes -p "$PROFILE" config set memory.user_profile_enabled false
hermes -p "$PROFILE" config set curator.enabled false

# Skills: keep the toolset (the interview is a skill) but close the
# self-modification surface. write_approval stages every skill_manage write
# for out-of-band review; opt-out --remove guarantees no bundled "junk" skills
# are seeded (the profile is created --no-skills, so this is belt-and-braces).
hermes -p "$PROFILE" config set skills.write_approval true
hermes -p "$PROFILE" skills opt-out --remove

# Load the plugin (standalone plugins are opt-in via plugins.enabled).
hermes -p "$PROFILE" plugins enable cormac-authoring

# Tool surface: the plugin toolset and skills on; every other default toolset
# off. The disable list is the ops list minus `skills` (which authoring keeps).
# `tools list` below prints the survivors for eyeball verification.
hermes -p "$PROFILE" tools enable cormac_authoring --platform api_server
hermes -p "$PROFILE" tools enable skills --platform api_server
hermes -p "$PROFILE" tools disable \
  web browser terminal file code_execution vision video image_gen video_gen \
  x_search moa tts todo memory context_engine session_search clarify \
  delegation cronjob homeassistant spotify \
  --platform api_server

echo "profile $PROFILE configured; api_server tool surface now:"
hermes -p "$PROFILE" tools list --platform api_server
