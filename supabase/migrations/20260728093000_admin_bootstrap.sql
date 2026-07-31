-- Row-level policies are installed only after the preceding migration creates
-- both public.user_roles and public.is_admin().

drop policy if exists "admins read roles" on public.user_roles;
create policy "admins read roles"
on public.user_roles for select
using (public.is_admin());

drop policy if exists "admins create roles" on public.user_roles;
create policy "admins create roles"
on public.user_roles for insert
with check (public.is_admin());

drop policy if exists "admins update roles" on public.user_roles;
create policy "admins update roles"
on public.user_roles for update
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins delete roles" on public.user_roles;
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
