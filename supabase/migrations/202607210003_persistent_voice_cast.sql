create table if not exists public.novel_voice_cast (
  id uuid primary key default gen_random_uuid(),
  novel_id bigint not null references public.novels(id) on delete cascade,
  character_id uuid not null references public.voice_characters(id) on delete cascade,
  cast_slot text not null,
  voice_profile text not null default 'unknown_neutral',
  provider_voice_id text null,
  provider_voice_mappings jsonb not null default '{}'::jsonb,
  cloned_voice_id text null,
  language text null,
  gender text not null default 'unknown' check (gender in ('male','female','neutral','unknown')),
  age_group text not null default 'unknown' check (age_group in ('child','teenager','young','adult','elderly','unknown')),
  character_role text not null default 'unknown' check (character_role in ('protagonist','supporting','antagonist','narrator','system','creature','unknown')),
  pitch_offset numeric not null default 0 check (pitch_offset >= -1 and pitch_offset <= 1),
  rate_offset numeric not null default 0 check (rate_offset >= -1 and rate_offset <= 1),
  energy numeric not null default 0.5 check (energy >= 0 and energy <= 1),
  roughness numeric not null default 0 check (roughness >= 0 and roughness <= 1),
  brightness numeric not null default 0.5 check (brightness >= 0 and brightness <= 1),
  stability numeric not null default 0.5 check (stability >= 0 and stability <= 1),
  style_strength numeric not null default 0.5 check (style_strength >= 0 and style_strength <= 1),
  manually_locked boolean not null default false,
  assignment_source text not null default 'automatic' check (assignment_source in ('automatic','manual','imported','cloned','provider')),
  confidence numeric null check (confidence is null or (confidence >= 0 and confidence <= 1)),
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null references auth.users(id) on delete set null,
  unique(novel_id, character_id),
  unique(novel_id, cast_slot)
);

create table if not exists public.voice_cast_audit (
  id uuid primary key default gen_random_uuid(),
  novel_id bigint not null references public.novels(id) on delete cascade,
  character_id uuid null references public.voice_characters(id) on delete set null,
  action text not null check (action in ('assigned','reassigned','locked','unlocked','merged','alias_added','alias_removed','parameters_updated')),
  previous_value jsonb null,
  new_value jsonb null,
  changed_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists novel_voice_cast_novel_idx on public.novel_voice_cast(novel_id, cast_slot);
create index if not exists novel_voice_cast_character_idx on public.novel_voice_cast(character_id);
create index if not exists novel_voice_cast_locked_idx on public.novel_voice_cast(novel_id, manually_locked) where manually_locked = true;
create index if not exists novel_voice_cast_profile_idx on public.novel_voice_cast(novel_id, voice_profile);
create index if not exists voice_cast_audit_novel_idx on public.voice_cast_audit(novel_id, created_at desc);
create index if not exists voice_cast_audit_character_idx on public.voice_cast_audit(character_id, created_at desc);

drop trigger if exists set_novel_voice_cast_updated_at on public.novel_voice_cast;
create trigger set_novel_voice_cast_updated_at before update on public.novel_voice_cast for each row execute function public.set_voice_engine_updated_at();

alter table public.novel_voice_cast enable row level security;
alter table public.voice_cast_audit enable row level security;

drop policy if exists "Voice cast metadata is readable" on public.novel_voice_cast;
create policy "Voice cast metadata is readable" on public.novel_voice_cast for select using (true);
drop policy if exists "Admins manage voice cast" on public.novel_voice_cast;
create policy "Admins manage voice cast" on public.novel_voice_cast for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins read voice cast audit" on public.voice_cast_audit;
create policy "Admins read voice cast audit" on public.voice_cast_audit for select using (public.is_admin());
drop policy if exists "Admins write voice cast audit" on public.voice_cast_audit;
create policy "Admins write voice cast audit" on public.voice_cast_audit for insert with check (public.is_admin());
