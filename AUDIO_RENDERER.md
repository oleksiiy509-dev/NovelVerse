# NovelVerse Voice Engine Phase 4 — AI Audio Rendering Pipeline

Phase 4 turns AI Director plans into cached MP3 chapter audio without tying Reader or admin UI code to any single TTS vendor.

## Architecture

Pipeline:

1. Reader/Admin requests chapter audio generation.
2. The server creates an `audio_render_jobs` queue item with chapter, language, cast snapshot, Director plan, provider, priority, retry count, and status.
3. The renderer loads Director segment settings and persistent cast slots.
4. A provider adapter renders one dialogue or narration segment at a time.
5. Segment MP3 files are cached in Supabase Storage.
6. The merger stitches segment MP3 bytes with Director pauses into `chapter.mp3` output.
7. Chapter metadata, waveform, render version, cast version, provider, bitrate, sample rate, and duration are saved in `chapter_audio`.
8. Reader uses the stored MP3 when available and falls back to Device Voice automatically.

## Provider abstraction

Providers implement the `AudioProvider` interface in `supabase/functions/generate-chapter-audio/provider.ts`:

- `id`
- `version`
- `contentType`
- `renderSegment(request)`
- optional `estimateDurationSeconds(request, audio)`

The request carries speaker, cast slot, voice profile, emotion, intensity, pace, pauses, and emphasis. This allows future adapters for OpenAI, ElevenLabs, Azure, Google, Kokoro, Piper, XTTS, F5-TTS, and CosyVoice without adding provider-specific code to Reader.

No provider secrets are exposed to frontend code. Adapters must read credentials only from Supabase Edge Function environment variables.

## Queue

`audio_render_jobs` statuses:

- `pending`
- `rendering`
- `rendered`
- `failed`
- `canceled`

Jobs include retry count and priority so a worker can pick high-priority pending jobs first. The current Edge Function can also render immediately unless `enqueueOnly` is passed.

## Segment cache and incremental rendering

Every segment cache key includes:

- normalized segment request
- chapter hash
- Director version
- cast version
- provider id/version path context
- render version

If one segment changes, only that segment receives a new input hash. Existing segment files are reused and only the final chapter MP3 is rebuilt.

## Preview rendering

Admins can pass a `preview` object to render only:

- one sentence/segment
- one dialogue segment
- one scene range

Preview jobs use the same provider abstraction and segment rendering path, but do not require rendering the entire chapter.

## Storage layout

Supabase Storage bucket: `chapter-audio`

- Final chapter MP3: `novels/{novelId}/chapters/{chapterId}/{language}/{provider}/{chapterHash}.mp3`
- Segment cache: `segments/{novelId}/{chapterId}/{provider}/{segmentInputHash}.mp3`

The database stores active final audio in `chapter_audio` and reusable segment cache records in `audio_render_segments`.

## Waveform

The renderer creates compact waveform buckets for segment and final chapter audio. Reader displays waveform bars and lets users seek by tapping a waveform point.

## Smart cache

Do not delete active `chapter_audio.storage_path` files. Obsolete segment renders can be removed only when they are not referenced by active jobs or current chapter renders. Cache cleanup should prefer age and reference checks over blanket path deletion.

## Offline playback

When a user downloads a chapter, Reader stores chapter text, voice cast, Director plan, and AI audio metadata/playback URL when available. Offline Reader attempts to play stored AI audio first and falls back to Device Voice when audio is unavailable.

## Security

- Frontend only invokes the Edge Function and reads signed/public playback URLs.
- Provider keys stay server-side in Edge Function environment variables.
- Queue mutation is restricted to admins through RLS and service-role Edge Function code.
- Reader contains no provider-specific logic or secrets.

## Known limitations

- The default provider is intentionally `unconfigured`; real adapters must be registered server-side.
- The byte-level merger is provider-independent but assumes segment outputs are MP3-compatible for concatenation. Production deployments should replace this with an ffmpeg-based safe merge worker when available.
- Browser offline audio persistence depends on available storage and URL cache behavior unless future work stores audio blobs directly in IndexedDB.
