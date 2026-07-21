# NovelVerse AI Audio Engine v2 Foundation

## Architecture
NovelVerse keeps browser SpeechSynthesis as **Device Voice** and adds a provider-independent **AI Audio** path. React only reads `chapter_audio` metadata and Storage playback URLs; it never calls a paid TTS provider or receives private provider secrets.

## Database schema
Migration: `supabase/migrations/202607210001_ai_audio_engine.sql` creates `public.chapter_audio` with chapter, novel, language, voice, provider, status, storage path, duration, file size, content hash, error and audit fields. Status values are `pending`, `processing`, `ready`, and `failed`. A unique constraint on `(chapter_id, language, voice_id, content_hash)` prevents duplicate generation for unchanged chapter text.

## Storage bucket
The migration prepares a private Supabase Storage bucket named `chapter-audio`. Object paths should be:

```text
novels/{novelId}/chapters/{chapterId}/{language}/{voiceId}/{contentHash}.mp3
```

Ready audio can be played through signed URLs. Generation and deletion are restricted to admins by RLS/storage policies. Existing audio is not automatically deleted when metadata is removed.

## RLS requirements
`chapter_audio` enables RLS. Ready metadata is readable publicly; admin users can manage all records. Admin checks use trusted Supabase Auth JWT metadata. Keep existing table policies unchanged.

## Server endpoint
`supabase/functions/generate-chapter-audio` is the secure generation endpoint. It requires an authenticated user, verifies admin authorization server-side, loads chapter content with the service role, strips markup, rejects empty chapters, hashes deterministic plain text, reuses matching ready audio, writes a pending/failed record, and returns safe errors.

Because no provider is configured, the placeholder returns `provider_not_configured`; the endpoint marks the record `failed` instead of leaving it `processing`.

## Provider abstraction
`supabase/functions/generate-chapter-audio/provider.ts` exposes:

```ts
generateSpeech({ text, language, voice, format })
```

Add OpenAI, ElevenLabs, Azure, or Google later by replacing the placeholder implementation while keeping the Reader and metadata contract intact.

## Future environment variables
Set these only as server-side Supabase Edge Function secrets, not in React and not with `VITE_`:

- `TTS_PROVIDER`
- `TTS_API_KEY`
- `TTS_DEFAULT_VOICE`

Supabase functions also require the platform-provided `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

## Generation flow
Admin clicks Generate/Regenerate, the Edge Function validates admin rights, cleans chapter text, computes SHA-256 content hash, checks `chapter_audio`, calls the provider, uploads MP3 when available, then updates metadata to `ready` or `failed`.

## Reader behavior
The Reader remembers `AI Audio` or `Device Voice` locally. AI Audio plays ready MP3 files with pause/resume, seeking, speed changes, time display, chapter navigation, auto-next, and per-chapter position storage. If AI Audio is unavailable, offline, or fails, Device Voice remains available and is not described as neural narration.

## Caching and offline
AI audio downloads are explicit; the UI displays file size and lets users remove the local marker. Large MP3 files are not automatically downloaded. Offline text downloads continue separately. When downloaded AI Audio is unavailable, fall back to Device Voice if SpeechSynthesis works in the browser/WebView.

## Telegram WebView limitations
Telegram WebViews may block autoplay, may expose limited SpeechSynthesis voices, may vary Media Session support, and may restrict durable audio caching. Users should tap play manually after navigation if autoplay is blocked.

## Security rules
Never commit real TTS keys. Never expose provider secrets via `VITE_`. React uses Supabase anon access only for metadata and signed playback URL requests. Admin generation uses server-side authorization and the service role only inside the Edge Function.
