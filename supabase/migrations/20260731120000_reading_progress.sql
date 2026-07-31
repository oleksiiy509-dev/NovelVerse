-- Production reader progress persistence.
-- The production novels and chapters schema uses UUID primary keys.

begin;

create extension if not exists pgcrypto;

create table if not exists public.reading_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  novel_id uuid not null references public.novels(id) on delete cascade,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  progress_percent numeric(5, 2) not null default 0
    check (progress_percent >= 0 and progress_percent <= 100),
  scroll_position double precision not null default 0
    check (scroll_position >= 0),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- One row per user and novel is the contract used by the Reader's PostgREST
-- upsert. The other indexes support FK maintenance and recent-progress reads.
create unique index if not exists reading_progress_user_novel_idx
  on public.reading_progress (user_id, novel_id);
create index if not exists reading_progress_user_updated_idx
  on public.reading_progress (user_id, updated_at desc);
create index if not exists reading_progress_novel_idx
  on public.reading_progress (novel_id);
create index if not exists reading_progress_chapter_idx
  on public.reading_progress (chapter_id);

alter table public.reading_progress enable row level security;

-- PostgreSQL has no CREATE POLICY IF NOT EXISTS. Catalog guards make policy
-- creation safe when a deployment retries this migration.
do $migration$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'reading_progress'
      and policyname = 'users read own reading progress'
  ) then
    create policy "users read own reading progress"
      on public.reading_progress for select
      to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'reading_progress'
      and policyname = 'users insert own reading progress'
  ) then
    create policy "users insert own reading progress"
      on public.reading_progress for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'reading_progress'
      and policyname = 'users update own reading progress'
  ) then
    create policy "users update own reading progress"
      on public.reading_progress for update
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end
$migration$;

grant select, insert, update on public.reading_progress to authenticated;

commit;
