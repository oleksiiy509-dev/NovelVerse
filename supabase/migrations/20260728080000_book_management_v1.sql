-- Book Management System v1. Extend the canonical novels schema; do not create a parallel books table.
alter table public.novels add column if not exists owner_id uuid references auth.users(id) on delete cascade default auth.uid();
alter table public.novels add column if not exists tags text[] not null default '{}';
alter table public.novels add column if not exists language text not null default 'English';
alter table public.novels add column if not exists age_rating text not null default '13+';
alter table public.novels add column if not exists banner_url text;
alter table public.novels add column if not exists scheduled_at timestamptz;
alter table public.novels add column if not exists updated_at timestamptz not null default now();
alter table public.chapters add column if not exists position integer;
alter table public.chapters add column if not exists audio_status text default 'Missing';
alter table public.chapters add column if not exists audio_url text;
alter table public.novels enable row level security;
create policy "Owners manage novels" on public.novels for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
insert into storage.buckets (id, name, public) values ('book-assets','book-assets',true) on conflict (id) do nothing;
create policy "Owners upload book assets" on storage.objects for insert with check (bucket_id = 'book-assets' and auth.role() = 'authenticated');
