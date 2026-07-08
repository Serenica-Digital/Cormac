# 0005 — Workspace-scoped agent tokens; the ops/authoring privilege split; Infisical is the secret authority

- **Status:** Accepted (2026-07-07)
- **Builds on:** ADR-0001 (authority, not transport, is the boundary), ADR-0004
  (bundled profile tools; #66 swaps bindings, not cognition)

## Context

The authoring agent's bundled tools become HTTP calls to the control plane in #66. The
runtime holds no database credentials of any kind (requirements invariant), but a bundled
tool needs *something* workspace-scoped to present. v0 solved this with a static
`MCP_WORKSPACE_TOKEN` env pair ("the token IS the tenant binding",
`archive/apps/api/src/mcp/routes.ts`), proven but single-workspace and unrevocable.
Separately, ADR-0004 left the operations-vs-authoring privilege split to #66, and the
2026-07-07 Genesis-token incident made repo-adjacent secret handling a settled requirement
(Infisical as authority, requirements.md).

## Decision

**1. Workspace-scoped agent tokens, hashed at rest.** Table `agent_tokens(workspace_id,
agent in ('authoring','operations'), token_hash unique, revoked_at)` (migration 0008).
A raw 32-byte token is minted once by a service-role script
(`scripts/mint-agent-token.ts`); only its SHA-256 lands in the database; lookup is by
hash; revocation is a timestamp. RLS is enabled with zero policies and the table has no
authenticated grant at all: only the service role reaches it.

**2. The token IS the tenant binding.** Agent routes live under `/agent/*` with no
workspaceId in the path; the token row supplies (workspace, agent kind). The token conveys
only the right to call those endpoints — every write behind them stays schema-validated
and service-role executed. Unknown and revoked tokens answer identically (401, no
existence leak).

**3. The privilege split is per-agent-kind capability sets**, enforced in the agent-auth
guard (`apps/control-plane/src/shared.ts`):

- `authoring` → `GET /agent/workbook`, `POST /agent/contract/submit`
- `operations` → `GET /agent/contract`, `GET /agent/records` (search, redacted),
  `GET /agent/records/:id` (redacted), `POST /agent/proposals`

An authoring token cannot submit proposals; an operations token cannot publish contracts.
Tested explicitly (`agent-tokens.test.ts`).

**4. Delivery and the secret authority chain** *(amended 2026-07-08; supersedes the
original derived-copy exception)*. Infisical (project `cormac`, ADR-0006 environments)
holds the only copy of every Cormac secret; the repo never holds a `.env` and **neither
does the Hermes profile**. The gateway launches under `infisical run`
(`pnpm agent:hub run`; `evals/workbook-authoring/profile/hub.sh`), so secrets flow
vault → process env → Hermes and its tool subprocesses. The original exception rested on
a false premise: Hermes does not read credentials only from the profile `.env` —
`get_env_value` checks the process environment and falls back to the file
(`hermes_cli/config.py:6366`), and worse, `reload_env` copies file values **into**
`os.environ`, overriding the injected slot. A profile `.env` is therefore not a derived
copy but a silent override, and `hub.sh` refuses to start while one exists. **Verified
live 2026-07-08** with no profile `.env` on disk: dev-slot launch → full turn +
`read_workbook` → control plane `GET /agent/workbook` 200 with the vault-injected token.

**Billing rides the ADR-0006 environments, and the slot selects the model too**
*(decision record: ADR-0007, which is canonical for the run lanes and the evidence rule)*
(`hub.sh` pins model/provider via idempotent `hermes config set` before launch, since
model choice is config state, not env): `dev` runs **gpt-5.5 on the Codex OAuth plan**
(flat-rate, cheap iteration); `staging` carries `ANTHROPIC_API_KEY` and runs **metered
Sonnet 4.6** — the only source of cost and verdict evidence, and the only model whose
behavior evidence counts (the interview skill is tuned on Sonnet). Both verified live
2026-07-08 (`model=gpt-5.5` and `model=claude-sonnet-4-6` in the gateway log,
respectively). **Rejected as a billing mode:** the claude.ai-OAuth fallback (the
Anthropic chain `ANTHROPIC_API_KEY → ANTHROPIC_TOKEN → CLAUDE_CODE_OAUTH_TOKEN`,
`auth.py:496`, falling through to the profile's seeded login) — verified reachable, but
it bills the plan's **"extra usage" pool, not the plan allocation**, which defeats the
purpose of a cheap dev mode.

## Consequences

- Revoking an agent's access is a database write, not a redeploy.
- The #66 bindings swap needs exactly two env vars in the gateway's injected
  environment: `CORMAC_CONTROL_PLANE_URL`, `CORMAC_AGENT_TOKEN`. A newly minted token
  takes effect at the next gateway relaunch (env is injected at launch); the E2E seed
  avoids restarts by rebinding the existing vault token's hash to the fresh workspace.
- Multi-workspace operation means one Hermes profile per (workspace, agent kind); a
  shared-profile design would need per-run token injection, which has no verified
  mechanism (toolsets and env freeze at conversation start).
- The security packet gains three verifiable claims: tokens hashed at rest,
  privilege-split by agent kind, revocation without redeploy.

## Alternatives considered

- **Per-run short-lived tokens:** rejected for now; there is no verified injection point
  mid-conversation (session toolsets and env freeze at start), and rotating the profile
  `.env` requires a gateway restart.
- **Token via the `instructions` seam:** rejected; secrets would enter model context.
- **v0's static env token pair:** rejected; unrevocable, single-workspace, and invisible
  to audit.
