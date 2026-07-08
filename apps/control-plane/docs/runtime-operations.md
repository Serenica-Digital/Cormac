# Runtime operations: the Hermes facts the control plane builds against

Deploy-time configuration and operational mechanics of the Hermes runtime
(api_server platform, 0.17), all **verified** in the keystone spike unless
marked otherwise. Source of evidence: `.jarvis/research/authoring-spike-findings.md`
and ADR-0001's live verification. The run-lifecycle code
(`src/runtime/`) encodes the transport; this file records what must be true
around it.

## Conversation and session mechanics

- **Named conversations** (`POST /v1/responses`, `conversation` field) carry the
  multi-turn authoring interview; server-side state survives gateway restarts
  and mid-run credential swaps. The control plane names them
  `authoring:<workspaceId>` (one interview lane per workspace).
- **Session toolsets freeze at conversation start.** `hermes tools enable`
  mid-run does not reach existing sessions. Consequence: profile/tool changes
  require a fresh conversation; the control plane must not assume a mid-course
  correction can reach a live interview.
- **Approvals ride `/v1/runs` only.** `/v1/responses` has no programmatic
  approval path. Anything approval-gated inside a `/v1/responses` interview
  stalls it silently.

## Profile configuration (deploy-time facts)

- **`terminal` is per-platform and OFF for `api_server` by default.** Without
  it the agent silently falls back to approval-gated `execute_code`, which
  stalls a `/v1/responses` interview (see above). Enabling it is part of
  profile setup (`evals/workbook-authoring/profile/setup.sh`).
- **`config.yaml` is Hermes-owned.** `hermes tools enable` and friends rewrite
  it (`platform_toolsets`). Never track or sync that file; apply settings only
  as idempotent `hermes config set` / `hermes tools enable` calls. (A sync
  script clobbering it cost the spike a run's submit path.)
- **Credentials are per-profile.** The profile `.env`
  (`~/.hermes/profiles/<name>/.env`, chmod 600) is the runtime credential
  source; it beats the seeded OAuth credential once the gateway restarts.
  Without `ANTHROPIC_API_KEY` there, calls bill the claude.ai login and die on
  its usage cap. Per ADR-0005 the same file carries the two Cormac vars
  (`CORMAC_CONTROL_PLANE_URL`, `CORMAC_AGENT_TOKEN`) as a **derived copy**;
  Infisical holds the authority copy. Env changes need a gateway restart to
  reach tool scripts.
- **`approvals.timeout` must be human-paced** for gated runs: 1800s, not the
  60s default (expiry DENIES the pending command).

## Observability and cost

- **The cache-read split is not in the API response.** The `/v1/responses`
  usage block reports only input/output/total; the split appears only in the
  gateway log (`cache=X/Y`). Cost accounting reads logs.
- Spike cost baseline (Sonnet 4.6, metered key): a clean 15-turn interview ran
  ~$0.50 at ~94% cache hit; the submit turn's internal agent loop
  (~310–380k input over ~14–15 calls) is the cost center.
- The runs SSE stream (`GET /v1/runs/{id}/events`) is the visibility surface:
  tool starts, `approval.request` (command/description/choices), token deltas.
  `GET /v1/runs/{id}` carries only status/last_event — stream, don't poll.

## Wire shapes (verified against Hermes 0.17 source)

- `POST /v1/responses` `{model, input, conversation, store, instructions?}` →
  `{output: [{type:'message', content:[{type:'output_text', text}]}], usage}`.
  The profile name is the model id.
- `POST /v1/runs` `{input, instructions?, session_id?}` → 202
  `{run_id, status:'started'}`; terminal SSE events `run.completed`
  (output+usage) / `run.failed` (error).
- `POST /v1/runs/{id}/approval` `{"choice":"once|session|always|deny"}`.

## Assumed (not yet verified)

- `hermes chat` behaves identically to the API server lanes (never exercised;
  all spike runs rode the API server).
- The `/v1/runs` lane end-to-end with a Cormac profile: shapes are
  source-verified, but the first live exercise is the #66 ops seam experiment.
