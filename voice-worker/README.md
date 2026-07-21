# NovelVerse Local Voice Worker

Self-hosted optional worker for free/local TTS experimentation. Set `VOICE_WORKER_TOKEN` for bearer authentication and never hardcode secrets. Endpoints: `GET /health`, `GET /voices`, `POST /synthesize`, `POST /transform`, `POST /preview`.

Providers report unavailable unless their runtime/model configuration is present. The included mock processor is deterministic and does not clone real voices.
