-- NovelVerse AI Audio Engine v2 foundation.
create extension if not exists pgcrypto;

create table if not exists public.chapter_audio (
  id uuid primary key default gen_random_uuid(),
  chapter_id bigint not null references public.chapters(id) on delete cascade,
  novel_id bigint not null references public.novels(id) on delete cascade,
  language text not null default 'auto',
  voice_id text not null default 'default',
  provider text not null default 'unconfigured',
  status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'failed')),
  storage_path text,
  duration_seconds numeric(10,2),
  file_size bigint,
  content_hash text not null,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint chapter_audio_ready_requires_storage check (status <> 'ready' or storage_path is not null),
  constraint chapter_audio_unique_generation unique (chapter_id, language, voice_id, content_hash)
);

create index if not exists chapter_audio_chapter_status_idx on public.chapter_audio(chapter_id, status, updated_at desc);
create index if not exists chapter_audio_novel_idx on public.chapter_audio(novel_id, language, voice_id);
create index if not exists chapter_audio_ready_idx on public.chapter_audio(chapter_id) where status = 'ready';

create or replace function public.set_chapter_audio_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_chapter_audio_updated_at on public.chapter_audio;
create trigger set_chapter_audio_updated_at before update on public.chapter_audio for each row execute function public.set_chapter_audio_updated_at();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin', false)
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
    or coalesce((auth.jwt() -> 'user_metadata' ->> 'is_admin')::boolean, false);
$$;

alter table public.chapter_audio enable row level security;

drop policy if exists "Ready chapter audio metadata is readable" on public.chapter_audio;
create policy "Ready chapter audio metadata is readable" on public.chapter_audio for select using (status = 'ready' or public.is_admin());

drop policy if exists "Admins manage chapter audio" on public.chapter_audio;
create policy "Admins manage chapter audio" on public.chapter_audio for all using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chapter-audio', 'chapter-audio', false, 524288000, array['audio/mpeg','audio/mp3'])
on conflict (id) do nothing;

-- Storage objects use: novels/{novelId}/chapters/{chapterId}/{language}/{voiceId}/{contentHash}.mp3
drop policy if exists "Authenticated users read chapter audio objects" on storage.objects;
create policy "Authenticated users read chapter audio objects" on storage.objects for select to authenticated using (bucket_id = 'chapter-audio');
drop policy if exists "Admins write chapter audio objects" on storage.objects;
create policy "Admins write chapter audio objects" on storage.objects for insert to authenticated with check (bucket_id = 'chapter-audio' and public.is_admin());
drop policy if exists "Admins update chapter audio objects" on storage.objects;
create policy "Admins update chapter audio objects" on storage.objects for update to authenticated using (bucket_id = 'chapter-audio' and public.is_admin()) with check (bucket_id = 'chapter-audio' and public.is_admin());
drop policy if exists "Admins delete chapter audio objects" on storage.objects;
create policy "Admins delete chapter audio objects" on storage.objects for delete to authenticated using (bucket_id = 'chapter-audio' and public.is_admin());
