# Architecture and trust boundary

> Statuses per the [control register](control-register.md). Last reviewed 2026-07-09.

## Components

- **Web app** (React SPA): sign-in, workbook sharing, the setup interview,
  the review inbox, records, history, member management. Reads and writes
  only through the control-plane API with the user's session token.
- **Control plane** (Node/TypeScript, Fastify): the trust layer. Verifies
  identity, enforces role capabilities, runs the capture → proposal →
  decision pipeline, publishes contracts, writes every business record, and
  writes the audit trail. Holds the only database credential capable of
  writing.
- **Database** (Supabase Postgres): tenant data under row-level security;
  auth (GoTrue) as the identity broker.
- **Agent runtime** (Hermes): executes the authoring and operations agents.
  Reaches the system only through the control plane's `/agent/*` surface with
  a scoped token. Holds no database credentials (register row 3 — Partial:
  config-review evidence).

## The boundary, stated as rules

1. Surfaces never write. The web app's Supabase client is an auth broker
   only; there are zero authenticated write policies at the database
   (row 2 — Verified).
2. The runtime never writes. Its proposal submissions are held pending and
   applied only by a human decision through the control plane (row 12 —
   Verified).
3. Authority is checked server-side on every call — identity (row 8), role
   capability (row 9), agent capability (rows 4-5). UI gating is
   presentation only.
4. Responses do not leak internals: CORS is an explicit allowlist and 5xx
   detail is logged server-side, never returned (row 21 — Partial: enforced
   in the error handler, no dedicated test in v2).

## What is deliberately absent

- No rate limiting yet (row 24 — Planned). The v0 architecture diagram
  showed it; v2 code does not have it. This packet does not claim it.
- No SMS/email/Excel surfaces are wired in v2 yet; the web app is the first
  surface. Their security posture will be added here when they exist.
