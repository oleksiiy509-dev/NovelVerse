create table if not exists public.voice_characters (
  id uuid primary key default gen_random_uuid(), novel_id bigint not null references public.novels(id) on delete cascade,
  canonical_name text not null, display_name text not null, aliases text[] not null default '{}',
  gender text not null default 'unknown' check (gender in ('male','female','neutral','unknown')),
  age_group text not null default 'unknown' check (age_group in ('child','teenager','young','adult','elderly','unknown')),
  character_role text not null default 'unknown' check (character_role in ('protagonist','supporting','antagonist','narrator','system','creature','unknown')),
  voice_profile text not null default 'unknown_neutral', default_emotion text not null default 'neutral', description text,
  confidence numeric not null default 0.5 check (confidence >= 0 and confidence <= 1), manually_verified boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(novel_id, canonical_name)
);
create table if not exists public.chapter_voice_segments (
  id uuid primary key default gen_random_uuid(), chapter_id bigint not null references public.chapters(id) on delete cascade, novel_id bigint not null references public.novels(id) on delete cascade,
  segment_index integer not null, segment_type text not null check (segment_type in ('narration','dialogue','thought','system','sound_effect')),
  speaker_id uuid null references public.voice_characters(id) on delete set null, speaker_name text not null default 'Невідомий', voice_profile text not null default 'unknown_neutral',
  emotion text not null default 'neutral' check (emotion in ('neutral','calm','happy','sad','angry','afraid','surprised','determined','sarcastic','mysterious','tired','excited')),
  intensity numeric not null default 0 check (intensity >= 0 and intensity <= 1), text text not null,
  source_start integer null, source_end integer null, confidence numeric not null default 0.5 check (confidence >= 0 and confidence <= 1),
  manually_edited boolean not null default false, analysis_version text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(chapter_id, segment_index)
);
create index if not exists voice_characters_novel_idx on public.voice_characters(novel_id, display_name);
create index if not exists voice_characters_aliases_idx on public.voice_characters using gin(aliases);
create index if not exists chapter_voice_segments_chapter_idx on public.chapter_voice_segments(chapter_id, segment_index);
create index if not exists chapter_voice_segments_novel_speaker_idx on public.chapter_voice_segments(novel_id, speaker_id);
create index if not exists chapter_voice_segments_unresolved_idx on public.chapter_voice_segments(chapter_id) where segment_type = 'dialogue' and speaker_id is null;
create or replace function public.set_voice_engine_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists set_voice_characters_updated_at on public.voice_characters;
create trigger set_voice_characters_updated_at before update on public.voice_characters for each row execute function public.set_voice_engine_updated_at();
drop trigger if exists set_chapter_voice_segments_updated_at on public.chapter_voice_segments;
create trigger set_chapter_voice_segments_updated_at before update on public.chapter_voice_segments for each row execute function public.set_voice_engine_updated_at();
alter table public.voice_characters enable row level security;
alter table public.chapter_voice_segments enable row level security;
drop policy if exists "Voice characters are readable" on public.voice_characters;
create policy "Voice characters are readable" on public.voice_characters for select using (true);
drop policy if exists "Admins manage voice characters" on public.voice_characters;
create policy "Admins manage voice characters" on public.voice_characters for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Completed voice segment metadata is readable" on public.chapter_voice_segments;
create policy "Completed voice segment metadata is readable" on public.chapter_voice_segments for select using (text <> '' or public.is_admin());
drop policy if exists "Admins manage voice segments" on public.chapter_voice_segments;
create policy "Admins manage voice segments" on public.chapter_voice_segments for all using (public.is_admin()) with check (public.is_admin());
