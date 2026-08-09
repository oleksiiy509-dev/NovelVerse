-- Upgrade installations of the initial cloud-audio schema to the public v1 queue
-- vocabulary without touching object metadata or audio stored in R2.
alter table public.chapter_audio_renders
  drop constraint if exists chapter_audio_renders_status_check,
  drop constraint if exists ready_render_has_object,
  drop constraint if exists completed_render_has_object;

update public.chapter_audio_renders set status = 'completed' where status = 'ready';

alter table public.chapter_audio_renders
  add constraint chapter_audio_renders_status_check
    check (status in ('queued', 'rendering', 'uploading', 'completed', 'failed', 'cancelled', 'retry')),
  add constraint completed_render_has_object
    check (status <> 'completed' or object_key is not null);

drop policy if exists "Published chapter audio metadata is readable" on public.chapter_audio_renders;
create policy "Published chapter audio metadata is readable"
  on public.chapter_audio_renders for select to authenticated
  using (status = 'completed');

drop index if exists public.chapter_audio_renders_queue_idx;
create index chapter_audio_renders_queue_idx
  on public.chapter_audio_renders(status, updated_at)
  where status in ('queued', 'rendering', 'uploading', 'retry');
