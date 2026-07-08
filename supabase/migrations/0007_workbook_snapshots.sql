-- Workbook snapshots: detection profiles (sheets, headers, inferred types,
-- sample rows) uploaded per workspace, served to the authoring agent through
-- the control plane's read_workbook binding (ADR-0004: the swap is bindings,
-- not cognition). The Excel pane later pushes real detection profiles into
-- this same table; the seam does not move again.
--
-- New in v2 (#66). The latest row per (workspace, name) is the served profile.
create table public.workbook_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  profile jsonb not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index workbook_snapshots_ws_name
  on public.workbook_snapshots(workspace_id, name, created_at desc);

-- Standard tenant read policy; no write policies (service role is the only
-- writer, the 0002 model).
alter table public.workbook_snapshots enable row level security;

create policy workbook_snapshots_read on public.workbook_snapshots
  for select to authenticated using (public.is_member(workspace_id));

-- Explicit Data API grants (the 0001 posture): control plane CRUD,
-- members read (RLS-filtered), anon nothing.
grant select, insert, update, delete on public.workbook_snapshots to service_role;
grant select on public.workbook_snapshots to authenticated;
