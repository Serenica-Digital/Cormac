-- Row-level security. Ported from v0 (archive/supabase/migrations/0002_rls.sql),
-- proven live; SQL semantics unchanged. Tenant isolation is enforced at the
-- database, not just in application logic.
--
-- The model: authenticated users may READ rows of workspaces they belong to,
-- and nothing more. There are deliberately no INSERT/UPDATE/DELETE policies for
-- authenticated users, so RLS denies all direct writes. Every business write
-- goes through the control plane using the service role, which bypasses RLS.
-- This is the "control plane is the only writer" invariant, physical
-- (requirements.md; the authority boundary of ADR-0001).

-- Membership check used by every policy. SECURITY DEFINER so it runs as the
-- table owner and bypasses RLS internally, which avoids infinite recursion when
-- the memberships policy itself needs to test membership.
create or replace function public.is_member(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.workspace_id = ws
      and m.user_id = auth.uid()
  );
$$;

grant execute on function public.is_member(uuid) to anon, authenticated;

alter table public.workspaces enable row level security;
alter table public.memberships enable row level security;
alter table public.contract_versions enable row level security;
alter table public.business_records enable row level security;
alter table public.source_messages enable row level security;
alter table public.agent_proposals enable row level security;
alter table public.audit_events enable row level security;

create policy workspaces_read on public.workspaces
  for select to authenticated using (public.is_member(id));

create policy memberships_read on public.memberships
  for select to authenticated using (public.is_member(workspace_id));

create policy contract_versions_read on public.contract_versions
  for select to authenticated using (public.is_member(workspace_id));

create policy business_records_read on public.business_records
  for select to authenticated using (public.is_member(workspace_id));

create policy source_messages_read on public.source_messages
  for select to authenticated using (public.is_member(workspace_id));

create policy agent_proposals_read on public.agent_proposals
  for select to authenticated using (public.is_member(workspace_id));

create policy audit_events_read on public.audit_events
  for select to authenticated using (public.is_member(workspace_id));
