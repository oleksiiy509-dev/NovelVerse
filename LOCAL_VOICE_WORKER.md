# Local Voice Worker

NovelVerse can run without a paid TTS API. If no local worker is configured, the existing Device Voice browser fallback and disabled passthrough transformation remain available.

## Start the worker

```bash
cd voice-worker
VOICE_WORKER_TOKEN=replace-me node api/server.js
```

Or build the Dockerfile and pass secrets as environment variables. Do not commit tokens.

## Connect NovelVerse

Configure the app/server with the worker URL and bearer token. The worker exposes `GET /health`, `GET /voices`, `POST /synthesize`, `POST /transform`, and `POST /preview`.

## Providers

Adapters are prepared for Piper, generic HTTP TTS, future Kokoro, and future custom models. They report `available: false` until binaries, model paths, or URLs are configured.

## Hardware and licensing

The mock and passthrough modes need no GPU. Real local models may benefit from CPU vector extensions or GPU acceleration. Before downloading any voice model, verify the model license allows your use case and that the voice is authorized for synthetic speech.
