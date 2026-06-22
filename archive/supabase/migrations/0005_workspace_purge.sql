-- Workspace purge: a deliberate, service-role-only deletion path (issue #2).
--
-- audit_events is append-only by trigger, which also aborts the workspace
-- delete cascade, blocking offboarding (and test cleanup). The trigger now
-- permits DELETEs only while a transaction-local flag is set, and the only
-- thing that sets the flag is purge_workspace below. Updates stay forbidden
-- unconditionally: audit rows are never edited, purge or no purge.

create or replace function public.prevent_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE'
     and current_setting('serenica.allow_audit_purge', true) = 'on' then
    return old;
  end if;
  raise exception 'audit_events is append-only: % is not permitted', tg_op;
end;
$$;

-- The one sanctioned deletion path. SECURITY DEFINER so the cascade runs with
-- the function owner's authority; EXECUTE is service-role only, so offboarding
-- is a control-plane decision like every other write (ADR-005). The flag is
-- transaction-local (set_config is_local => true) and vanishes at commit or
-- abort, so nothing outside this function can ride along.
create or replace function public.purge_workspace(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('serenica.allow_audit_purge', 'on', true);
  delete from public.workspaces where id = p_workspace_id;
end;
$$;

revoke execute on function public.purge_workspace(uuid) from public;
revoke execute on function public.purge_workspace(uuid) from anon, authenticated;
grant execute on function public.purge_workspace(uuid) to service_role;
