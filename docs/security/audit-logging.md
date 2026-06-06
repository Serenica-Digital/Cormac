# Audit Logging

Status: drafted (atomicity gap noted)
Maps to: control-register rows 7, 8
Last reviewed: 2026-06-06

The audit trail is both a compliance artifact and a user-trust feature: it is the safety net that makes a low-friction write loop tolerable (ADR-010), and the evidence an IT reviewer asks for.

## What is recorded

Every applied change writes an `audit_events` row ([apply.ts](../../apps/api/src/pipeline/apply.ts)) with: workspace, actor type and id, action, object and record, before and after values, a link to the source message that caused it, and a link to the proposal. Rejections are also recorded.

## Append-only

`audit_events` cannot be updated or deleted. A `before update or delete` trigger raises on any such attempt ([0001_init.sql](../../supabase/migrations/0001_init.sql)), so the guarantee holds even against the service role, not just against users. The isolation test asserts this.

## What is proven

- Append-only: the isolation test's audit case (update and delete both fail).
- Before/after correctness and source linkage: `tests/pipeline-integration.test.ts` asserts that approving a proposal produces a business record and an audit row with the right before/after and source link.

Both need local Supabase and run in CI.

## Known gap: atomicity

Today the record write, the audit insert, and the proposal-status flip are separate database calls, and multi-change proposals loop. A mid-way failure can leave a write without its audit row, or a partially-applied proposal. For an audit-trail product this is a real weakness, tracked in [control-register.md](control-register.md). The fix is to move apply into a single Postgres function (RPC) so write-and-audit are one transaction. Until then, claim 7 is `partial` in practice.

## Retention and client-facing detail

How long source messages are kept, and how much audit detail appears in the client-facing weekly report versus admin-only logs, are open decisions in [data-retention-deletion.md](data-retention-deletion.md).
