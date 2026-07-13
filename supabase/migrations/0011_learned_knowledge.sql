-- Governed learning (the knowledge-layer spike; v0 design "typed slots only").
-- The agent proposes a typed fact it inferred from conversation; a human
-- approves it; only approved rows are compiled into the agent's context
-- prefix. Two kinds, no free text:
--   alias:        "BW" -> a specific record (FK, cascades away with the record)
--   enum_synonym: "hot" -> canonical enum option on a named field
-- Rejected rows are kept (append-only decision trail, same posture as
-- proposals). No auto-compaction, ever: rows enter only through the propose
-- gate and leave the prefix only by rejection or record deletion.

create table public.learned_knowledge (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('alias', 'enum_synonym')),
  object_api_name text not null,

  -- alias kind: the variant and its record binding.
  record_id uuid references public.business_records(id) on delete cascade,
  variant text,

  -- enum_synonym kind: the synonym and its canonical option.
  field_api_name text,
  synonym text,
  canonical_option text,

  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  rationale text,
  source_message_id uuid references public.source_messages(id) on delete set null,
  created_at timestamptz not null default now(),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,

  -- Shape-per-kind, enforced at the row.
  constraint learned_alias_shape check (
    kind <> 'alias' or (record_id is not null and variant is not null
      and field_api_name is null and synonym is null and canonical_option is null)
  ),
  constraint learned_enum_shape check (
    kind <> 'enum_synonym' or (field_api_name is not null and synonym is not null
      and canonical_option is not null and record_id is null and variant is null)
  )
);

-- One live (pending or approved) row per fact, per workspace.
create unique index learned_alias_live on public.learned_knowledge
  (workspace_id, object_api_name, lower(variant))
  where kind = 'alias' and status in ('pending', 'approved');
create unique index learned_enum_live on public.learned_knowledge
  (workspace_id, object_api_name, field_api_name, lower(synonym))
  where kind = 'enum_synonym' and status in ('pending', 'approved');

create index learned_by_workspace_status on public.learned_knowledge (workspace_id, status);

-- Same posture as the rest of the pipeline: members may read their
-- workspace's rows; every write goes through the control plane's service role.
alter table public.learned_knowledge enable row level security;

create policy learned_knowledge_read on public.learned_knowledge
  for select to authenticated
  using (public.is_member(workspace_id));

grant select on public.learned_knowledge to authenticated;
grant select, insert, update, delete on public.learned_knowledge to service_role;
