-- NovelVerse Cloud Core stores render state and object references only. Audio bytes
-- live in Cloudflare R2 and are never written to Supabase Storage or the database.
create table if not exists public.chapter_audio_renders (
  id uuid primary key default gen_random_uuid(),
  chapter_id text not null unique,
  job_id uuid not null unique,
  status text not null default 'queued' check (status in ('queued', 'rendering', 'uploading', 'ready', 'failed')),
  provider text not null default 'fish-speech',
  object_key text,
  content_type text,
  byte_size bigint,
  duration_seconds numeric,
  completed_segments integer not null default 0,
  total_segments integer not null default 0,
  request jsonb not null default '{}'::jsonb,
  error_message text,
  attempts integer not null default 0,
  heartbeat_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ready_render_has_object check (status <> 'ready' or object_key is not null)
);

create index if not exists chapter_audio_renders_queue_idx
  on public.chapter_audio_renders(status, updated_at)
  where status in ('queued', 'rendering', 'uploading');

alter table public.chapter_audio_renders enable row level security;

drop policy if exists "Published chapter audio metadata is readable" on public.chapter_audio_renders;
create policy "Published chapter audio metadata is readable"
  on public.chapter_audio_renders for select to authenticated
  using (status = 'ready');

comment on table public.chapter_audio_renders is
  'Render coordination and R2 object metadata; contains no audio payloads.';
