# NovelVerse Local Voice Worker

Production-ready local TTS worker with Express endpoints for health checks, voice discovery, previews, synthesis, and voice transformation experiments.

## NovelVerse Narrator 2.0

The default `narrator` provider is a fully local cascade: **Fish Speech → Kokoro → Piper**. Point `FISH_SPEECH_URL` and `KOKORO_URL` at loopback endpoints; non-loopback URLs are rejected so narration cannot silently leave the machine. Piper remains the executable fallback. `NARRATOR_VOICE` is applied to every title, narration, and dialogue request for a consistent narrator.

Narrator 2.0 normalizes punctuation, marks dialogue and sentence emphasis, plans sentence and paragraph breathing pauses, and renders a supplied chapter title as a separate synthesis segment before the body. Engine failures advance through the cascade without changing the Audio Production UI.

```dotenv
DEFAULT_PROVIDER=narrator
NARRATOR_VOICE=novelverse-narrator
FISH_SPEECH_URL=http://127.0.0.1:8080/v1/tts
KOKORO_URL=http://127.0.0.1:8880/v1/audio/speech
PIPER_BIN=./piper/piper.exe
PIPER_MODEL=./piper/voices/en_US-lessac-medium.onnx
```

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
