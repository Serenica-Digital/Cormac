# Data Retention and Deletion

Status: drafted (open decisions)
Maps to: control-register rows 1, 8; known gap (workspace deletion)
Last reviewed: 2026-06-06

## What exists today

- Records support soft-delete via an `archived_at` column rather than hard deletion ([0001_init.sql](../../supabase/migrations/0001_init.sql)); list queries exclude archived rows.
- The audit trail is append-only and retained as the record of what happened ([audit-logging.md](audit-logging.md)).

## Known gap: workspace deletion is currently blocked

Deleting a workspace cascades a delete into `audit_events`, which the append-only trigger rejects, so the deletion aborts. This means full workspace deletion and offboarding do not work yet. Tracked in [control-register.md](control-register.md). A deliberate deletion path is required before a pilot offboards a client: either soft-delete the workspace, or a `SECURITY DEFINER` purge routine the trigger exempts, with the purge itself audited.

## Open decisions (set before a real-data pilot)

- **Source-message retention.** How long inbound SMS/email source messages are kept, balancing provenance (the audit trail links to them) against minimization.
- **Deletion-request handling.** The process and SLA for a client or end-user deletion request, and how it interacts with the append-only audit (likely: redact the referenced data, keep the audit event with a tombstone).
- **Offboarding window.** How long a departed client's data is retained before purge.
- **Report detail.** How much audit detail appears in client-facing weekly reports versus admin-only logs (ADR-015 open item).

These are product/legal decisions, not yet code. They are listed here so the packet is honest that retention policy is defined-pending, not implemented.
