-- Atomic application of an approved proposal. Ported from v0
-- (archive/supabase/migrations/0003_apply_proposal_fn.sql), proven live;
-- SQL unchanged.
--
-- The control plane has ALREADY authorized the caller (verified the token,
-- the workspace membership, and the role) and ALREADY validated the proposal
-- against the active contract. This function does NOT authorize. It receives an
-- already-authorized workspace_id and executes the writes as ONE transaction so
-- the record write, the audit event, and the proposal status flip are
-- all-or-nothing: any failure rolls the whole thing back.
--
-- SECURITY INVOKER (the default): the body runs with the caller's privileges.
-- The service role (which the control plane uses) bypasses RLS, so the writes
-- land. Any other role would be subject to RLS and the deliberately-absent
-- write policies, so even an accidental EXECUTE grant could not become a
-- cross-tenant write. EXECUTE is granted to the service role only.

create or replace function public.apply_proposal(
  p_workspace_id uuid,
  p_proposal_id uuid,
  p_actor_id uuid,
  p_contract_version_id uuid,
  p_changes jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_source_message_id uuid;
  v_change jsonb;
  v_op text;
  v_object text;
  v_record_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_applied jsonb := '[]'::jsonb;
begin
  -- Lock the proposal and confirm it is still pending in this workspace. This
  -- is a consistency check inside the transaction, not authorization.
  select source_message_id into v_source_message_id
  from public.agent_proposals
  where id = p_proposal_id and workspace_id = p_workspace_id and status = 'pending'
  for update;
  if not found then
    raise exception 'proposal % is not pending in workspace %', p_proposal_id, p_workspace_id
      using errcode = 'P0002';
  end if;

  for v_change in select * from jsonb_array_elements(p_changes)
  loop
    v_op := v_change->>'op';
    v_object := v_change->>'objectApiName';

    if v_op = 'update' then
      v_record_id := (v_change->>'recordId')::uuid;
      select data into v_before
      from public.business_records
      where id = v_record_id and workspace_id = p_workspace_id
      for update;
      if not found then
        raise exception 'record % not found in workspace %', v_record_id, p_workspace_id
          using errcode = 'P0002';
      end if;
      v_after := v_before || coalesce(v_change->'values', '{}'::jsonb);
      update public.business_records
        set data = v_after, updated_by = p_actor_id, updated_at = now()
      where id = v_record_id and workspace_id = p_workspace_id;
      insert into public.audit_events
        (workspace_id, actor_type, actor_id, action, object_api_name, record_id,
         before, after, source_message_id, proposal_id)
      values
        (p_workspace_id, 'user', p_actor_id, 'record_updated', v_object, v_record_id,
         v_before, v_after, v_source_message_id, p_proposal_id);

    elsif v_op = 'create' then
      insert into public.business_records
        (workspace_id, object_api_name, contract_version_id, data, created_by, updated_by)
      values
        (p_workspace_id, v_object, p_contract_version_id,
         coalesce(v_change->'values', '{}'::jsonb), p_actor_id, p_actor_id)
      returning id into v_record_id;
      insert into public.audit_events
        (workspace_id, actor_type, actor_id, action, object_api_name, record_id,
         before, after, source_message_id, proposal_id)
      values
        (p_workspace_id, 'user', p_actor_id, 'record_created', v_object, v_record_id,
         null, coalesce(v_change->'values', '{}'::jsonb), v_source_message_id, p_proposal_id);

    else
      raise exception 'unknown op %', v_op using errcode = '22023';
    end if;

    v_applied := v_applied
      || jsonb_build_object('op', v_op, 'objectApiName', v_object, 'recordId', v_record_id);
  end loop;

  update public.agent_proposals
    set status = 'applied', decided_by = p_actor_id, decided_at = now()
  where id = p_proposal_id and workspace_id = p_workspace_id;

  return v_applied;
end;
$$;

-- EXECUTE for the service role only. The control plane is the only caller; the
-- anon and authenticated roles must never reach this function.
revoke all on function public.apply_proposal(uuid, uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_proposal(uuid, uuid, uuid, uuid, jsonb)
  to service_role;
