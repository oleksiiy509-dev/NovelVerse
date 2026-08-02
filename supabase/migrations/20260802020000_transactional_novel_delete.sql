-- A novel is an aggregate root: every row owned by a novel or one of its
-- chapters must disappear with it. A migration is already transactional, and
-- the explicit block also documents/guarantees that no partially-updated FK
-- set can be committed.
begin;

-- Upgrade every current public foreign key to novels or chapters rather than
-- maintaining a fragile table allow-list. This includes chapters, comments,
-- bookmarks, chapter_audio, chapter_voice_segments, chapter_director_plans,
-- audio_render_jobs, audio_render_segments, and tables added by extensions.
do $cascade$
declare
  fk record;
  definition text;
begin
  for fk in
    select con.oid, con.conname, con.conrelid::regclass as child_table
      from pg_constraint con
     where con.contype = 'f'
       and con.confrelid in ('public.novels'::regclass, 'public.chapters'::regclass)
       and con.confdeltype <> 'c'
  loop
    definition := pg_get_constraintdef(fk.oid);
    definition := regexp_replace(
      definition,
      ' ON DELETE (NO ACTION|RESTRICT|CASCADE|SET NULL|SET DEFAULT)',
      '',
      'i'
    );
    definition := regexp_replace(
      definition,
      '( ON UPDATE| DEFERRABLE| NOT DEFERRABLE| NOT VALID)',
      ' ON DELETE CASCADE\1',
      'i'
    );
    if definition !~* ' ON DELETE CASCADE' then
      definition := definition || ' ON DELETE CASCADE';
    end if;

    execute format('alter table %s drop constraint %I', fk.child_table, fk.conname);
    execute format('alter table %s add constraint %I %s', fk.child_table, fk.conname, definition);
  end loop;
end
$cascade$;

-- One RPC call is one PostgreSQL transaction. Cascades remove all direct and
-- transitive dependants; any failure rolls the entire deletion back.
create or replace function public.delete_novels(novel_ids bigint[])
returns bigint
language plpgsql
security invoker
set search_path = public
as $function$
declare
  deleted_count bigint;
begin
  if novel_ids is null or cardinality(novel_ids) = 0 then
    return 0;
  end if;

  delete from public.novels
   where id = any(novel_ids);
  get diagnostics deleted_count = row_count;
  return deleted_count;
end
$function$;

revoke all on function public.delete_novels(bigint[]) from public;
grant execute on function public.delete_novels(bigint[]) to authenticated;

commit;
