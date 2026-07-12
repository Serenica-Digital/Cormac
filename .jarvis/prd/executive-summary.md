# Executive Summary

**Cormac, by Serenica Digital** is a CRM for small businesses that already run on
spreadsheets, sold as an agent rather than an app. A client brings the workbook their
business actually lives in, and an authoring agent interviews them consultatively inside an
Excel task pane, reading the open workbook directly, to lift it into a published, versioned
semantic contract: their objects, fields, identity rules, aliases, and permissions. That
contract is the product's keystone IP and the shared source of truth. Day to day, an
operations agent takes natural-language input from whatever door the client prefers (the
web app first, then the Excel pane, SMS, and email) and turns it into proposed changes: "just closed
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

## Current stage (2026-07-09)

Keystone GO (ADR-0004) and the #66 walking skeleton built. Phases 1-2 on dev (pnpm
monorepo, @cormac/contract extracted); phases 3-5 merged to `dev` (#69→#71): v2
migrations + integration harness (31/31 on the local stack), the
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
control-plane restart survived; one known behavior gap, relative numeric updates, is
contained by the review queue). Authoring hardening landed (#72/PR #75): the agent
migrated off its shell binding to typed `cormac-authoring` plugin tools, terminal off,
curator/memory off, `skills.write_approval` on, three ADR-0004 interview patches
applied; metered re-proof holds (first-submit valid, ~$0.12/interview at 96-99%
steady-state cache, ~4x under the ~$0.50 baseline; the lockdown itself halved per-call
input). Both product agents now run the ADR-0008 typed-tool pattern. Open: the
human-played interview (ADR-0004 criterion 3), owner-deferred until an interview UI
exists (vehicle: the web prototype, ADR-0010); a skill-wording tightening pass from two
graded metered deviations. The web-app prototype (#77, ADR-0010) is built on dev and
owner-tested: sign-in, workbook upload (browser-side .xlsx parse; only the detection
profile is uploaded), the authoring interview with workbook preview, capture, review
queue, records, and the per-record timeline, all over the real control plane (dev-lane
verification: plumbing, not evidence). A first owner test caught the agent reading the
seeded fixture instead of the upload — fixed at `e90177c` (no-name workbook read =
latest upload). Owner design review drove a client-language/type-scale pass (`a897657`)
and a full shadcn/ui + responsive relayout (`e4cc6ce`..`f207b39`); client-facing names:
contract = "Structure", audit = "History". The platform-infrastructure round is merged to dev
(stacked PR train **#79→#91**, merged in order 2026-07-09): member management +
`@cormac/authz` + `platform_admins`; platform-operator surface and `/operator` console;
demo seeding (fixed personas, tracked render smoke); role-aware UI + People page;
Microsoft/Google OAuth + magic-link sign-in via Supabase (magic link proven locally
end-to-end; OAuth waits on owner app registrations); and the security packet —
`docs/security/` control register (26 rows, Verified/Partial/Planned) +
`pnpm check:controls` guard + ops runbooks — under **ADR-0011 (Accepted)**; post-merge
verification: 82/82 tests across 18 files green and the guard clean on dev. An example
client workbook ships at `docs/dev/relationship-crm-example.xlsx` (`d3c107a`). Open:
the human-played interview (ADR-0004 criterion 3) — the web interview UI now exists, so
the owner click-through is the unblock; the #76 skill wording pass; the pane track
stays deferred (ADR-0009/0010).

## Road to beta (2026-07-12)

Direction set with the owner (full detail in `roadmap.md`): the target is an **open self-serve
beta on the EKS path** (ADR-0003), with **SMS as a core beta surface** (not a deferred door,
web still first per ADR-0010), and a design-partner pilot as the intermediate checkpoint. A
verification pass found the beta-blocking gaps prior work had not started: a client's data never
becomes records (no workbook import; onboarding yields an empty CRM), the app is reachable only
on local kind (agent features 503 without a deployed runtime; Juno blocked, #97), and there is
no self-serve signup (workspace creation is operator-only). The tracker was restructured the same
day: milestones **Beta 1-5**, issues **#98-109**, eight labeled **P0** (the first P0-labeled work
in v2); the stale pane-first milestones M1-M8 were archived. The two build long poles to start now
are data import (#98) and EKS (#68); the two owner-side external clocks to start now are A2P 10DLC
(#102) and SMTP+OAuth registrations (#103). The 2026-07-09 "next step is the human-played
interview" framing is folded into Beta 1 and the pilot checkpoint.
