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

## Current stage (2026-07-07)

Clean-slate rebuild, day one. v0 (June 2026) is archived whole under `archive/`; its
retrospective and the sibling Jarvis project digest live in `.jarvis/research/`. Settled so
far: transport (ADR-0001), build order (ADR-0002), deployment posture (ADR-0003). Nothing
of v2 is built. The first work is the authoring-agent keystone spike.
