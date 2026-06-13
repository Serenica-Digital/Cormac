# ADR-032: Identity linking keys to auth.users, with phone_claims for the SMS claim

**Status:** Proposed (Option (a) recommended; Probe B selects (a) or (b), the build lands at M6)
**Date:** 2026-06-12
**Related:** Realizes the identity spine described in [../prd/architecture.md](../prd/architecture.md) ("The two trust models, one identity spine"). Selected by Probe B of the M1 spike (ADR-030); the lane-blind auth design that makes the fork cheap is ADR-031. Refines ADR-011 (Supabase brokers auth, the control plane decides authorization). The phone claim serves SMS arrival trust (M6, REQ-032).

## Context

The identity spine promises one user record per human holding linkable identity claims rather than a single credential: a Microsoft sign-in, an email/password credential, and a registered phone number all resolve to the same membership row and the same role. The build does not have this yet; the schema keys users to their Supabase identity only.

The load-bearing unknown is whether Microsoft sign-in through the pane lands on the **same** `auth.users` row as the email/password account for the same person, or creates a second one. Supabase links multiple OAuth and email identities under one `auth.users` row when it can match them (typically by verified email), but that behavior is configuration- and provider-dependent, so it is measured (Probe B), not assumed.

Every authority check already keys to `auth.users(id)`: `memberships(workspace_id, user_id → auth.users(id), role)`, the RLS `is_member` predicate, the control plane's `requireCapability` ([../../apps/api/src/auth.ts](../../apps/api/src/auth.ts)), the seed, the isolation suite, and `purge_workspace`. So if Microsoft and password sign-in resolve to one `auth.users` row, the spine already holds for those two claim types with zero schema change. The only claim Supabase does not broker is the SMS phone number, which has no Supabase identity.

## Decision

### Option (a) LEAN, recommended, contingent on Probe B

Keep keying to `auth.users(id)`. Add exactly one table for the claim Supabase cannot hold, built at M6 with the SMS door, not now:

```sql
create table phone_claims (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  e164          text not null,
  verified_at   timestamptz,
  created_at    timestamptz not null default now()
);

-- Arrival trust resolves a verified sender to one workspace member. The partial
-- unique index makes "one verified number per workspace" the resolver, while
-- letting an unverified number sit pending.
create unique index phone_claims_verified_uniq
  on phone_claims (workspace_id, e164)
  where verified_at is not null;
```

- RLS: read via `is_member` (the predicate every tenant table uses); **no write policy**, so only the control plane (service role) writes claims. Claims are managed through the RBAC'd admin surface and audited like any other privileged change.
- Cascade from `workspaces` so `purge_workspace` covers it with no change to the purge path.
- `memberships` and `requireCapability` stay byte-for-byte unchanged. SMS arrival trust (M6) resolves `e164 → user_id → membership` exactly as a session resolves `auth.users(id) → membership`, so both trust models hit the same row.

This is the whole change. The spine becomes real for all three claim types: Entra and password via Supabase's own linking, phone via `phone_claims`.

### Option (b), contingency only if Probe B fails

If Probe B shows Microsoft sign-in creates a **second** `auth.users` row for a person who already has a password account, Supabase is not linking them and Option (a)'s premise breaks. Then introduce an app-owned identity layer:

- `users` (app-owned) as the canonical person, and `user_identities(user_id → users(id), provider, provider_subject)` bridging each Supabase/OAuth identity and each phone number to one canonical person.
- Re-key `memberships` to `users(id)`.
- Change `authenticate`/`requireCapability` to resolve `auth.users(id) → user_identities → users(id)` before the membership lookup.

This is a larger, trust-boundary change (a branch and PR, the isolation suite as the floor). It is documented so the path exists; it is **not built on spec**. Probe B's `user.id` comparison across lanes (recorded by [../../apps/pane/src/auth/AuthPanel.tsx](../../apps/pane/src/auth/AuthPanel.tsx)) is the single input that selects (a) or (b).

## Consequences

- On the expected (a) path: no change to the auth path now; one migration at M6 adds `phone_claims`, and the isolation and purge suites extend to cover it.
- On the (b) path: a trust-boundary migration re-keys membership and changes the server-side resolution step; the lane code (ADR-031) still does not change.
- Either way the decision touches one seam, because the pane's lane-blind auth keeps the identity question downstream of any sign-in flow.

## Alternatives considered

**Build the app-owned identity layer now, unconditionally.** Rejected: it adds a join and a migration to every auth check before any evidence says Supabase fails to link, and the whole system already keys cleanly to `auth.users(id)`. Pay that cost only if Probe B forces it.

**A separate users table that duplicates Supabase identities from day one.** Rejected for the same reason: speculative complexity against a spine that holds today for the two Supabase-brokered claim types.

## Open items

1. Probe B's verdict (ADR-030), which confirms (a) or escalates to (b).
2. The `phone_claims` migration and its isolation/purge coverage, built at M6 with the SMS door.
