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
