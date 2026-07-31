-- Create the server-owned administrator role store and its authorization helper
-- before any row-level security policy references public.is_admin().
create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

alter table public.user_roles enable row level security;

-- Preserve administrators provisioned with the previous trusted app_metadata
-- mechanism. Existing role rows are retained unchanged.
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
