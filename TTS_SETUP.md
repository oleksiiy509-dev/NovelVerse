# Piper TTS production setup

`generate-chapter-audio` uses the free Piper provider by default. The fallback
`http://127.0.0.1:8787` is only for local development; in a hosted Supabase Edge
Function it refers to the function container, not a worker on a developer machine.

Deploy `voice-worker` as a separate, persistent container using
`voice-worker/Dockerfile` (or `voice-worker/docker-compose.example.yml`). Provide a
Linux Piper executable and model to that container, then configure:

```dotenv
DEFAULT_PROVIDER=piper
PIPER_BIN=/opt/piper/piper
PIPER_MODEL=/opt/piper/voices/your-voice.onnx
PIPER_VOICE=your-voice
TOKEN=a-long-random-secret
```

Expose the worker through HTTPS and confirm that `GET /health` reports the `piper`
provider with `available: true`. Do not deploy the bundled Windows `piper.exe` in
the Linux container; mount or install a Linux Piper distribution and model.

Configure and deploy the Edge Function:

```bash
supabase secrets set \
  NOVELVERSE_TTS_PROVIDER=piper \
  NOVELVERSE_PIPER_URL=https://voice-worker.example.com \
  NOVELVERSE_PIPER_TOKEN=a-long-random-secret
supabase functions deploy generate-chapter-audio
```

`NOVELVERSE_PIPER_URL` must be the network-reachable HTTPS **origin** of the existing
Piper Worker, with no `/health` or `/synthesize` suffix. The token must match the
worker's `TOKEN`. No OpenAI configuration is required for the Piper pipeline.
