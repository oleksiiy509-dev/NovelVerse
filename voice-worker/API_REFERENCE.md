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

## Online audiobook API

### GET /audio/:chapterId

Returns ready audio metadata, joins an existing render, or starts a render by loading
the chapter from `CHAPTER_SOURCE_URL/:chapterId`. A running render returns HTTP 202;
every concurrent request for that chapter receives the same job id. The source JSON
may provide `content`/`text`, or precomputed Dynamic Narrator `segments`.

### GET /audio/:chapterId/stream

Streams the stored MP3 (or WAV fallback) with HTTP byte-range support. This endpoint
returns 425 plus `Retry-After: 2` while the single chapter render is still running.
Clients should poll `GET /audio/:chapterId`, then open the stable stream URL as soon
as its status becomes `finished`.

### POST /chapter-jobs

Queues a trusted chapter payload. Queue state and segment checkpoints are durable,
so an interrupted process resumes unfinished work instead of starting a duplicate.
Completed WAV and MP3 files are copied to `AUDIO_STORAGE_DIR`; the registry contains
only paths, status, duration, size, hashes, and job/chapter metadata—not audio blobs.
