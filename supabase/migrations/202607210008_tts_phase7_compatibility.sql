-- Voice Engine Phase 7: production TTS compatibility checks.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chapter-audio', 'chapter-audio', false, 52428800, array['audio/mpeg','audio/mp3'])
on conflict (id) do update set public = false;

alter table if exists public.audio_render_jobs add column if not exists error_code text;
alter table if exists public.audio_render_jobs add column if not exists total_segments integer default 0;
alter table if exists public.audio_render_jobs add column if not exists current_segment_index integer default 0;
alter table if exists public.audio_render_jobs add column if not exists progress_percent integer default 0;
alter table if exists public.audio_render_jobs add column if not exists preview_scope jsonb;
alter table if exists public.chapter_audio add column if not exists signed_asset_metadata jsonb default '{}'::jsonb;

alter table if exists public.audio_render_jobs enable row level security;
alter table if exists public.audio_render_segments enable row level security;
alter table if exists public.chapter_audio enable row level security;
