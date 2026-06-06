-- Serenica app-owned operational schema (ADR-002, ADR-003).
-- These are the ONLY fixed tables. Business objects are contract-defined data
-- that lives in business_records, never their own tables.

-- ---------------------------------------------------------------------------
-- Workspaces: the tenant boundary. Every tenant row below carries workspace_id.
-- ---------------------------------------------------------------------------
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Per-workspace write policy (ADR-010). Skeleton ships confirm_each.
  confirmation_mode text not null default 'confirm_each'
    check (confirmation_mode in ('confirm_each', 'apply_then_report')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Memberships: which user has which role in which workspace (ADR-011).
-- Users themselves live in Supabase auth.users.
-- ---------------------------------------------------------------------------
create table public.memberships (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null
    check (role in ('owner', 'agent_admin', 'manager', 'member', 'read_only')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Contract versions: the published, versioned semantic contract (ADR-002).
-- The active version is the source of truth records are written against.
-- ---------------------------------------------------------------------------
create table public.contract_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  version integer not null,
  document jsonb not null,
  is_active boolean not null default false,
  published_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (workspace_id, version)
);

-- At most one active contract per workspace.
create unique index contract_versions_one_active
  on public.contract_versions(workspace_id)
  where is_active;

-- ---------------------------------------------------------------------------
-- Business records: the JSONB-first hybrid store (ADR-002, ADR-003).
-- All contract-defined fields live in `data`. Generated columns materialize the
-- hot fields for indexed lookup; a GIN index covers arbitrary field queries.
-- ---------------------------------------------------------------------------
create table public.business_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  object_api_name text not null,
  contract_version_id uuid not null references public.contract_versions(id),
  data jsonb not null default '{}'::jsonb,
  -- Materialized hot fields (null when the object lacks them).
  gen_name text generated always as (coalesce(data->>'full_name', data->>'name')) stored,
  gen_email text generated always as (data->>'email') stored,
  gen_status text generated always as (data->>'status') stored,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index business_records_ws_object on public.business_records(workspace_id, object_api_name);
create index business_records_ws_name on public.business_records(workspace_id, gen_name);
create index business_records_ws_email on public.business_records(workspace_id, gen_email);
create index business_records_ws_status on public.business_records(workspace_id, gen_status);
create index business_records_data_gin on public.business_records using gin (data);

-- ---------------------------------------------------------------------------
-- Source messages: the inbound context every proposal traces back to (ADR-005).
-- ---------------------------------------------------------------------------
create table public.source_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  channel text not null check (channel in ('web', 'sms', 'email', 'excel', 'mcp')),
  sender text,
  user_id uuid references auth.users(id),
  content text not null,
  created_at timestamptz not null default now()
);

create index source_messages_ws_created on public.source_messages(workspace_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Agent proposals: untrusted runtime output, validated and held for review
-- (ADR-005, ADR-006, ADR-010). Nothing is written from a proposal until it is
-- applied by the control plane.
-- ---------------------------------------------------------------------------
create table public.agent_proposals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_message_id uuid not null references public.source_messages(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'applied', 'rejected')),
  payload jsonb not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  decided_by uuid references auth.users(id),
  decided_at timestamptz
);

create index agent_proposals_ws_status on public.agent_proposals(workspace_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- Audit events: append-only, with before/after and source link (ADR-005,
-- ADR-010, ADR-015). Append-only is enforced by trigger below, so it holds even
-- against the service role.
-- ---------------------------------------------------------------------------
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_type text not null check (actor_type in ('user', 'agent')),
  actor_id uuid references auth.users(id),
  action text not null,
  object_api_name text,
  record_id uuid,
  before jsonb,
  after jsonb,
  source_message_id uuid references public.source_messages(id),
  proposal_id uuid references public.agent_proposals(id),
  created_at timestamptz not null default now()
);

create index audit_events_ws_created on public.audit_events(workspace_id, created_at desc);

create or replace function public.prevent_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_events is append-only: % is not permitted', tg_op;
end;
$$;

create trigger audit_events_append_only
  before update or delete on public.audit_events
  for each row execute function public.prevent_mutation();
