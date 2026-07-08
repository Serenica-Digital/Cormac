# Authoring-agent spike findings (#64, 2026-07-07)

Reusable knowledge from the keystone spike: empirical interview results and verified
Hermes mechanics. Verdict and decision live in ADR-0004; run evidence summary in
`evals/workbook-authoring/VERDICT.md`. Every claim here is **verified** in the spike
session unless marked assumed.

## Interview findings

- One-shot authoring failed in v0; the consultative loop fixed exactly the failing axis.
  Three runs, identical core structure (objects, orientation, types). No run ever needed
  the validator repair loop: a compact schema reference in the skill plus a validating
  submit gate was enough for first-submit validity on Sonnet 4.6.
- **Elicitation coverage is nondeterministic.** Whether a discretionary question gets
  asked (a status/stages probe) and how firmly a confirmed fact is encoded (closed set
  as enum vs string) varied across runs while structure held. Fix is procedural, not
  architectural: a mandatory per-object probe list and an encoding rule in the skill.
- **Checkpoint discipline bends under social pressure.** Given "I have a call in ten,"
  the agent skipped the final whole-contract review and submitted while the client was
  away. The review gate must be written as non-skippable.
- Skill edits demonstrably steer behavior run-over-run (sensitivity elicitation and
  identity-backup probes landed the run after being added).
- Trust flags are conversation-path-dependent: a client saying "just fix stale firms"
  legitimately yields different editableByAgent flags than one who says "ask first".
  This is fidelity, not instability; scorers must not treat flag variance as error.
- Eval integrity: `read_workbook` strips the fixture's `note`/`comment` meta-commentary,
  which names the planted ambiguities. Every "noticed unprompted" observation is real
  inference. Keep this rule for all future fixtures.

## Cost profile (metered key, Sonnet 4.6)

- Clean full interview (15 turns): **~$0.50 at 94% cache hit**. Interrupted/restarted
  run: ~$1.00 (cache colds). PM review of the session by Jarvis: ~$1.00 (1.35M input,
  90% cached).
- Ordinary conversation turns: ~21-24k input tokens, 99% cache reads, 3-5s latency.
- **The submit turn is the cost center**: ~310-380k input over ~14-15 internal
  agent-loop calls (draft JSON, run submit tool, confirm). The obvious optimization
  target if authoring cost ever matters; it does not at current volumes.
- Prompt caching is the economics: the same traffic uncached would cost ~3x.

## Verified Hermes mechanics (0.17, api_server platform)

- **Named conversations** (`/v1/responses`, `conversation` field) carry multi-turn
  interviews and survive gateway restarts and a mid-run credential swap.
- **Session toolsets freeze at conversation start.** `hermes tools enable` mid-run does
  not reach existing sessions; only fresh conversations see the change.
- **`terminal` is per-platform and off for `api_server` by default** (known from the
  Jarvis project). New consequence: without it the agent silently falls back to
  `execute_code`, which is approval-gated and stalls a `/v1/responses` interview; that
  endpoint offers no programmatic approval path (approvals ride `/v1/runs`).
- **`config.yaml` is Hermes-owned.** `tools enable` and friends rewrite it
  (`platform_toolsets`). Never track or sync the file; apply settings as idempotent
  `hermes config set` / `hermes tools enable` calls (see
  `evals/workbook-authoring/profile/setup.sh`). Our sync.sh clobbering it silently
  reverted the terminal enable and cost a run's submit path.
- **Credentials are per-profile**, seeded from the active profile at
  `hermes profile create`; the shared `~/.hermes/auth.json` is not the runtime source
  (ours holds no Anthropic entry at all). Without `ANTHROPIC_API_KEY` in the profile
  `.env`, calls bill the claude.ai subscription login and die on its usage cap.
  `.env` beats the seeded OAuth credential once the gateway restarts (verified).

  > **Correction (2026-07-08):** the spike tested profile-`.env`-vs-seeded-OAuth
  > precedence only, and ADR-0005 over-generalized it to "Hermes reads credentials only
  > from the profile `.env`". False: `get_env_value` checks the process environment and
  > falls back to the file (`hermes_cli/config.py:6366`), and `reload_env` copies file
  > values into `os.environ` — so a profile `.env` *overrides* injected env rather than
  > being the only source. Verified live: with no profile `.env`, the gateway and its
  > tool scripts run entirely on `infisical run`-injected env (full turn +
  > `read_workbook` → control plane 200), and with `ANTHROPIC_API_KEY` absent the call
  > reached Anthropic on the subscription credential. See ADR-0005 §4 as amended.
- **Cache visibility:** the `/v1/responses` usage block reports only
  input/output/total; the cache read split appears only in the gateway log
  (`cache=X/Y`). Cost accounting must read the logs.
- File tool resolves against process cwd; `terminal.cwd` steers only the terminal
  (known from the Jarvis project, reconfirmed).

## Assumed (not yet verified)

- The bundled-tool shape's latency/attack-surface deltas vs an MCP callback were argued,
  not measured; the operations agent (#66) owns that comparison.
- `hermes chat` iteration lane was never exercised (all runs rode the API server); the
  brief's assumption that it behaves identically is untested.

## Hardening pass mechanics (2026-07-08, verified — Hermes v0.17 source, NousResearch docs, live gateway logs; PR #75)

Recorded so no future profile-hardening pass re-derives them.

- **The skills toolset is three tools:** `skills_list`, `skill_view`, `skill_manage`.
  `hermes tools enable/disable` is toolset-level, all-or-nothing: there is no native way
  to keep `skill_view` while dropping `skill_manage`.
- **`curator.enabled false` kills only the background curator.** In-session
  `skill_manage` remains callable; curator-off alone does not close self-modification.
- **`skills.write_approval true` is what gates it:** every skill write is staged under
  `~/.hermes/pending/skills/` for out-of-band review, non-blocking to the session.
- **Bundled-skill removal:** `hermes skills opt-out --remove` strips installed bundled
  skills; `profile create --no-skills` starts a profile without them.
- **Toolset lockdown is also an economics lever:** the default api_server toolset
  schemas cost ~9-10k input tokens per call. Disabling everything but the
  `cormac-authoring` plugin + skills dropped the hardened interview to ~$0.12 at 96-99%
  steady-state cache (86k input total, 10.6k uncached, 4.5k output), ~4x under the
  ~$0.50 spike baseline.
