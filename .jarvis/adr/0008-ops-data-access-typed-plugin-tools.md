# 0008 — Operations data access: typed per-profile plugin tools over /agent/*; no shell, no MCP callback

- **Status:** Accepted (2026-07-08)
- **Amends:** ADR-0004 (closes the operations half of the seam ADR-0001 left open;
  the authoring half stays as decided there, with a migration consequence below)
- **Builds on:** ADR-0001 (authority, not transport), ADR-0005 (agent tokens),
  ADR-0007 (evidence lanes)

## Context

ADR-0001 deliberately left open how the agent reaches workspace data mid-run, and
ADR-0004 closed it only for authoring (bundled tools), leaving the operations half to
#66. The question was framed as "bundled tools vs MCP callback," but both options are the
same API access — the control plane's `/agent/*` surface, ADR-0005 token, same validation
gates — differing only in how a tool call leaves the model. On Hermes, "bundled tools"
concretely means shell scripts run through the terminal toolset: the model's actual tool
is a shell, and our tool names exist only as prose in the prompt. That binding was
scaffolding the ADR-0002 no-infrastructure gate forced on the keystone spike (there was no
control plane to call), never a product design choice.

The operations agent is the system's prompt-injection target: it will eventually consume
inbound SMS and email from strangers. Whatever tools it holds are the blast radius. A
terminal's authority is not bounded by our token — it can do whatever the gateway host
allows — so shell-as-tool-transport is a behavioral hope where the product's whole story
is structural controls. Separately, Hermes's default API-server tool surface is enormous
(web, browser suite, terminal, files, execute_code, delegation, memory — all on by
default), and its memory/user-profile/curator machinery defaults on: the profile posture
had to be decided regardless of the seam.

A third binding surfaced while working the decision fresh: Hermes plugin tools — typed
tools registered per profile, handlers running in the gateway process. Typed tools with
no shell AND no connection state made the planned A/B experiment unnecessary; the owner
accepted the runtime coupling (we do not require the tools to be runtime-agnostic).

## Decision

1. **Operations data access is typed plugin tools calling `/agent/*`.** The `cormac-ops`
   plugin (tracked at `evals/ops-capture/plugin/cormac-ops/`) registers exactly three
   tools — `search_records`, `get_record`, `submit_proposal` — whose handlers make
   stateless HTTP calls to the control plane with the workspace-scoped operations token
   (ADR-0005; env pair injected at gateway launch). Names and shapes mirror the API
   (ADR-0004 discipline). The control plane is unchanged: no MCP mount, no new endpoint,
   no new dependency. ADR-0001's "MCP is never internal plumbing" stands without asterisk.
2. **The plugin installs per profile** (`~/.hermes/profiles/cormac-operations/plugins/`,
   via `profile/sync.sh` + one-time `plugins enable`): no other profile's gateway can load
   it. One profile per (workspace, agent kind) stays the deployment unit (ADR-0005).
3. **The ops profile is locked down** (`profile/setup.sh`, idempotent CLI calls):
   `platform_toolsets.api_server` pinned to exactly `[cormac_ops]` — no terminal, no
   files, no web, no browser, no execute_code, no delegation, no memory toolset — and
   `memory.memory_enabled`, `memory.user_profile_enabled`, `curator.enabled` all false
   (the memory-off invariant enforced at the profile layer).
4. **The procedure lives in SOUL.md; the profile has no skills.** The skills mechanism
   requires the skills toolset, which includes `skill_manage` (agent self-editing) — the
   exact surface the curator incident exploited on authoring. A static SOUL is also the
   cache-stable prefix.
5. **The contract stays in the compiled `instructions` prefix; capture rides `/v1/runs`**
   (ADR-0001), now live-proven end to end.

## Verified (2026-07-08, metered staging lane per ADR-0007; details in `.jarvis/research/ops-seam-findings.md`)

- The fixed 8-utterance protocol through the full product path: **8/8 outcome classes
  correct, 8/8 first-submit valid** (repair loop never fired). Ambiguity flagged
  `uncertain` with the assumption named; human-only-field and out-of-contract requests
  refused with plain-language explanations; a create resolved its relationship field to a
  real record id found by search.
- **~$0.015 per capture** (26 calls, 92k input at 82% cache-read, 3.4k output ≈ $0.12 for
  the batch); per-call input ~3.2–4.5k tokens; the static prefix cache-shares across
  tasks. Wall 2–20s per capture.
- **The v0 death mode is structurally gone:** control plane killed and relaunched
  mid-session; the untouched gateway's next capture ran clean. Stateless per-call HTTP
  has no connection to lose (this was the strongest argument against an MCP callback,
  now moot).
- Toolset lockdown verified from the CLI's own listing: the profile's api_server surface
  is the three plugin tools and nothing else.

## Consequences

- **Authoring migrates off the shell as follow-up work.** The security argument is weaker
  there (trusted owner, supervised session) but the end state is both agents on typed
  tools with terminal disabled; rides the authoring-profile hardening issue together with
  disabling its curator/memory (the still-open incident) and the ADR-0004 skill patches.
- The security packet gains verifiable claims: the operations agent holds exactly three
  typed tools; it has no shell, no file, no web, and no memory capability; every tool call
  authenticates with a revocable workspace-scoped token; every write is schema-validated
  and human-approved.
- We own ~200 lines of Python against Hermes's plugin API (`register_tool`), accepted
  coupling; if the runtime is ever swapped, the tool surface is a thin HTTP client to
  rewrite, and the `/agent/*` API is unchanged either way.
- One behavioral gap is known and contained (relative numeric updates skip the
  `get_record` read; the review queue's current → proposed display catches it); the SOUL
  rule fix needs a metered re-run before it counts.
- The eval harness (`evals/ops-capture/`) is the regression bed for future ops-agent
  changes: fixed protocol, seeded book, batch runner.

## Alternatives considered

- **Bundled shell scripts (authoring's binding, v0-frame option a):** rejected. Requires
  the terminal toolset on the injection-facing agent; the "tools" are prose promises, not
  registered tools; operationally fussier (cwd, sync, host python3). Its one advantage —
  zero infrastructure — died when the control plane landed (#66 phases 3–5).
- **MCP callback to the control plane (option b):** rejected. Adds a protocol, a
  dependency, an endpoint, and a long-lived connection (v0's proven fragility mode) to
  deliver typed tools the plugin gets with config alone; would also put an asterisk on
  ADR-0001's "MCP is never internal plumbing." MCP remains what ADR-0001 says: an
  optional outward-facing product surface.
- **Direct database access from the runtime:** never on the table (the only-writer
  invariant; the runtime holds no DB credentials).
