-- Final, concurrency-safe import and merge system.
-- Every direct dependency of a novel is owned by that novel and is removed by
-- PostgreSQL in the same transaction as its parent.
do $$
declare constraint_row record;
begin
  for constraint_row in
    select conrelid::regclass as child_table, conname,
           pg_get_constraintdef(oid) as definition
    from pg_constraint
    where contype = 'f' and confrelid = 'public.novels'::regclass
      and confdeltype <> 'c'
  loop
    execute format('alter table %s drop constraint %I', constraint_row.child_table, constraint_row.conname);
    execute format('alter table %s add constraint %I %s on delete cascade',
      constraint_row.child_table, constraint_row.conname,
      regexp_replace(constraint_row.definition, ' ON DELETE (NO ACTION|RESTRICT|SET NULL|SET DEFAULT|CASCADE)', '', 'i'));
  end loop;
end $$;

create unique index if not exists chapters_novel_number_unique
  on public.chapters (novel_id, number) where number is not null;

create or replace function public.import_novel_chapters(
  import_title text,
  import_author text,
  import_description text default '',
  import_language text default '',
  import_chapters jsonb default '[]'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  target_id bigint;
  was_created boolean := false;
  added_count integer := 0;
  supplied_count integer := coalesce(jsonb_array_length(import_chapters), 0);
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if nullif(btrim(import_title), '') is null then raise exception 'A title is required.'; end if;
  if nullif(btrim(import_author), '') is null then raise exception 'An author is required.'; end if;

  -- Serialize imports for this normalized identity, preventing two simultaneous
  -- uploads from both creating a novel.
  perform pg_advisory_xact_lock(hashtextextended(lower(regexp_replace(btrim(import_title), '\s+', ' ', 'g')) || E'\n' || lower(regexp_replace(btrim(import_author), '\s+', ' ', 'g')), 0));

  select id into target_id from public.novels
   where lower(regexp_replace(btrim(title), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(import_title), '\s+', ' ', 'g'))
     and lower(regexp_replace(btrim(coalesce(author, '')), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(import_author), '\s+', ' ', 'g'))
   order by id limit 1 for update;

  if target_id is null then
    insert into public.novels (title, author, description, language, status)
    values (btrim(import_title), btrim(import_author), coalesce(import_description, ''), coalesce(import_language, ''), 'Draft')
    returning id into target_id;
    was_created := true;
  end if;

  with candidates as (
    select distinct on (number) number, title, content
    from jsonb_to_recordset(coalesce(import_chapters, '[]'::jsonb)) as c(number integer, title text, content text)
    where number > 0
    order by number
  ), inserted as (
    insert into public.chapters (novel_id, number, position, title, content, status, audio_status, audio_url)
    select target_id, number, number, coalesce(nullif(btrim(title), ''), 'Chapter ' || number), coalesce(content, ''), 'Draft', 'Missing', null
    from candidates
    on conflict (novel_id, number) where number is not null do nothing
    returning 1
  ) select count(*) into added_count from inserted;

  return jsonb_build_object('novelId', target_id, 'created', was_created,
    'added', added_count, 'skipped', supplied_count - added_count);
end $$;

create or replace function public.merge_novels(target_novel_id bigint, source_novel_id bigint)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare moved_count integer := 0; skipped_count integer := 0;
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if target_novel_id = source_novel_id then raise exception 'Choose two different novels.'; end if;
  if not exists(select 1 from public.novels where id = target_novel_id) or
     not exists(select 1 from public.novels where id = source_novel_id) then raise exception 'Novel not found.'; end if;

  perform 1 from public.novels where id in (target_novel_id, source_novel_id) order by id for update;
  select count(*) into skipped_count from public.chapters s
   where s.novel_id = source_novel_id and exists (
     select 1 from public.chapters t where t.novel_id = target_novel_id and t.number = s.number);

  -- Duplicate-number chapters are intentionally discarded. Missing chapters
  -- retain their IDs; novel-level dependencies of B are removed by cascade.
  delete from public.chapters s where s.novel_id = source_novel_id and exists (
    select 1 from public.chapters t where t.novel_id = target_novel_id and t.number = s.number);
  update public.chapters set novel_id = target_novel_id where novel_id = source_novel_id;
  get diagnostics moved_count = row_count;
  delete from public.novels where id = source_novel_id;

  return jsonb_build_object('targetNovelId', target_novel_id, 'moved', moved_count, 'skipped', skipped_count);
end $$;

grant execute on function public.import_novel_chapters(text,text,text,text,jsonb) to authenticated;
grant execute on function public.merge_novels(bigint,bigint) to authenticated;
