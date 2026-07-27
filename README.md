# NovelVerse

NovelVerse is a production-oriented React and Supabase platform for reading, publishing, and turning serialized novels into audiobooks. It runs as a responsive web app and Telegram Mini App, with an optional local Node/Piper voice worker.

## Release candidate capabilities

- Reader, catalog, library, downloads, profile, offline progress, and subscriptions.
- Protected novel/chapter administration plus AI Brain, Voice, Scene, Audio, Narration, Export, and Publishing Studios.
- Resumable audiobook production from chapter analysis through render, mixer, export, quality control, approval, and publishing.
- Provider-neutral character voices, local Piper synthesis, server-side hosted TTS, and Device Voice fallback.
- Diagnostics, recovery checkpoints, non-destructive editing, portable settings, and structured redacted reports.

See [the architecture](docs/ARCHITECTURE.md), [developer setup](docs/DEVELOPER_SETUP.md), [user guide](docs/USER_GUIDE.md), and [1.0 RC audit](docs/RELEASE_AUDIT.md).

## Local development

Requirements: Node.js 20 or newer and npm.

```bash
cp .env.example .env
npm ci
npm run dev
```

Frontend Supabase values are public client configuration. Keep provider keys in Supabase Edge Function secrets; never expose them with a `VITE_` prefix. For local speech synthesis, follow [`voice-worker/README.md`](voice-worker/README.md).

## Release verification

```bash
npm test
npm run lint
npm run build
(cd voice-worker && npm test)
git diff --check
```

External services are not required by unit tests. A release still requires the credentialed staging, real-device, accessibility, security, performance, and full-audio acceptance gates documented in the audit.

## Deployment

Apply the Supabase migrations in timestamp order, deploy the Edge Functions, configure environment values, and deploy the Vite output behind HTTPS. `vercel.json` supplies SPA rewrites, baseline response headers, and immutable caching for hashed assets. See [deployment guidance](DEPLOYMENT.md) before promoting a candidate.

NovelVerse 1.0 RC is a candidate for controlled validation, not an instruction to publish or merge automatically.

## Public beta readiness

Sprint 5 closes the repository-level public-beta blockers identified in the production audit: routes are split into lazy chunks, offline reading progress is retained and replayed after reconnection, player position is persisted, and Telegram theme/viewport/back-button adapters are installed. The database hardening migration must be applied before beta: it limits administrator identity to trusted `app_metadata`, completes RLS coverage for commerce configuration, hardens subscription entitlement evaluation, and adds indexes for progress, subscription, notification, billing, and redemption access paths.

Before public traffic, operators must still complete the environment-dependent gates in [`docs/RELEASE_AUDIT.md`](docs/RELEASE_AUDIT.md): staging RLS verification, real-device accessibility and background-audio tests, a full provider-backed audiobook render/listening pass, monitoring, and backup restoration. Repository checks alone cannot certify those external systems.
