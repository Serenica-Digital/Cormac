# Audit Logging

Status: drafted
Maps to: control-register rows 7, 8, 23
Last reviewed: 2026-06-10

The audit trail is both a compliance artifact and a user-trust feature: it is the safety net that makes a low-friction write loop tolerable (ADR-010), and the evidence an IT reviewer asks for.

## What is recorded

Every applied change writes an `audit_events` row ([apply.ts](../../apps/api/src/pipeline/apply.ts)) with: workspace, actor type and id, action, object and record, before and after values, a link to the source message that caused it, and a link to the proposal. Rejections are also recorded.

## Append-only, with one sanctioned exception

`audit_events` cannot be updated or deleted. A `before update or delete` trigger raises on any such attempt ([0001_init.sql](../../supabase/migrations/0001_init.sql)), so the guarantee holds even against the service role, not just against users. The isolation test asserts this.

The one exception is deliberate: full workspace deletion via `purge_workspace` ([0005_workspace_purge.sql](../../supabase/migrations/0005_workspace_purge.sql)), the service-role-only offboarding path, removes the purged workspace's audit rows along with everything else (register row 23, [data-retention-deletion.md](data-retention-deletion.md)). The exemption is a transaction-local flag only that function sets, applies to deletes only, and is itself tested: outside the purge, deletes still fail, and updates fail unconditionally everywhere ([tests/integration/workspace-purge.test.ts](../../tests/integration/workspace-purge.test.ts)).

## What is proven

- Append-only: the isolation test's audit case (update and delete both fail).
- Before/after correctness and source linkage: `tests/integration/pipeline-integration.test.ts` asserts that approving a proposal produces a business record and an audit row with the right before/after and source link.

Both need local Supabase and run in CI.

## Atomicity

The record write, the audit insert, and the proposal-status flip happen in one database transaction: `apply.ts` applies an approved proposal through the `apply_proposal` Postgres function ([0003_apply_proposal_fn.sql](../../supabase/migrations/0003_apply_proposal_fn.sql)). They all land together, or a failure rolls back every one, so a write can never be left without its audit row and a multi-change proposal can never be half-applied. Authorization stays in the control plane (token, membership, role) before the call; the function only executes the already-authorized writes, and `EXECUTE` on it is granted to the service role only.

Proven against live Postgres by `tests/integration/atomic-apply.test.ts`: a forced mid-way failure (a two-change apply whose second change is doomed) leaves zero of the three writes, and an `authenticated` user cannot execute the function.

## Retention and client-facing detail

How long source messages are kept, and how much audit detail appears in the client-facing weekly report versus admin-only logs, are open decisions in [data-retention-deletion.md](data-retention-deletion.md).
