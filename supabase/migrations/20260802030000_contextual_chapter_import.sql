-- Import chapters into an explicitly opened novel. This workflow never creates
-- or looks up a novel and remains concurrency-safe through the unique index.
create or replace function public.import_chapters_into_novel(
  target_novel_id bigint,
  import_chapters jsonb default '[]'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  added_count integer := 0;
  supplied_count integer := coalesce(jsonb_array_length(import_chapters), 0);
  total_count integer := 0;
begin
  if not public.is_admin() then raise exception 'Administrator access required.'; end if;
  if not exists (select 1 from public.novels where id = target_novel_id) then raise exception 'Novel not found.'; end if;

  perform 1 from public.novels where id = target_novel_id for update;
  with candidates as (
    select distinct on (number) number, title, content
    from jsonb_to_recordset(coalesce(import_chapters, '[]'::jsonb)) as c(number integer, title text, content text)
    where number > 0
    order by number
  ), inserted as (
    insert into public.chapters (novel_id, number, position, title, content, status, audio_status, audio_url)
    select target_novel_id, number, number,
      coalesce(nullif(btrim(title), ''), 'Chapter ' || number), coalesce(content, ''), 'Draft', 'Missing', null
    from candidates
    order by number
    on conflict (novel_id, number) where number is not null do nothing
    returning 1
  ) select count(*) into added_count from inserted;

  select count(*) into total_count from public.chapters where novel_id = target_novel_id;
  return jsonb_build_object('novelId', target_novel_id, 'added', added_count,
    'skipped', supplied_count - added_count, 'totalChapters', total_count);
end $$;

grant execute on function public.import_chapters_into_novel(bigint,jsonb) to authenticated;
