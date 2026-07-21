create table if not exists public.voice_variation_profiles (
  id text primary key,
  name text not null,
  base_provider text not null,
  base_model text not null,
  base_voice text not null,
  parameters jsonb not null default '{}'::jsonb,
  languages text[] not null default array['uk','ru','en'],
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.voice_variation_profiles enable row level security;
do $$ begin
  create policy "voice variation profiles are readable" on public.voice_variation_profiles for select using (true);
exception when duplicate_object then null;
end $$;
create index if not exists idx_voice_variation_profiles_provider on public.voice_variation_profiles(base_provider, base_model, base_voice);

create table if not exists public.character_voice_assignments (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null,
  profile_id text not null references public.voice_variation_profiles(id),
  profile_version integer not null,
  locked_by_admin boolean not null default false,
  evolution_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.character_voice_assignments enable row level security;
do $$ begin
  create policy "character voice assignments are readable" on public.character_voice_assignments for select using (true);
exception when duplicate_object then null;
end $$;
create index if not exists idx_character_voice_assignments_character on public.character_voice_assignments(character_id, profile_id, profile_version);

create table if not exists public.temporary_voice_states (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null,
  state text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.temporary_voice_states enable row level security;
do $$ begin
  create policy "temporary voice states are readable" on public.temporary_voice_states for select using (true);
exception when duplicate_object then null;
end $$;
create index if not exists idx_temporary_voice_states_character on public.temporary_voice_states(character_id, state);

create table if not exists public.voice_worker_status (
  id text primary key,
  status text not null,
  providers jsonb not null default '[]'::jsonb,
  checked_at timestamptz not null default now()
);
alter table public.voice_worker_status enable row level security;
do $$ begin
  create policy "voice worker status is readable" on public.voice_worker_status for select using (true);
exception when duplicate_object then null;
end $$;
