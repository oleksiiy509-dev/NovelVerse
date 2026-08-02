-- Chapter numbers are unique within a novel, not across the whole catalog.
-- Keep both parts of that identity visible in the duplicate predicate so an
-- identically numbered chapter belonging to another novel cannot be skipped.
create or replace function public.import_novel_chapters(
  target_novel_id bigint,
  import_chapters jsonb default '[]'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  import_started_at timestamptz := clock_timestamp();
  supplied_count integer := coalesce(jsonb_array_length(import_chapters), 0);
  added_count integer := 0;
  batch_added integer := 0;
  total_count integer := 0;
  batch_numbers integer[];
  last_number integer := 0;
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if not exists (select 1 from public.novels where id = target_novel_id) then raise exception 'Novel not found.'; end if;

  perform 1 from public.novels where id = target_novel_id for update;

  create temporary table if not exists pg_temp.chapter_import_candidates (
    number integer primary key,
    title text,
    content text,
    already_exists boolean not null default false
  ) on commit drop;
  truncate pg_temp.chapter_import_candidates;

  insert into pg_temp.chapter_import_candidates (number, title, content)
  select distinct on ((candidate.chapter ->> 'number')::integer)
    (candidate.chapter ->> 'number')::integer,
    candidate.chapter ->> 'title',
    candidate.chapter ->> 'content'
  from jsonb_array_elements(coalesce(import_chapters, '[]'::jsonb))
    with ordinality as candidate(chapter, ordinal)
  where (candidate.chapter ->> 'number')::integer > 0
  order by (candidate.chapter ->> 'number')::integer, candidate.ordinal;

  update pg_temp.chapter_import_candidates candidate
  set already_exists = exists (
    select 1
    from public.chapters existing
    where existing.novel_id = target_novel_id
      and existing.number = candidate.number
  );

  loop
    select array_agg(number order by number), max(number)
      into batch_numbers, last_number
    from (
      select number
      from pg_temp.chapter_import_candidates
      where not already_exists and number > last_number
      order by number
      limit 200
    ) batch;

    exit when batch_numbers is null;

    insert into public.chapters
      (novel_id, number, position, title, content, status, audio_status, audio_url)
    select target_novel_id, candidate.number, candidate.number,
      coalesce(nullif(btrim(candidate.title), ''), 'Chapter ' || candidate.number),
      coalesce(candidate.content, ''), 'Draft', 'Missing', null
    from pg_temp.chapter_import_candidates candidate
    where candidate.number = any(batch_numbers)
    order by candidate.number
    on conflict (novel_id, number) where number is not null do nothing;

    get diagnostics batch_added = row_count;
    added_count := added_count + batch_added;
  end loop;

  select count(*) into total_count
  from public.chapters chapter
  where chapter.novel_id = target_novel_id;

  return jsonb_build_object(
    'novelId', target_novel_id,
    'added', added_count,
    'duplicates', supplied_count - added_count,
    'skipped', supplied_count - added_count,
    'totalChapters', total_count,
    'elapsedTimeMs', round(extract(epoch from (clock_timestamp() - import_started_at)) * 1000, 3)
  );
end $$;
