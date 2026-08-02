-- Keep the public import contract while bounding the amount of chapter data
-- written by each INSERT statement. PostgreSQL functions run in their caller's
-- transaction, so these batches are committed by the RPC transaction together.
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

  -- Serialize imports for a novel so duplicate handling remains identical to the
  -- previous ON CONFLICT implementation.
  perform 1 from public.novels where id = target_novel_id for update;

  create temporary table if not exists pg_temp.chapter_import_candidates (
    number integer primary key,
    title text,
    content text,
    already_exists boolean not null default false
  ) on commit drop;
  truncate pg_temp.chapter_import_candidates;

  -- DISTINCT ON preserves the existing in-file duplicate rule: only the first
  -- valid occurrence of each chapter number is eligible for insertion.
  insert into pg_temp.chapter_import_candidates (number, title, content)
  select distinct on (c.number) c.number, c.title, c.content
  from rows from (
    jsonb_to_recordset(coalesce(import_chapters, '[]'::jsonb))
      as (number integer, title text, content text)
  ) with ordinality as c(number, title, content, ordinal)
  where c.number > 0
  order by c.number, c.ordinal;

  -- Read all existing chapter numbers once, then exclude them from every batch.
  update pg_temp.chapter_import_candidates candidate
  set already_exists = true
  from (
    select array_agg(chapter.number) as numbers
    from public.chapters chapter
    where chapter.novel_id = target_novel_id
  ) existing
  where candidate.number = any(coalesce(existing.numbers, '{}'::integer[]));

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

  select count(*) into total_count from public.chapters where novel_id = target_novel_id;

  return jsonb_build_object(
    'novelId', target_novel_id,
    'added', added_count,
    'duplicates', supplied_count - added_count,
    'skipped', supplied_count - added_count,
    'totalChapters', total_count,
    'elapsedTimeMs', round(extract(epoch from (clock_timestamp() - import_started_at)) * 1000, 3)
  );
end $$;

grant execute on function public.import_novel_chapters(bigint,jsonb) to authenticated;
