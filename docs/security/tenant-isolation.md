# Tenant isolation

> Statuses per the [control register](control-register.md). Last reviewed 2026-07-09.

## Row-level security (register row 1 — Verified)

Every tenant table carries `workspace_id`. RLS is enabled on all of them
with one read rule: an authenticated user may select rows only in workspaces
where `is_member()` holds. The isolation suite
(`apps/control-plane/tests/isolation.test.ts`) proves a member of workspace
A reads nothing of workspace B through every read path.

## The only-writer invariant (row 2 — Verified)

There are zero authenticated write policies. Inserts, updates, and deletes
happen exclusively through the control plane's service-role client, behind
the capability checks described in
[identity-and-access.md](identity-and-access.md). The same suite proves an
authenticated user's direct write attempts are refused at the database.

Two tables go further: `agent_tokens` and `platform_admins` have RLS enabled
with **zero policies** and no grant to authenticated at all — even hashed
credentials and operator status are service-role-only data.

## Agent-side isolation (rows 4-6 — Verified)

The runtime's access is bound to exactly one workspace by its token; no
workspace id ever travels in an `/agent/*` path, so there is nothing to
tamper with. Cross-tenant reads through the agent surface answer 404, proven
in `apps/control-plane/tests/agent-tokens.test.ts`.

## Deletion (row 19 — Partial)

Tenant offboarding uses `purge_workspace`, a SECURITY DEFINER function that
only the service role may execute; it is the single path the append-only
audit trigger sanctions for deletes. Gap, named: no dedicated test asserts a
non-service caller is refused (the function is exercised constantly as test
cleanup). See [known-gaps-and-roadmap.md](known-gaps-and-roadmap.md).
