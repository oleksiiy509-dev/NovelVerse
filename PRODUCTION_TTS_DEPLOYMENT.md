# Piper-first production TTS deployment

`generate-chapter-audio` uses the NovelVerse Piper voice worker by default. The normal workflow does **not** need custom Supabase secrets: with an omitted (`default` or `auto`) provider it checks Piper first and generates the chapter locally.

## Default deployment (no custom secrets)

Start Piper and the voice worker on the same host/network as the function runtime:

```bash
cd voice-worker
cp .env.example .env
# Set DEFAULT_PROVIDER=piper, PIPER_BIN, and PIPER_MODEL in voice-worker/.env
npm start
curl http://127.0.0.1:8787/health
```

The health response must contain a `piper` provider with `available: true`. Then deploy without adding custom secrets:

```bash
supabase login
supabase link --project-ref <project-ref>
supabase db push
supabase functions deploy generate-chapter-audio
supabase secrets list --project-ref <project-ref>
```

The built-in worker URL is `http://127.0.0.1:8787`. A remotely hosted Supabase Edge Function cannot reach a Piper process on your laptop through loopback; production must run the worker at a network-reachable address. In that topology, set `NOVELVERSE_PIPER_URL` as runtime configuration (and `NOVELVERSE_PIPER_TOKEN` only when the worker requires authentication). These are connection settings, not required TTS-provider credentials.

## Provider behavior

When `provider` is omitted or is `default`/`auto`, the function:

1. calls the Piper worker health endpoint and uses Piper when it reports `available: true`;
2. falls back to OpenAI only when Piper is unavailable and `OPENAI_API_KEY` exists;
3. otherwise returns HTTP 503 with `Piper is unavailable and no OpenAI provider is configured.`

```json
{"chapter_id":"<chapter-uuid>","language":"auto","preview":null}
```

A successful render returns HTTP 200 with `status: "ready"`, a `job_id`, and render metadata. Audio remains in the private `chapter-audio` bucket and playback uses signed URLs.

## Optional premium OpenAI provider

OpenAI is optional. To enable the automatic fallback or explicitly request `"provider":"openai"`, configure server-side secrets only:

```bash
supabase secrets set OPENAI_API_KEY=<openai-api-key>
supabase secrets set NOVELVERSE_TTS_MODEL=gpt-4o-mini-tts
supabase secrets set NOVELVERSE_TTS_DEFAULT_VOICE=alloy
supabase functions deploy generate-chapter-audio
```

Never expose the key in a frontend variable or commit it. The model defaults to `gpt-4o-mini-tts` when a key is present, so only `OPENAI_API_KEY` is essential for the premium provider.

## Verification

```bash
supabase secrets list --project-ref <project-ref>
curl http://127.0.0.1:8787/health
supabase functions logs generate-chapter-audio --project-ref <project-ref>
```

1. Confirm custom secrets are empty for Piper-only operation.
2. Confirm local Piper reports available.
3. Submit Generate Chapter without `provider` and confirm `status: "ready"` and provider `piper` in logs/render metadata.
4. Stop Piper and confirm the clear 503 error when no OpenAI key exists.
5. Optionally configure OpenAI, stop Piper, and confirm the job uses provider `openai`.
