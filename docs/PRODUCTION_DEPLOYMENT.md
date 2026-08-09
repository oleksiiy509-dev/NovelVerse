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
6. Create a private R2 bucket, allow the worker token Object Read/Write access only to that bucket, configure bucket CORS for the web origin, and attach the `R2_PUBLIC_BASE_URL` custom domain.

## Deploy

```sh
npm run deploy:validate -- .env.production
SUPABASE_PROJECT_REF=... NOVELVERSE_PIPER_URL=https://voice.example.com \
  NOVELVERSE_PIPER_TOKEN=... scripts/deploy-supabase.sh
scripts/start-production.sh
scripts/healthcheck.sh
```

Configure the reverse proxy so the public app origin targets `127.0.0.1:8080` and the protected worker origin targets `127.0.0.1:8787`. Do not expose Fish Speech. Terminate TLS at the proxy and pass `X-Request-ID` for log correlation.

## Operations

- Follow structured logs: `docker compose -f docker-compose.production.yml logs -f --tail=200`.
- Liveness is `/live`; readiness is `/ready`; detailed worker diagnostics are `/health`. `/metrics` requires the bearer token.
- Back up Supabase through its managed backups/PITR. R2 objects are derived artifacts, but bucket lifecycle/versioning should match retention policy.
- Upgrade with `git pull`, validate, rebuild, and start. Roll back by checking out the previous release tag and rerunning the startup script; database migrations must be backward compatible.
- Rotate Supabase service role, worker bearer token, and R2 credentials independently, then recreate containers.

## Release verification

Run `npm test`, `npm run lint`, `npm run build`, `npm run test:production`, and the worker tests before promotion. After deployment, verify API health, worker readiness, authenticated synthesis, R2 upload/range playback, Supabase metadata persistence, and a real audiobook render. Watch GPU memory with `nvidia-smi` and confirm containers restart after a host reboot.

Reader UI and Voice Studio UI are not modified by this deployment package.
