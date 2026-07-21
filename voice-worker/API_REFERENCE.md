# API Reference

Authentication: all endpoints except `GET /health` require `Authorization: Bearer <TOKEN>` when `TOKEN` is configured.

## GET /health
Returns worker version, provider availability, available voices, uptime, and memory usage.

## GET /voices
Returns configured providers and voice metadata.

## GET /status
Returns basic worker status and defaults.

## POST /preview
Body: `{ "text": "One or more sentences", "voice": "mock-narrator", "provider": "mock", "format": "wav" }`.
Generates one-sentence audio. Response body is audio; `x-novelverse-metadata` contains base64 JSON metadata.

## POST /synthesize
Body matches `/preview`, but supports longer text up to 5000 characters.

## POST /transform
Body supports `text` or `audio`, plus `provider`, `voice`, `language`, `format`, and `options`.

Supported output formats: `wav`, `mp3`, `ogg`.
