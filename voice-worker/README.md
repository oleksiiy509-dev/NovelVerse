# NovelVerse Local Voice Worker

Production-ready local TTS worker with Express endpoints for health checks, voice discovery, previews, synthesis, and voice transformation experiments.

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
