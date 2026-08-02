-- A novel owns its chapters. Keep that relationship intact while allowing the
-- delete workflow to remove the complete aggregate in one transaction.
alter table public.chapters
  drop constraint if exists chapters_novel_id_fkey;

alter table public.chapters
  add constraint chapters_novel_id_fkey
  foreign key (novel_id) references public.novels(id) on delete cascade;
