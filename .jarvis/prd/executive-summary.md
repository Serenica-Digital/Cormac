# Executive Summary

**Cormac, by Serenica Digital** is a CRM for small businesses that already run on
spreadsheets, sold as an agent rather than an app. A client brings the workbook their
business actually lives in, and an authoring agent interviews them consultatively inside an
Excel task pane, reading the open workbook directly, to lift it into a published, versioned
semantic contract: their objects, fields, identity rules, aliases, and permissions. That
contract is the product's keystone IP and the shared source of truth. Day to day, an
operations agent takes natural-language input from whatever door the client prefers (the
Excel pane first, then web, SMS, and email) and turns it into proposed changes: "just closed
the deal with Carter, met his partner Susan" becomes structured record updates the user
confirms with a tap. Every mutation flows through one pipeline: capture, proposal against
the contract, confirmation per the workspace's trust policy, atomic apply, append-only
audit. Target segment is sub-$40/seat businesses like our design-partner real-estate firm;
the pitch is that they keep the spreadsheet mental model they already trust and gain an
assistant that keeps it current without data entry.

Architecturally, the trust boundary is authority, not transport. A Node/TypeScript control
plane is the only writer: it owns tenant routing, RBAC, contract publishing, the
proposal/confirm/audit pipeline, and every credential that can touch business data. The
agent runtime (Hermes) is private, stateless per task, and reachable only from the control
plane, which calls its API directly (`/v1/runs`, compiled cached context in the
`instructions` seam, SSE back); MCP exists only as an optional outward-facing surface, never
internal plumbing. The agent's write path is a single schema-enforced proposal gate; its
learning is memory-off with typed, governed slots (record-bound aliases, enum synonyms) that
pass a review gate before entering the compiled prefix. Data lives in managed
Supabase/Postgres with a JSONB-hybrid contract-driven schema and RLS. Everything ships as
plain containers and Helm charts, developed and proven on a local kind cluster that maps
one-to-one to EKS, so Juno remains a swappable substrate rather than a dependency. Build
order honors the v0 lesson: the authoring agent and its interview loop come first, because
that is the bet the product lives or dies on.

## Current stage (2026-07-08)

Keystone GO (ADR-0004) and the #66 walking skeleton built. Phases 1-2 on dev (pnpm
monorepo, @cormac/contract extracted); phases 3-5 proven and riding the #69→#71 PR
stack into dev: v2 migrations + integration harness (31/31 on the local stack), the
Fastify control plane (pipeline, human `/api/*` and agent `/agent/*` surfaces,
workspace-scoped agent tokens per ADR-0005), the ADR-0001 runtime module, and the
authoring bindings swap, proven by a live 14-turn agent-played interview publishing
through the real gate (interview economics hold: ~$0.50 at high cache hit, per the
spike baseline). Phase 7 proved the skeleton on managed Supabase (isolation 7/7,
HS256 refused / ES256-JWKS accepted live). Environment model settled (ADR-0006);
secrets are Infisical-only end to end (the Hermes profile `.env` is retired) and agent
runs are two-lane — dev = gpt-5.5 on the Codex plan for iteration, staging = metered
Sonnet for evidence (ADR-0007, verified by a full dev-lane interview E2E with 77-97%
prompt-cache hits). Phase 6 settled the operations data-access seam (ADR-0008): the ops
agent runs three typed plugin tools over `/agent/*` — no shell, no MCP callback — on a
locked-down profile (memory and curator off), proven by the 8-utterance protocol on the
metered lane (8/8 outcome classes, 8/8 first-submit valid, ~$0.015/capture at 82% cache,
control-plane restart survived). Open: authoring's migration off its shell binding
(ADR-0008 follow-up), the interview-skill patches, and the human-played interview before
any design-partner session. Next major piece under discussion: the Excel pane GO/NO-GO
probes (#67).
