# Production TTS Deployment

Deploys the server-side `generate-chapter-audio` Supabase Edge Function for NovelVerse Voice Engine Phase 7. Never place real provider secrets in frontend `.env` files or Git.

## Commands

```bash
supabase login
supabase link --project-ref <project-ref>
supabase secrets set OPENAI_API_KEY=<openai-api-key>
supabase secrets set NOVELVERSE_TTS_PROVIDER=openai
supabase secrets set NOVELVERSE_TTS_MODEL=<tts-model>
supabase secrets set NOVELVERSE_TTS_DEFAULT_VOICE=alloy
supabase secrets set NOVELVERSE_TTS_MAX_CHARS_PER_JOB=120000
supabase secrets set NOVELVERSE_TTS_MAX_SEGMENTS_PER_JOB=600
supabase secrets set NOVELVERSE_TTS_PREVIEW_MAX_CHARS=250
supabase db push
supabase functions deploy generate-chapter-audio
```

Use placeholders only in documentation. Rotate a compromised key in the OpenAI dashboard, then run `supabase secrets set OPENAI_API_KEY=<new-openai-api-key>` and redeploy the function.

## Deployment checks

1. Open the Admin Dashboard TTS Test panel.
2. Run health diagnostics as an admin.
3. Confirm the storage bucket reports private and available.
4. Generate a preview under 250 characters.
5. Confirm playback uses a signed URL and no `OPENAI_API_KEY` or `VITE_OPENAI` exists in frontend configuration.
