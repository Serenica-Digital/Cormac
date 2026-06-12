-- The workspace knowledge layer, stratum 3: learned knowledge (ADR-027).
--
-- Typed learning slots, the only autonomous learning lane. The agent proposes a
-- value into one of a few narrow kinds; nothing free-text, nothing that
-- generalizes. Each item is one row, held until a human decides, and revocable
-- one at a time. The schema contract and glossary (strata 1-2) live in the
-- contract document; only this high-volume stratum is its own table.
--
-- Writes go through the control plane (service role), like every other table
-- (ADR-005). The two transitions that matter, propose-to-active and any
-- revocation, are audited; decide_learning makes the status flip and its audit
-- event one transaction, the apply_proposal pattern.

create table public.learned_knowledge (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('alias', 'enum_synonym')),
  payload jsonb not null,
  -- The aliased record, for alias only (null for enum_synonym). A deleted record
  -- takes its aliases with it, so a learned alias can never outlive its target.
  record_id uuid references public.business_records(id) on delete cascade,
  status text not null default 'proposed' check (status in ('proposed', 'active', 'revoked')),
  -- Provenance: the task and proposal that produced this. Set null on delete so
  -- losing the source message never deletes the learned item.
  source_message_id uuid references public.source_messages(id) on delete set null,
  proposal_id uuid references public.agent_proposals(id) on delete set null,
  -- The natural key per kind, lowercased. lower() here is ASCII-fold only; good
  -- enough for the pilot's keys, revisit if non-ASCII variants need folding.
  dedup_key text generated always as (
    case kind
      when 'alias' then lower(
        (payload->>'objectApiName') || '|' || (payload->>'recordId') || '|' || (payload->>'variant')
      )
      when 'enum_synonym' then lower(
        (payload->>'objectApiName') || '|' || (payload->>'fieldApiName') || '|' || (payload->>'synonym')
      )
    end
  ) stored,
  proposed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  -- An alias always carries its target record; other kinds never do, and the FK
  -- column can never drift from the payload the dedup_key is generated from.
  constraint learned_knowledge_alias_has_record
    check ((kind = 'alias') = (record_id is not null)),
  constraint learned_knowledge_record_matches_payload
    check (kind <> 'alias' or record_id = ((payload->>'recordId')::uuid))
);

create index learned_knowledge_ws_status
  on public.learned_knowledge(workspace_id, status, created_at desc);

-- One live item per natural key. Revoked rows are excluded, so re-proposing a
-- variant after it was revoked succeeds and reopens the slot.
create unique index learned_knowledge_live_dedup
  on public.learned_knowledge(workspace_id, kind, dedup_key)
  where status in ('proposed', 'active');

-- RLS: members read; nobody writes directly. The control plane (service role)
-- bypasses RLS and is the only writer (the 0002 pattern). purge_workspace needs
-- no change: the workspace_id cascade carries these rows with the workspace.
alter table public.learned_knowledge enable row level security;

create policy learned_knowledge_read on public.learned_knowledge
  for select to authenticated using (public.is_member(workspace_id));

-- ---------------------------------------------------------------------------
-- decide_learning: the human gate's one write. Activate a proposed item, reject
-- a proposed item, or revoke an active one, each as a status flip plus its audit
-- event in ONE transaction (the apply_proposal pattern). The control plane has
-- already authorized the caller; this only executes the transition. EXECUTE is
-- service-role only.
-- ---------------------------------------------------------------------------
create or replace function public.decide_learning(
  p_workspace_id uuid,
  p_learned_id uuid,
  p_actor_id uuid,
  p_action text
)
returns jsonb
language plpgsql
as $$
declare
  v_row public.learned_knowledge;
  v_new_status text;
  v_action_label text;
begin
  select * into v_row from public.learned_knowledge
  where id = p_learned_id and workspace_id = p_workspace_id
  for update;
  if not found then
    raise exception 'learned item % not found in workspace %', p_learned_id, p_workspace_id
      using errcode = 'P0002';
  end if;

  if p_action = 'activate' then
    if v_row.status <> 'proposed' then
      raise exception 'learned item % is %, not proposed', p_learned_id, v_row.status
        using errcode = 'P0002';
    end if;
    v_new_status := 'active';
    v_action_label := 'learning_activated';
  elsif p_action = 'reject' then
    if v_row.status <> 'proposed' then
      raise exception 'learned item % is %, not proposed', p_learned_id, v_row.status
        using errcode = 'P0002';
    end if;
    v_new_status := 'revoked';
    v_action_label := 'learning_rejected';
  elsif p_action = 'revoke' then
    if v_row.status <> 'active' then
      raise exception 'learned item % is %, not active', p_learned_id, v_row.status
        using errcode = 'P0002';
    end if;
    v_new_status := 'revoked';
    v_action_label := 'learning_revoked';
  else
    raise exception 'unknown action %', p_action using errcode = '22023';
  end if;

  update public.learned_knowledge
    set status = v_new_status, decided_by = p_actor_id, decided_at = now()
  where id = p_learned_id and workspace_id = p_workspace_id;

  insert into public.audit_events
    (workspace_id, actor_type, actor_id, action, object_api_name, record_id,
     before, after, source_message_id, proposal_id)
  values
    (p_workspace_id, 'user', p_actor_id, v_action_label,
     v_row.payload->>'objectApiName', v_row.record_id,
     jsonb_build_object('status', v_row.status, 'kind', v_row.kind, 'learned_id', v_row.id),
     jsonb_build_object('status', v_new_status, 'kind', v_row.kind, 'learned_id', v_row.id),
     v_row.source_message_id, v_row.proposal_id);

  return jsonb_build_object('id', v_row.id, 'status', v_new_status);
end;
$$;

revoke all on function public.decide_learning(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.decide_learning(uuid, uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- publish_contract: the one gate that changes a workspace's governed definition
-- (schema plus glossary, ADR-027 section 2). Server-authoritative version: the
-- caller's version in the document is ignored and replaced with max+1. The
-- workspace row is locked to serialize concurrent publishes, the old active
-- version is deactivated, the new one inserted active, and the publish audited,
-- all in one transaction. EXECUTE is service-role only (the 0003 pattern).
-- ---------------------------------------------------------------------------
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
