# Ops data-access seam findings (#66 phase 6, 2026-07-08)

Reusable knowledge from the operations seam experiment: verified Hermes plugin/toolset
mechanics and the live evidence behind ADR-0008. Verdict and decision live in ADR-0008;
run artifacts in `.jarvis/tmp/notes/ops-runs/` (gitignored scratch). Every claim here is
**verified** in this session unless marked assumed. Evidence lanes per ADR-0007: behavior,
cost, and validity numbers below come from the metered staging lane (Sonnet 4.6); dev-lane
(gpt-5.5) observations are marked as such and are not evidence.

## How the frame changed mid-decision

The seam question was written down (#65, ADR-0004) as "bundled tools vs MCP callback."
Working it fresh surfaced that both options are the same API access (the control plane's
`/agent/*`, ADR-0005 token, same gates); they differ only in how a tool call leaves the
model. "Bundled tools" on Hermes concretely meant shell scripts run through the terminal
toolset, i.e. the model's real tool is a shell — scaffolding the ADR-0002 no-infrastructure
gate forced on the spike, never a product choice. A third binding, Hermes plugin tools,
gives typed tools with no shell AND no connection state, and made the planned A/B bake-off
unnecessary: it strictly dominates both named options for the ops workload. The owner
accepted runtime-coupling (a plugin written against Hermes's plugin API) as a non-concern.

## Verified Hermes mechanics (0.17, plugin + toolset layer)

- **Plugin shape:** a directory with `plugin.yaml` (name, `manifest_version: 1`,
  `provides_tools`) and `__init__.py` exposing `register(ctx)`;
  `ctx.register_tool(name, toolset, schema, handler, check_fn, requires_env, emoji)`.
  Schemas are OpenAI-style function schemas; handlers are
  `def handler(args: dict, **kw) -> str` returning JSON via
  `tools.registry.tool_result/tool_error`.
- **Per-profile install:** under `hermes -p <profile>`, the "user plugins" scan dir is
  `~/.hermes/profiles/<profile>/plugins/` — a plugin installed there is invisible to every
  other profile. This is the isolation ADR-0005's one-profile-per-(workspace, agent kind)
  wants, with no global install and no env flag.
- **Standalone plugins are opt-in:** discovery skips them unless enabled
  (`hermes -p <profile> plugins enable <name>` writes `plugins.enabled`). Bundled
  `kind: backend/platform` plugins auto-load; ours must be enabled once per profile.
- **Project plugins (`./.hermes/plugins`, `HERMES_ENABLE_PROJECT_PLUGINS=1`) exist but the
  `plugins enable` CLI does not scan them** (`_discover_all_plugins` covers bundled + user
  only), so they cannot currently be opted in. Per-profile install avoids the gap entirely.
- **Toolset lockdown:** `platform_toolsets.<platform>` in the profile `config.yaml` is
  authoritative once explicitly saved. `hermes tools enable cormac_ops --platform
  api_server` then `hermes tools disable <every configurable toolset> --platform
  api_server` leaves exactly the plugin toolset. Verified surviving surface: the three
  cormac_ops tools, nothing else.
- **The api_server default toolset is enormous:** web search/extract, terminal, process,
  file read/write/patch/search, vision, image generation, the full browser suite,
  execute_code, delegate_task, cronjob, todo, memory, session_search, Home Assistant.
  A product profile that skips the lockdown ships all of it.
- **The skills mechanism requires the skills toolset**, whose tools include
  `skill_manage` (the agent editing its own skill library). A locked-down agent therefore
  carries its procedure in SOUL.md, which is always in the system prompt; the ops profile
  has no skills dir at all. This also removes the curator-rewrites-the-skill surface the
  authoring profile got burned by.
- **Memory and the curator are config keys, not toolsets:** `memory.memory_enabled`,
  `memory.user_profile_enabled`, `curator.enabled` — all default **true** and must be set
  false per profile (`profile/setup.sh` does; the authoring profile still needs the same
  fix, tracked separately).
- **`hermes profile create` seeds a profile `.env`** (inherits shell keys). The hub's
  refuse-to-start-if-.env-exists guard (ADR-0005 as amended) caught it on first launch;
  delete the file once after profile creation.
- **`hermes config set` writes scalars only** (bool/int/float/string); list-valued keys
  like `platform_toolsets.api_server` are reachable only through `hermes tools` (or the
  checklist TUI). Setup scripts must use the `tools` CLI for surface changes.

## Live evidence (staging lane: Sonnet 4.6, metered key, 2026-07-08)

Protocol: the fixed 8-utterance set (`evals/ops-capture/utterances.json`), one per outcome
class, against a seeded workspace (golden relationship-crm contract published by RPC, 8
organizations + 12 contacts with planted ambiguity/alias/create cases), through the real
product path: `POST /api/.../capture` → source message → compiled context in
`instructions` → `/v1/runs` + SSE → plugin tools → `/agent/*` → proposal held pending.

- **Outcome classes 8/8.** Clean create, update-by-name (notes + follow-up + last-contact
  all correct), ambiguous target (proceeded on Morgan Ellis with `uncertain: true` and the
  assumption named in notes), vocabulary-alias + enum flip, out-of-contract refusal,
  multi-change (update + create, with the new contact's `organization` relationship
  resolved to the real Bluewater record id via search), human-only-field refusal (named
  the field, did not attempt the write), read-then-update.
- **First-submit validity 8/8** (7 proposals + 1 in the restart probe); the verbatim-issue
  repair loop was never triggered. The v0-ported validation gate plus typed tool schemas
  was enough, as in the authoring spike.
- **Cost: ~$0.015 per capture** — the 8-task batch ran 26 model calls, 91,904 input tokens
  (82% cache-read), 3,415 output ≈ $0.12 total at metered Sonnet rates. Per-call input is
  ~3.2–4.5k tokens (SOUL + 3 tool schemas + compiled contract + task); the static prefix
  cache-shares **across** capture tasks, so even call #1 of a later task starts ~85% cached.
  Compare the authoring submit turn (~310–380k input): the ops loop is two orders of
  magnitude lighter per task. Comfortably inside the sub-$40/seat envelope at any
  plausible capture volume.
- **Wall time 2–20s per capture** end-to-end (refusals 2–5s, single-change updates
  ~12–18s, the 2-change task ~20s); 2–5 agent-loop calls, 1–3 tool calls per task. Plugin
  handler overhead is negligible (20–50ms per call including the control-plane round trip).
- **Restart probe passed (v0's death mode):** control plane killed and relaunched while
  the gateway stayed up; the gateway's next capture ran clean with no gateway restart.
  Stateless per-call HTTP means there is no connection state to lose, now shown live, not
  argued.
- **`/v1/runs` + SSE first live proof.** The ADR-0001 gated-run lane had been
  source-verified only (`runtime-operations.md` listed it as assumed); this experiment ran
  the whole protocol through it: 202 + `run.completed` via the event stream, output
  correlated by source message. `HermesRuntime.runCaptureTask` worked unmodified.

## Behavioral findings (metered lane)

- **Increment semantics miss:** "Showed Morgan Ellis two more opportunities" produced
  `opportunities_shown: 2` (the mentioned delta) instead of 5 (current 3 + 2); the agent
  skipped `get_record` and wrote the number in the message. The dev-lane model did the
  same, so it is a procedure gap, not a model quirk. Containment: the review queue shows
  current → proposed, so the human sees 3 → 2 and rejects. Fix is procedural (a SOUL rule:
  any relative numeric change requires reading the record first) and needs a re-run on the
  metered lane before it counts; filed as follow-up, not patched mid-experiment.
- Refusals come back fast and cheap (2–5s, one model call): the no-tool path costs almost
  nothing, which matters for SMS noise later.

## Dev-lane observations (gpt-5.5, non-evidence)

Same 8/8 outcome buckets and the same increment miss; ~$0 marginal cost on the Codex plan;
prompt caching reported in the same `cache=X/Y` log format (77–92%). The lane did its
ADR-0007 job: all plumbing and harness iteration happened there before the metered pass.

## Assumed (not yet verified)

- Concurrency: the protocol ran captures sequentially; the 10-concurrent-run cap and
  session accumulation on `/v1/runs` (v0 hit both) were not exercised.
- The plugin under Hermes upgrades: `register_tool` is a public plugin API, but no
  compatibility guarantee was checked beyond 0.17.
- Injection resistance of the locked-down profile was argued from surface area (three
  typed tools, no shell), not red-teamed in this experiment.
