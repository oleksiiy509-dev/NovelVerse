alter table public.chapter_audio_renders
  add column if not exists checksum_sha256 text;

alter table public.chapter_audio_renders
  add constraint chapter_audio_checksum_format
  check (checksum_sha256 is null or checksum_sha256 ~ '^[0-9a-f]{64}$');

comment on column public.chapter_audio_renders.checksum_sha256 is
  'SHA-256 digest used to verify R2 uploads and complete downloads.';
