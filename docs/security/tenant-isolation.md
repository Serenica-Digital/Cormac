# Tenant Isolation

Status: drafted (tested)
Maps to: control-register rows 1, 2, 11
Last reviewed: 2026-06-09

How one client's data is kept from another's, and how that is proven.

## The model

- Every tenant-scoped table carries a `workspace_id` ([0001_init.sql](../../supabase/migrations/0001_init.sql)).
- Row-level security is enabled on every tenant table, and the only policies are read policies gated on workspace membership ([0002_rls.sql](../../supabase/migrations/0002_rls.sql)). There are deliberately no write policies for users, so all writes go through the control plane's service role.
- Membership is checked by a `SECURITY DEFINER` function (`is_member`) so the membership table's own policy does not recurse.
- Authorization is also enforced in the control plane (workspace + role on every protected endpoint). RLS is the backstop that holds even if application logic is wrong.

## What a tenant can and cannot do directly

A signed-in user's database token can read only their workspace's rows, and can write nothing directly. Reaching another workspace's row, or inserting any row, is denied by RLS.

## How it is proven

[tests/integration/isolation.test.ts](../../tests/integration/isolation.test.ts) creates two workspaces and a user in only one, then asserts:

- the service role can read workspace A (sanity),
- a workspace B user sees none of A's records,
- a workspace B user cannot fetch A's record by id,
- a workspace B user cannot insert into A,
- audit events cannot be updated or deleted even by the service role.

This test is the evidence behind the isolation claim. It needs local Supabase to run and runs in CI; it now passes live against the local stack.

## CI guard

A CI lint asserts RLS is enabled on every table in the public schema, so a new table cannot ship without it ([ci.yml](../../.github/workflows/ci.yml)).

## Open items

- Database-level tenancy strategy for higher-trust tiers (one shared project vs separate projects per tenant) is unresolved (ADR-003).
- Workspace deletion currently conflicts with the append-only audit trigger; see the gap in [control-register.md](control-register.md) and [data-retention-deletion.md](data-retention-deletion.md).
