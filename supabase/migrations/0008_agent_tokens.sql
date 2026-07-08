-- Agent tokens: workspace-scoped credentials for the runtime's bundled tools
-- to call the control plane's /agent/* surface (ADR-0005). The token IS the
-- tenant binding (v0's MCP_WORKSPACE_TOKEN pattern, DB-backed): it conveys only
-- the right to call the agent endpoints for one (workspace, agent kind); every
-- write behind them stays schema-validated and service-role executed. The
-- runtime itself still holds no database credentials of any kind.
--
-- New in v2 (#66). Raw tokens are minted once by a service-role script and
-- never stored; only the SHA-256 hash lands here. Lookup is by hash.
create table public.agent_tokens (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent text not null check (agent in ('authoring', 'operations')),
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index agent_tokens_ws on public.agent_tokens(workspace_id);

-- RLS on, deliberately zero policies: even hashed tokens are secrets. Only the
-- service role (which bypasses RLS) can read or write this table.
alter table public.agent_tokens enable row level security;

-- Service role only, and unlike the other tables authenticated gets no grant
-- at all: the RLS zero-policy stance, doubled at the privilege layer.
grant select, insert, update, delete on public.agent_tokens to service_role;
