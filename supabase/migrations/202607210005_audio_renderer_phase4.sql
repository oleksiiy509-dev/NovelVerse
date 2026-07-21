create table if not exists public.audio_render_jobs (
  id uuid primary key default gen_random_uuid(),
  chapter_id bigint not null references public.chapters(id) on delete cascade,
  novel_id bigint not null references public.novels(id) on delete cascade,
  language text not null default 'auto',
  cast_snapshot jsonb not null default '[]'::jsonb,
  director_plan_id uuid references public.chapter_director_plans(id) on delete set null,
  provider text not null,
  priority integer not null default 5,
  retry_count integer not null default 0,
  status text not null default 'pending' check (status in ('pending','rendering','rendered','failed','canceled')),
  preview_scope jsonb,
  cache_key text not null,
  error_message text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists audio_render_jobs_status_priority_idx on public.audio_render_jobs(status, priority desc, created_at);
create index if not exists audio_render_jobs_chapter_idx on public.audio_render_jobs(chapter_id, language, provider);

create table if not exists public.audio_render_segments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.audio_render_jobs(id) on delete set null,
  chapter_id bigint not null references public.chapters(id) on delete cascade,
  segment_index integer not null,
  input_hash text not null unique,
  provider text not null,
  provider_version text not null,
  status text not null default 'rendered' check (status in ('pending','rendering','rendered','failed','canceled')),
  storage_path text,
  duration_seconds numeric,
  waveform jsonb not null default '[]'::jsonb,
  render_version text not null,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists audio_render_segments_chapter_idx on public.audio_render_segments(chapter_id, segment_index);
create index if not exists audio_render_segments_status_idx on public.audio_render_segments(status);

alter table public.chapter_audio add column if not exists bitrate integer;
alter table public.chapter_audio add column if not exists sample_rate integer;
alter table public.chapter_audio add column if not exists waveform jsonb not null default '[]'::jsonb;
alter table public.chapter_audio add column if not exists render_version text;
alter table public.chapter_audio add column if not exists cast_version text;
alter table public.chapter_audio add column if not exists director_version text;

alter table public.audio_render_jobs enable row level security;
alter table public.audio_render_segments enable row level security;

create policy "Admins manage audio render jobs" on public.audio_render_jobs for all using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin' or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin' or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "Readers view rendered audio segments" on public.audio_render_segments for select using (status = 'rendered');
create policy "Admins manage audio render segments" on public.audio_render_segments for all using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin' or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin' or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
