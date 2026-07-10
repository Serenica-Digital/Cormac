#!/bin/sh
# Containerized union of the eval profile scripts (sync.sh + setup.sh +
# hub.sh's staging branch): stage the selected profile into the container's
# default profile dir, apply the ADR-0008 lockdown with idempotent config
# calls, pin the metered staging lane (ADR-0007 — the dev/codex lane is
# host-only), then hand off to the upstream s6 init exactly like the image's
# own ENTRYPOINT would. Runs before /init, so the docker/K8s env is intact
# here; with-contenv repopulates it for the gateway process later.
set -eu

: "${PROFILE:?PROFILE must be cormac-authoring or cormac-operations}"
: "${HERMES_API_KEY:?HERMES_API_KEY missing (becomes API_SERVER_KEY)}"
: "${ANTHROPIC_API_KEY:?ANTHROPIC_API_KEY missing (in-cluster runs are the metered staging lane)}"
: "${CORMAC_CONTROL_PLANE_URL:?CORMAC_CONTROL_PLANE_URL missing}"

case "$PROFILE" in
  cormac-authoring)
    : "${CORMAC_AGENT_TOKEN:?CORMAC_AGENT_TOKEN missing (mint + seed the staging workspace first)}"
    PLUGIN=cormac-authoring
    ;;
  cormac-operations)
    # One vault value per consumer name (hub.sh convention): the ops token
    # rides as CORMAC_OPS_AGENT_TOKEN and maps to the name the plugin reads.
    : "${CORMAC_OPS_AGENT_TOKEN:?CORMAC_OPS_AGENT_TOKEN missing (mint + seed the staging workspace first)}"
    # Exported before the /init handoff, so s6 captures it into the container
    # environment and with-contenv delivers it to the gateway process.
    export CORMAC_AGENT_TOKEN="$CORMAC_OPS_AGENT_TOKEN"
    PLUGIN=cormac-ops
    ;;
  *)
    echo "unknown PROFILE: $PROFILE" >&2; exit 2 ;;
esac

# Stage the profile into the default profile dir (/opt/data is the hermes
# user's home; the in-image CLI operates on it without -p).
cp "/profiles/$PROFILE/SOUL.md" /opt/data/SOUL.md
if [ -d "/profiles/$PROFILE/skills" ]; then
  rm -rf /opt/data/skills
  cp -R "/profiles/$PROFILE/skills" /opt/data/skills
fi
mkdir -p /opt/data/plugins
rm -rf "/opt/data/plugins/$PLUGIN"
cp -R "/profiles/$PROFILE/plugins/$PLUGIN" "/opt/data/plugins/$PLUGIN"

# Config calls run as root against the hermes home (s6 tooling and the venv
# activate script are not usable pre-/init); ownership is fixed once at the
# end, before the gateway drops to the hermes user.
export HOME=/opt/data
cd /opt/data

cfg() { /opt/hermes/bin/hermes "$@"; }

# Memory-off invariant at the profile layer (both profiles).
cfg config set memory.memory_enabled false
cfg config set memory.user_profile_enabled false
cfg config set curator.enabled false

cfg plugins enable "$PLUGIN"

if [ "$PROFILE" = "cormac-authoring" ]; then
  # Keep skills (the interview IS a skill) but close self-modification.
  cfg config set skills.write_approval true
  cfg skills opt-out --remove || true
  cfg tools enable cormac_authoring --platform api_server
  cfg tools enable skills --platform api_server
  cfg tools disable \
    web browser terminal file code_execution vision video image_gen video_gen \
    x_search moa tts todo memory context_engine session_search clarify \
    delegation cronjob homeassistant spotify \
    --platform api_server
else
  # Injection-facing agent: minimal surface, no skills at all.
  cfg tools enable cormac_ops --platform api_server
  cfg tools disable \
    web browser terminal file code_execution vision video image_gen video_gen \
    x_search moa tts skills todo memory context_engine session_search clarify \
    delegation cronjob homeassistant spotify \
    --platform api_server
fi

# The staging lane pin (hub.sh's non-dev branch): model choice is config
# state, not env, so it cannot ride the vault slot by itself.
cfg config set model.provider anthropic
cfg config set model.default anthropic/claude-sonnet-4.6

echo "profile $PROFILE staged; api_server tool surface:"
cfg tools list --platform api_server || true

chown -R hermes:hermes /opt/data

# Hand off to the upstream init with the gateway CMD (the archive image's
# pattern). API_SERVER_* reach the process via with-contenv.
export API_SERVER_ENABLED=true
export API_SERVER_KEY="$HERMES_API_KEY"
export API_SERVER_PORT="${API_SERVER_PORT:-8644}"
export API_SERVER_HOST=0.0.0.0
exec /init /opt/hermes/docker/main-wrapper.sh gateway run
