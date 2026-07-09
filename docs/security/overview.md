# Security overview

> Statuses per the [control register](control-register.md). Last reviewed 2026-07-09.

Cormac is a contract-first CRM agent platform. A client brings the
spreadsheet their business runs on; Cormac lifts its shape into a governed,
versioned semantic contract and keeps the resulting book current through
conversation. An AI agent proposes; humans approve; the system records.

## The trust model in one page

1. **One writer.** A Node/TypeScript control plane is the only thing that
   writes business records. Web surfaces and the AI runtime are doors; they
   never touch the database directly (register rows 2, 3 — Verified/Partial).
2. **Tenant isolation at the database.** Every tenant row carries a
   workspace id; row-level security allows members to read their own
   workspace and nobody to write (row 1 — Verified).
3. **The agent proposes, people decide.** The AI's only write path is a held
   proposal. A human with the approve capability applies it, atomically, with
   an audit event (rows 12, 13 — Verified).
4. **Least privilege for the AI.** The runtime holds a revocable,
   workspace-scoped token, split by function (authoring vs operations), and
   sensitive-flagged field values never enter the model context (rows 4-6,
   17 — Verified).
5. **Everything on the record.** An append-only audit trail records every
   applied change with actor, before, and after — and administration events
   (membership, provisioning, revocation) alongside (rows 14, 15 — Verified).

## Current deployment posture

Pre-pilot. Development runs on a local Supabase stack and a disposable
compute substrate; a managed Supabase project exists for staging. There is
no production deployment and no client data in the system today. The gaps
that must close before a pilot are listed plainly in
[known-gaps-and-roadmap.md](known-gaps-and-roadmap.md).
