# NovelVerse GPU VPS production deployment

This package runs the built NovelVerse web/API container, the Node voice worker, and Fish Speech on one NVIDIA GPU VPS. Supabase remains the production database/auth control plane and Cloudflare R2 stores generated audio.

## Prerequisites

- Ubuntu 22.04/24.04, Docker Engine with Compose v2, NVIDIA driver and NVIDIA Container Toolkit
- A GPU with sufficient VRAM for the chosen Fish Speech checkpoint
- A Supabase project and Supabase CLI; an R2 bucket, API token, and custom public domain
- TLS reverse proxy or Cloudflare Tunnel. Only ports 80/443 should be internet-accessible; Compose binds application ports to loopback by default.

## Provision and configure

1. Clone the repository to `/opt/novelverse` and run `sudo scripts/provision-gpu-vps.sh` if Docker/NVIDIA tooling is not installed.
2. Copy `.env.production.example` to `.env.production`, set mode `0600`, and replace every placeholder. The service-role and R2 keys are server-only and must never use a `VITE_` prefix.
3. Set the same random value in `TOKEN`, `VOICE_WORKER_TOKEN`, and the Supabase Edge Function secret `NOVELVERSE_PIPER_TOKEN`.
4. Set `VITE_SUPABASE_URL`/`SUPABASE_URL` to the production project and use only the anon/publishable key for `VITE_SUPABASE_ANON_KEY`.
5. In Supabase Auth, configure the public HTTPS site URL and exact redirect allow-list. Keep RLS enabled. Create the production admin using trusted `app_metadata`, never `user_metadata`.
6. Create an R2 bucket and an API token scoped to Object Read & Write for that bucket only. The worker needs `PutObject`, `GetObject`, `HeadObject`, `DeleteObject`, and multipart create/upload/complete/abort operations. Do not use the account-wide API key.
7. Choose a delivery mode:
   - **Private (recommended for paid audio):** leave `R2_PUBLIC_BASE_URL` empty. NovelVerse returns short-lived SigV4 download URLs; the authenticated worker streaming route still supports byte ranges.
   - **Public streaming:** connect an R2 custom domain and set `R2_PUBLIC_BASE_URL=https://audio.example.com`. Do not use the `r2.dev` development URL in production. Configure CORS for the exact application origin and `GET`/`HEAD`, and expose `Content-Length`, `Content-Range`, and `ETag`.
8. Set a stable `R2_KEY_PREFIX` per environment. Set `R2_MULTIPART_THRESHOLD_BYTES` (default 50 MiB), `R2_MULTIPART_PART_SIZE_BYTES` (minimum 5 MiB), `R2_RETRY_ATTEMPTS`, and `UPLOAD_JOB_ATTEMPTS`. Add an R2 lifecycle rule that aborts incomplete multipart uploads after one day.
9. Apply every Supabase migration. `chapter_audio_renders` contains object keys, sizes, MIME types, SHA-256 checksums, and queue state only; audio bytes must never be inserted into Supabase Storage or Postgres.

The worker hashes the final artifact, uploads it automatically after rendering, verifies the R2 `HEAD` size and checksum metadata, and deletes a corrupt object. Large files use multipart upload and an unsuccessful multipart session is aborted. Transient R2 responses (`429` and `5xx`) use exponential backoff; a failed chapter job is automatically requeued up to `UPLOAD_JOB_ATTEMPTS`. Completed downloads are hashed again before the worker sends them.

## Deploy

```sh
npm run deploy:validate -- .env.production
SUPABASE_PROJECT_REF=... NOVELVERSE_PIPER_URL=https://voice.example.com \
  NOVELVERSE_PIPER_TOKEN=... scripts/deploy-supabase.sh
scripts/start-production.sh
scripts/healthcheck.sh
```

Configure the reverse proxy so the public app origin targets `127.0.0.1:8080` and the protected worker origin targets `127.0.0.1:8787`. Do not expose Fish Speech. Terminate TLS at the proxy and pass `X-Request-ID` for log correlation.

### R2 production smoke test

Submit one authenticated render and poll the returned job until `status=completed`. Then test both a complete verified download and a range stream:

```sh
curl -fsS -H "Authorization: Bearer $VOICE_WORKER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"bookId":"smoke","chapterId":"r2-smoke-1","chapterNumber":1,"bookTitle":"Smoke","segments":[{"text":"NovelVerse R2 production verification."}]}' \
  https://voice.example.com/chapter-jobs

curl -fL -H "Authorization: Bearer $VOICE_WORKER_TOKEN" \
  'https://voice.example.com/chapter-jobs/JOB_ID/download' -o /tmp/novelverse-smoke.wav
curl -f -H "Authorization: Bearer $VOICE_WORKER_TOKEN" -H 'Range: bytes=0-1023' \
  'https://voice.example.com/audio/r2-smoke-1/stream' -o /tmp/novelverse-range.bin
sha256sum /tmp/novelverse-smoke.wav
```

Confirm the metadata row has `status=completed`, an `object_key`, the expected `byte_size`, and a 64-character `checksum_sha256`. Confirm no corresponding audio payload exists in a Supabase Storage bucket. Delete the smoke object through `DELETE /audio/cache/r2-smoke-1` and confirm both its R2 object and metadata row are removed.

## Operations

- Follow structured logs: `docker compose -f docker-compose.production.yml logs -f --tail=200`.
- Liveness is `/live`; readiness is `/ready`; detailed worker diagnostics are `/health`. `/metrics` requires the bearer token.
- Back up Supabase through its managed backups/PITR. R2 objects are derived artifacts, but bucket lifecycle/versioning should match retention policy. Monitor incomplete multipart uploads, R2 429/5xx rates, checksum failures, `retry` rows, and queue age.
- Upgrade with `git pull`, validate, rebuild, and start. Roll back by checking out the previous release tag and rerunning the startup script; database migrations must be backward compatible.
- Rotate Supabase service role, worker bearer token, and R2 credentials independently, then recreate containers.

## Release verification

Run `npm test`, `npm run lint`, `npm run build`, `npm run test:production`, and the worker tests before promotion. After deployment, verify API health, worker readiness, authenticated synthesis, R2 upload/range playback, Supabase metadata persistence, and a real audiobook render. Watch GPU memory with `nvidia-smi` and confirm containers restart after a host reboot.

Reader UI and Voice Studio UI are not modified by this deployment package.
