-- Published creator books are public catalog records; drafts remain owner-only.
create policy "Anyone can view published novels"
on public.novels for select
using (status = 'Published');

create policy "Anyone can view chapters of published books"
on public.chapters for select
using (exists (select 1 from public.novels where novels.id = chapters.novel_id and novels.status = 'Published'));
