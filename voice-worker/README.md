# NovelVerse Local Voice Worker

Production-ready local TTS worker with Express endpoints for health checks, voice discovery, previews, synthesis, and voice transformation experiments.

## Expressive local narration

Narration automatically detects **Neutral, Happy, Sad, Angry, Fear,** and **Surprise** directly from prose; authors do not add emotion tags. A single `NARRATOR_VOICE` is retained while delivery changes. Synthesis stays on the machine and tries Fish Speech first, then Kokoro, then Piper. Only loopback Fish Speech and Kokoro URLs are accepted.

Run Fish Speech on `127.0.0.1:8080` (preferred), Kokoro on `127.0.0.1:8880`, and/or configure Piper as below. Override their local endpoints with `FISH_SPEECH_URL` and `KOKORO_URL`. Set either engine's `*_ENABLED=false` when it is not installed.

## Quick start

```bash
cd voice-worker
npm install
cp .env.example .env
npm start
curl http://127.0.0.1:8787/health
```

Set `TOKEN` in `.env` to require `Authorization: Bearer <TOKEN>` for all endpoints except `/health`.


## Piper on Windows

For a minimal Windows setup, run the bundled Piper installer from `voice-worker`:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\setup-piper.ps1
```

The script creates `piper/` and `piper/voices/`, downloads the Windows Piper binary, downloads the Ukrainian `uk_UA-lada-medium` voice, updates `.env`, and writes `piper/verification.wav` after a successful synthesis check. See [PIPER_SETUP.md](./PIPER_SETUP.md) for details.

## Provider status

`GET /providers` returns public provider availability and configuration status. `GET /voices` returns the same provider metadata but still requires the bearer token when `TOKEN` is set.
