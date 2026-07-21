-- Voice Engine Phase 6: real server-side TTS provider metadata and queue progress.
alter table if exists public.audio_render_jobs add column if not exists total_segments integer default 0;
alter table if exists public.audio_render_jobs add column if not exists current_segment_index integer default 0;
alter table if exists public.audio_render_jobs add column if not exists progress_percent integer default 0;
alter table if exists public.audio_render_jobs add column if not exists cache_key text;
alter table if exists public.audio_render_jobs add column if not exists preview_scope jsonb;
alter table if exists public.audio_render_jobs add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table if exists public.audio_render_jobs add column if not exists error_code text;
create index if not exists audio_render_jobs_active_unique_guard on public.audio_render_jobs(chapter_id, provider, status) where status in ('pending','rendering');
create index if not exists audio_render_jobs_created_by_day on public.audio_render_jobs(created_by, created_at) where created_by is not null;

alter table if exists public.audio_render_segments add column if not exists retry_count integer default 0;
alter table if exists public.audio_render_segments add column if not exists error_message text;
create index if not exists audio_render_segments_job_index on public.audio_render_segments(job_id, segment_index);

alter table if exists public.chapter_audio add column if not exists signed_asset_metadata jsonb default '{}'::jsonb;
