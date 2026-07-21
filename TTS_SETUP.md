# TTS Setup

1. Create an OpenAI API key.
2. Store it as a Supabase Edge Function secret, never in Vercel/Vite: `supabase secrets set OPENAI_API_KEY=... NOVELVERSE_TTS_PROVIDER=openai NOVELVERSE_TTS_MODEL=gpt-4o-mini-tts NOVELVERSE_TTS_DEFAULT_VOICE=alloy`.
3. Configure safeguards: `NOVELVERSE_TTS_MAX_CHARS_PER_JOB`, `NOVELVERSE_TTS_MAX_SEGMENTS_PER_JOB`, `NOVELVERSE_TTS_DAILY_USER_LIMIT`, and `NOVELVERSE_TTS_PREVIEW_MAX_CHARS`.
4. Deploy: `supabase functions deploy generate-chapter-audio`.
5. For production chapter MP3s, configure an ffmpeg-compatible merge worker or intentionally set `NOVELVERSE_AUDIO_MERGE_STRATEGY=byte-concat` only for compatible mock/test output.

Troubleshooting: missing key returns a clear `OPENAI_API_KEY is required` error; unsupported providers return `unsupported_provider`; oversized previews/jobs return limit details.
