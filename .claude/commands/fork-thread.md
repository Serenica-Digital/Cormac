---
description: After forking a thread, claim a fork-unique plan file so this thread and its siblings stop clobbering each other's plan in ~/.claude/plans/.
argument-hint: [optional short label for this fork's purpose, e.g. juno-prep]
---

# Fork-thread setup: claim a collision-proof plan file

Run this **right after you fork a thread**, before doing any plan-mode work.

## The problem this fixes

Plan files live in `~/.claude/plans/` and are named by a slug of the thread's **opening prompt** (for example `i-feel-like-we-vectorized-adleman.md`). A forked thread inherits the parent's conversation, so it inherits the same opening prompt, so the harness hands the fork the **same plan filename as its parent**. Both threads then write to one file in plan mode and clobber each other: you save a plan, the sibling overwrites it, and one of you reads back the wrong plan. The harness already suffixes sub-agent plans with `-agent-<id>`; it does **not** do the same for forks. This command does.

The fix: give **this** fork its own plan file, keyed on its unique `CLAUDE_CODE_SESSION_ID`, seed it from the parent's plan so you keep continuity, and then write every plan for the rest of this thread to that file only.

Scope note: this addresses the plan-file collision specifically (the known fork hazard). It does not police other shared state.

## Step 1 — claim the fork-owned plan file (run this)

`$ARGUMENTS` is an optional short label for this fork's purpose.

```bash
# No `set -u` here: Claude Code sources a shell snapshot that references unbound
# vars (e.g. ZSH_VERSION); under `set -u` that aborts subshells and silently
# empties command substitutions. Plain bash, like the other project commands.
PLANS="$HOME/.claude/plans"
mkdir -p "$PLANS"

SID="${CLAUDE_CODE_SESSION_ID:-}"
CHILD="${CLAUDE_CODE_CHILD_SESSION:-0}"
LABEL="$ARGUMENTS"

if [ -z "$SID" ]; then
  SHORT="ts$(date +%s | tail -c 7)"
  echo "WARN: CLAUDE_CODE_SESSION_ID is empty; using a timestamp id ($SHORT)."
else
  SHORT="${SID:0:8}"
fi

if [ "$CHILD" != "1" ]; then
  echo "NOTE: CLAUDE_CODE_CHILD_SESSION is '${CHILD:-unset}', not 1 -- this may not be a fork."
  echo "      Harmless: the command just claims a session-owned plan file either way."
fi

# Optional label -> slug suffix
SLUG=""
if [ -n "$LABEL" ]; then
  SLUG="-$(printf '%s' "$LABEL" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | sed 's/^-//; s/-$//' | cut -c1-40)"
fi

# The seed = the newest plan that is NOT already a fork/agent file and was touched
# in the last 12h (the parent's in-flight plan this fork would otherwise collide
# on). Deterministic: ls -t by mtime, drop fork/agent files, recency-check via stat.
SEED="$(ls -t "$PLANS"/*.md 2>/dev/null | grep -vE '(-fork-|-agent-)' | head -1)"
if [ -n "$SEED" ]; then
  AGE_MIN=$(( ( $(date +%s) - $(stat -f %m "$SEED") ) / 60 ))
  [ "$AGE_MIN" -gt 720 ] && SEED=""
fi

if [ -n "$SEED" ]; then BASE="$(basename "$SEED" .md)"; else BASE="plan"; fi
FORK_PLAN="$PLANS/${BASE}-fork-${SHORT}${SLUG}.md"

if [ -e "$FORK_PLAN" ]; then
  echo "Fork plan already claimed (reusing): $FORK_PLAN"
else
  {
    printf '<!-- fork-thread: owner-session=%s parent-plan=%s claimed=%s -->\n\n' \
      "${SID:-unknown}" "$( [ -n "$SEED" ] && basename "$SEED" || echo none )" "$(date -u +%FT%TZ)"
    [ -n "$SEED" ] && cat "$SEED"
  } > "$FORK_PLAN"
  echo "Claimed fork plan: $FORK_PLAN"
fi

echo ""
echo "owner-session : ${SID:-unknown}"
echo "is-fork       : $([ "$CHILD" = "1" ] && echo yes || echo unconfirmed)"
if [ -n "$SEED" ]; then
  echo "seeded-from   : $(basename "$SEED")"
  echo "seed-title    : $(grep -m1 '^# ' "$SEED" 2>/dev/null | sed 's/^# //')"
else
  echo "seeded-from   : (none recent -- started empty)"
fi
echo ""
echo "FORK PLAN FILE -> $FORK_PLAN"
```

If a seed was copied, glance at its `seed-title`. If it is **not** this fork's lineage (wrong parent), clear the fork file back to just its header comment and start fresh. The parent's own file is never modified by this step.

## Step 2 — the binding contract (hold this for the rest of the thread)

From now until this thread ends:

- **Write and update every plan to the `FORK PLAN FILE` path printed above, and nothing else.** Treat that path as this thread's only plan file.
- **When plan mode suggests a default plan path, ignore it and write to the fork plan file instead.** That default is the slug shared with the parent; it is the collision.
- **Never write to or edit a bare-slug plan file** (one with no `-fork-` or `-agent-` suffix). A sibling thread may own it. Read one only to copy from it, never to write into it.
- **Leave the parent's plan file untouched.** Continuity comes from the seed copy, not from sharing the live file.

## Step 3 — report back

State plainly: that this fork now owns `<FORK PLAN FILE>`, whether it was seeded from a parent plan (and which), and that all further plan writes are bound to it. Then continue with whatever the fork was opened to do.
