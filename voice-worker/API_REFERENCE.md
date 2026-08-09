# API Reference

Authentication: all endpoints except `GET /health` require `Authorization: Bearer <TOKEN>` when `TOKEN` is configured.

## GET /health
Returns worker version, provider availability, available voices, uptime, and memory usage.

## GET /voices
Returns configured providers and voice metadata.

## GET /status
Returns basic worker status and defaults.

## POST /preview
Body: `{ "text": "One or more sentences", "voice": "mock-narrator", "provider": "mock", "format": "wav" }`.
Generates one-sentence audio. Response body is audio; `x-novelverse-metadata` contains base64 JSON metadata.

## POST /synthesize
Body matches `/preview`, but supports longer text up to 5000 characters.

## POST /transform
Body supports `text` or `audio`, plus `provider`, `voice`, `language`, `format`, and `options`.

Supported output formats: `wav`, `mp3`, `ogg`.

## Cloud audiobook API

All chapter routes are safe for concurrent callers. Chapter identity is reserved
before queue insertion, so simultaneous requests join one job. Status values are
`queued`, `rendering`, `uploading`, `completed`, `failed`, `cancelled`, and `retry`.

### POST /audio/render/:chapterId

Queues a render using the existing Dynamic Narrator and configured provider chain
(Fish Speech first). The body accepts `bookId`, `bookTitle`, `chapterNumber`,
`chapterTitle`, `language`, `provider`, and narrator `segments`. Returns HTTP 202
for a new or joined job and HTTP 200 for cached audio. `joined` identifies whether
the request reused the chapter's existing job.

### GET /audio/status/:chapterId

Returns job id, canonical status, segment progress, attempts, timing, and the audio
URL when completed. Polling this route never creates a render.

### GET /audio/stream/:chapterId

During rendering, returns a chunked WAV response with `X-Audio-Live: true`. The
stream receives each completed narration segment immediately and stays attached
until the shared job ends, allowing many listeners to consume the same render.
Range requests during a live render return HTTP 425 and `Retry-After`; completed
R2 objects and local fallback files support standard byte ranges and immutable
caching.

### DELETE /audio/cache/:chapterId

Deletes completed, failed, or cancelled audio, checkpoints, R2 object, and metadata.
An active render returns HTTP 409 to preserve the one-render invariant.

### POST /audio/retry/:chapterId

Requeues a failed or cancelled job under the same job id. Segment checkpoint files
are reused, so interrupted rendering resumes without synthesizing finished segments.

### Compatibility routes

The earlier `POST /audio/:chapterId/render`, `GET /audio/:chapterId/status`, and
`GET /audio/:chapterId/stream` forms remain available. `GET /audio/:chapterId`
provides the combined discovery workflow described below.

### GET /audio/:chapterId

Returns ready audio metadata, joins an existing render, or starts a render by loading
the chapter from `CHAPTER_SOURCE_URL/:chapterId`. A running render returns HTTP 202;
every concurrent request for that chapter receives the same job id. The source JSON
may provide `content`/`text`, or precomputed Dynamic Narrator `segments`.

### POST /chapter-jobs

Queues a trusted chapter payload. Queue state and segment checkpoints are durable,
so an interrupted process resumes unfinished work instead of starting a duplicate.
Completed WAV and MP3 files are copied to `AUDIO_STORAGE_DIR`; the registry contains
only paths, status, duration, size, hashes, and job/chapter metadata—not audio blobs.

## Persistence and deployment

In cloud mode, rendered bytes are uploaded only to Cloudflare R2 and Supabase stores
coordination/object metadata in `chapter_audio_renders`. Configure all `R2_*`,
`SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` variables. Without cloud credentials,
the identical API uses `AUDIO_STORAGE_DIR`, preserving local development. Queue and
provider boundaries are process-independent interfaces so the worker can move to a
GPU VPS without changing Telegram or web clients.
