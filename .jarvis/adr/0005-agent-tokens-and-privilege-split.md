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

**4. Delivery and the secret authority chain.** Infisical (project `cormac`, env `dev`)
holds the authority copy of every Cormac secret; the repo never holds a `.env`. The one
sanctioned exception is the Hermes profile `.env` (`~/.hermes/profiles/<name>/.env`,
chmod 600), because Hermes owns that file and reads credentials only from it (verified,
authoring-spike findings). Rule: the profile `.env` is a **derived copy**; the mint script
writes the raw token to Infisical and (with `--profile`) to the profile `.env`, never to a
repo file and never to stdout in the clear. Consequence: one profile instance per
(workspace, agent kind) at deploy time.

## Consequences

- Revoking an agent's access is a database write, not a redeploy.
- The #66 bindings swap needs exactly two env vars in the profile:
  `CORMAC_CONTROL_PLANE_URL`, `CORMAC_AGENT_TOKEN`.
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
