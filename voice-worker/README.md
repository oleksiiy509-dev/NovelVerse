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

## Fish Speech on Windows

Fish Speech is **not embedded in the Node worker**. It is a separate, GPU-oriented
Python service and must be downloaded once, then kept running on port 8080. The
provided PowerShell scripts install it outside this repository in
`%LOCALAPPDATA%\NovelVerse\fish-speech`, so model/source files are not accidentally
committed.

Prerequisites: Windows 10/11, Git, [uv](https://docs.astral.sh/uv/), and a supported
NVIDIA driver. From PowerShell at the repository root:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\voice-worker\setup-fish-speech.ps1
```

The setup clones the upstream `fishaudio/fish-speech` repository, creates its
Python 3.12 environment from the upstream lock file, and downloads the default
`fishaudio/fish-speech-1.5` checkpoint. Fish Speech is downloaded separately
rather than copied into NovelVerse or built into the voice-worker container.

For every development session, use two PowerShell windows:

```powershell
# Window 1 (long-running Fish Speech API)
.\voice-worker\start-fish-speech.ps1

# Window 2 (long-running NovelVerse worker)
Set-Location .\voice-worker
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm install
npm start
```

Verify both processes from a third window:

```powershell
try { Invoke-WebRequest http://127.0.0.1:8080/v1/tts -UseBasicParsing } catch { $_.Exception.Response.StatusCode.value__ -eq 405 }
(Invoke-RestMethod http://127.0.0.1:8787/health).providers |
  Where-Object id -eq 'fish-speech'
```

Fish Speech does not expose `/health`. The worker probes `/v1/tts` with GET and
recognizes the expected HTTP 405 from that POST-only route as ready; HTTP 404 is
not considered healthy. `FISH_SPEECH_REFERENCE_ID` should remain empty for
ordinary synthesis. Set it only to a reference id already installed in Fish
Speech. See [FISH_SPEECH_SETUP.md](./FISH_SPEECH_SETUP.md) for Docker and
troubleshooting notes.


## Piper on Windows

For a minimal Windows setup, run the bundled Piper installer from `voice-worker`:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\setup-piper.ps1
```

The script creates `piper/` and `piper/voices/`, downloads the Windows Piper binary, downloads the Ukrainian `uk_UA-lada-medium` voice, updates `.env`, and writes `piper/verification.wav` after a successful synthesis check. See [PIPER_SETUP.md](./PIPER_SETUP.md) for details.

## Provider status

`GET /providers` returns public provider availability and configuration status. `GET /voices` returns the same provider metadata but still requires the bearer token when `TOKEN` is set.

## Server v1 audiobook pipeline

The worker now supplies the queue/cache portion of the Telegram pipeline. Configure
`CHAPTER_SOURCE_URL` for chapter lookup and mount durable object storage at
`AUDIO_STORAGE_DIR`. `GET /audio/:chapterId` atomically joins or creates one render,
while `GET /audio/:chapterId/stream` serves the uploaded artifact with seekable byte
ranges. Queue metadata and per-segment checkpoints survive restarts. Rendering still
uses Dynamic Narrator and the existing Fish Speech-first narrator cascade.
