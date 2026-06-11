# Data Retention and Deletion

Status: drafted (open decisions)
Maps to: control-register rows 1, 8, 23
Last reviewed: 2026-06-10

## What exists today

- Records support soft-delete via an `archived_at` column rather than hard deletion ([0001_init.sql](../../supabase/migrations/0001_init.sql)); list queries exclude archived rows.
- The audit trail is append-only and retained as the record of what happened ([audit-logging.md](audit-logging.md)).
- **Full workspace deletion works and is deliberate.** `purge_workspace` ([0005_workspace_purge.sql](../../supabase/migrations/0005_workspace_purge.sql)) is the one sanctioned deletion path: `SECURITY DEFINER`, executable by the service role only, removing the workspace and everything beneath it including its audit rows. A plain delete still aborts on the append-only trigger; only the purge function's transaction-local flag is honored, and only for deletes. Proven by [tests/workspace-purge.test.ts](../../tests/workspace-purge.test.ts) (register row 23).
- Honesty note on purge evidence: because the purge removes the workspace's own audit rows, it leaves no in-database record of itself. Offboarding evidence therefore lives at the operational layer (the control-plane action that invoked it, the ops record of the offboarding). Whether a cross-workspace tombstone is wanted is an open decision below.

## Open decisions (set before a real-data pilot)

- **Source-message retention.** How long inbound SMS/email source messages are kept, balancing provenance (the audit trail links to them) against minimization.
- **Deletion-request handling.** The process and SLA for a client or end-user deletion request, and how it interacts with the append-only audit (likely: redact the referenced data, keep the audit event with a tombstone).
- **Offboarding window.** How long a departed client's data is retained before purge (the purge mechanism itself now exists; the window is the open policy).
- **Purge tombstone.** Whether a purge leaves a minimal cross-workspace record (workspace id, date, who ordered it) outside the purged workspace, so offboarding is evidenced in-database rather than only operationally.
- **Report detail.** How much audit detail appears in client-facing weekly reports versus admin-only logs (ADR-015 open item).

These are product/legal decisions, not yet code. They are listed here so the packet is honest that retention policy is defined-pending, not implemented.
