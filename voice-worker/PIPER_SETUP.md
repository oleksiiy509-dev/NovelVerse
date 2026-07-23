# Piper Setup

Piper is the recommended local TTS provider for Windows development. The Windows helper scripts create the expected folders, download Piper, download one Ukrainian voice, update `.env`, and synthesize a verification WAV.

## Windows quick setup

Prerequisites:

- Windows 10 or 11, x64.
- PowerShell 7 or Windows PowerShell 5.1.
- Network access to GitHub and Hugging Face for the initial download.

From the repository root:

```powershell
cd voice-worker
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\setup-piper.ps1
npm start
Invoke-RestMethod http://127.0.0.1:8787/providers
```

The setup script automatically creates:

```text
voice-worker/piper/
voice-worker/piper/voices/
```

It downloads the default Ukrainian voice, `uk_UA-lada-medium`, to:

```text
voice-worker/piper/voices/uk_UA-lada-medium.onnx
voice-worker/piper/voices/uk_UA-lada-medium.onnx.json
```

It also writes these values to `voice-worker/.env`:

```env
DEFAULT_PROVIDER=piper
DEFAULT_LANGUAGE=uk
PIPER_BIN=<repo>\voice-worker\piper\piper.exe
PIPER_MODEL=<repo>\voice-worker\piper\voices\uk_UA-lada-medium.onnx
PIPER_VOICE=uk_UA-lada-medium
```

## Download only the Ukrainian voice

If Piper is already installed and you only need the bundled Ukrainian voice:

```powershell
cd voice-worker
.\download-voices.ps1
```

## Verification

`setup-piper.ps1` runs Piper with a Ukrainian verification sentence and writes:

```text
voice-worker/piper/verification.wav
```

If this file exists and is larger than an empty WAV header, the local Piper binary and model are usable by the worker.

## Provider status

Use the provider status endpoint to confirm runtime configuration:

```powershell
Invoke-RestMethod http://127.0.0.1:8787/providers
```

The Piper provider is available only when `PIPER_BIN` and `PIPER_MODEL` are configured and both files exist. The status response includes a human-readable reason when Piper is unavailable.

## Manual configuration

On non-Windows hosts or custom installs, set `.env` manually:

```bash
DEFAULT_PROVIDER=piper
PIPER_BIN=/opt/piper/piper
PIPER_MODEL=/opt/piper/voices/uk_UA-lada-medium.onnx
PIPER_VOICE=uk_UA-lada-medium
```
