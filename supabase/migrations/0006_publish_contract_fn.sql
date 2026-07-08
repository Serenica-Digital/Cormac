-- publish_contract: the one gate that changes a workspace's governed definition
-- (schema plus glossary). Carved out of v0's 0007_workspace_knowledge.sql
-- (the learning tables around it are deferred to issue #35); SQL unchanged.
--
-- Server-authoritative version: the caller's version in the document is
-- ignored and replaced with max+1. The workspace row is locked to serialize
-- concurrent publishes, the old active version is deactivated, the new one
-- inserted active, and the publish audited, all in one transaction. EXECUTE is
-- service-role only (the 0003 pattern).
create or replace function public.publish_contract(
  p_workspace_id uuid,
  p_document jsonb,
  p_actor_id uuid
)
returns jsonb
language plpgsql
as $$
declare
  v_next integer;
  v_old_version integer;
  v_new_id uuid;
begin
  perform 1 from public.workspaces where id = p_workspace_id for update;
  if not found then
    raise exception 'workspace % not found', p_workspace_id using errcode = 'P0002';
  end if;

  select coalesce(max(version), 0) into v_next
  from public.contract_versions where workspace_id = p_workspace_id;
  v_next := v_next + 1;

  select version into v_old_version
  from public.contract_versions where workspace_id = p_workspace_id and is_active;

  update public.contract_versions set is_active = false
  where workspace_id = p_workspace_id and is_active;

  insert into public.contract_versions
    (workspace_id, version, document, is_active, published_by)
  values
    (p_workspace_id, v_next, jsonb_set(p_document, '{version}', to_jsonb(v_next)), true, p_actor_id)
  returning id into v_new_id;

  insert into public.audit_events
    (workspace_id, actor_type, actor_id, action, object_api_name, record_id,
     before, after, source_message_id, proposal_id)
  values
    (p_workspace_id, 'user', p_actor_id, 'contract_published', null, null,
     case when v_old_version is null then null else jsonb_build_object('version', v_old_version) end,
     jsonb_build_object('version', v_next), null, null);

  return jsonb_build_object('contract_version_id', v_new_id, 'version', v_next);
end;
$$;

revoke all on function public.publish_contract(uuid, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.publish_contract(uuid, jsonb, uuid) to service_role;
