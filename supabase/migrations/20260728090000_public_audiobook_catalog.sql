-- Published creator books are public catalog records; drafts remain owner-only.
create policy "Anyone can view published books"
on public.books for select
using (status = 'Published');

create policy "Anyone can view chapters of published books"
on public.chapters for select
using (exists (select 1 from public.books where books.id = chapters.book_id and books.status = 'Published'));
