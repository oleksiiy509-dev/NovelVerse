-- Book Management System v1. Run after the base auth migration.
create table if not exists public.books (
  id uuid primary key default gen_random_uuid(), owner_id uuid references auth.users(id) on delete cascade default auth.uid(),
  title text not null, author text not null default '', description text not null default '', genres text[] not null default '{}', tags text[] not null default '{}',
  language text not null default 'English', age_rating text not null default '13+', status text not null default 'Draft' check (status in ('Draft','Review','Scheduled','Published','Archived')),
  cover_url text, banner_url text, scheduled_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.book_languages (id uuid primary key default gen_random_uuid(), book_id uuid not null references public.books(id) on delete cascade, language text not null, status text not null default 'Not started', unique(book_id, language));
alter table public.chapters add column if not exists book_id uuid references public.books(id) on delete cascade;
alter table public.chapters add column if not exists position integer;
alter table public.chapters add column if not exists audio_status text default 'Missing';
alter table public.chapters add column if not exists audio_url text;
alter table public.books enable row level security;
alter table public.book_languages enable row level security;
create policy "Owners manage books" on public.books for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "Owners manage language versions" on public.book_languages for all using (exists(select 1 from public.books where books.id = book_id and books.owner_id = auth.uid())) with check (exists(select 1 from public.books where books.id = book_id and books.owner_id = auth.uid()));
insert into storage.buckets (id, name, public) values ('book-assets','book-assets',true) on conflict (id) do nothing;
create policy "Owners upload book assets" on storage.objects for insert with check (bucket_id = 'book-assets' and auth.role() = 'authenticated');
