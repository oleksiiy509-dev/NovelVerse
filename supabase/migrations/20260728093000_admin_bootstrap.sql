-- Server-owned administrator roles and a race-safe first-administrator bootstrap.
-- user_metadata is intentionally never consulted for authorization.
create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

alter table public.user_roles enable row level security;

-- Preserve administrators provisioned with the previous trusted app_metadata
-- mechanism. After this one-time migration, user_roles is the source of truth.
insert into public.user_roles (user_id, role, created_by)
select id, 'admin', id
from auth.users
where raw_app_meta_data ->> 'role' = 'admin'
   or raw_app_meta_data ->> 'is_admin' = 'true'
on conflict (user_id) do nothing;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create policy "admins read roles"
on public.user_roles for select
using (public.is_admin());

create policy "admins create roles"
on public.user_roles for insert
with check (public.is_admin());

create policy "admins update roles"
on public.user_roles for update
using (public.is_admin()) with check (public.is_admin());

create policy "admins delete roles"
on public.user_roles for delete
using (public.is_admin());

grant select, insert, update, delete on public.user_roles to authenticated;

create or replace function public.bootstrap_first_admin()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    return false;
  end if;

  -- Serialize first-claim attempts so two simultaneous users cannot bootstrap.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('novelverse:first-admin'));

  if exists (
    select 1 from public.user_roles
    where user_id = caller_id and role = 'admin'
  ) then
    return true;
  end if;

  if exists (select 1 from public.user_roles where role = 'admin') then
    return false;
  end if;

  insert into public.user_roles (user_id, role, created_by)
  values (caller_id, 'admin', caller_id)
  on conflict (user_id) do update set role = excluded.role, created_by = excluded.created_by;
  return true;
end;
$$;

revoke all on function public.bootstrap_first_admin() from public;
grant execute on function public.bootstrap_first_admin() to authenticated;
