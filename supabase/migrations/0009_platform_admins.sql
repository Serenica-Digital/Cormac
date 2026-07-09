-- Platform operators: Serenica-internal identities allowed on the
-- /api/operator/* surface. A tier above workspace roles, deliberately not a
-- membership: an operator administers tenants without being a member of any,
-- and workspace capability guards never consult this table. Rows land via
-- seed or SQL this round; there is no management API yet.
create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);

-- RLS on, deliberately zero policies (the 0008 posture): operator status is
-- privileged data. Only the service role, which bypasses RLS, touches it, and
-- authenticated gets no grant at all.
alter table public.platform_admins enable row level security;

grant select, insert, update, delete on public.platform_admins to service_role;
