# NovelVerse RC 1.0 architecture

NovelVerse is a Vite/React Telegram Mini App. Route-level pages live in `src/pages` and are lazy-loaded by `App.jsx`; reusable UI lives in `src/components`. Domain engines are framework-independent modules in `src/lib`, allowing Node's test runner to exercise production, narration, voice, mixing, assets, and export behavior without a browser.

Supabase provides hosted identity and data, while Telegram authentication and viewport integration are isolated behind contexts and hooks. Local speech synthesis is optional: `src/lib/voiceWorker.js` communicates with the Node service in `voice-worker`, whose provider adapter invokes Piper. Browser-side queues persist checkpoints in local storage so interrupted productions can resume.

The release control surface is `/beta`. It owns pipeline orchestration, health checks, safe structured diagnostic logs, settings portability, project recovery, and production exports. Sensitive fields are redacted before logs are exported.

## Folder overview

- `src/components`: shared, accessible presentation components.
- `src/pages`: route entry points and studios.
- `src/lib`: domain engines, persistence, diagnostics, and integrations.
- `src/styles`: page themes and shared design tokens.
- `tests`: browser-independent integration and pipeline tests.
- `voice-worker`: local HTTP voice service, providers, audio processors, and tests.
- `supabase`: database migrations and server-side functions.

## Stability model

Pipeline state is checkpointed after transitions, stage output is isolated by job, and duplicate execution of one job shares the same promise. Cancellation is job-scoped so stopping one production cannot race with another. Diagnostic probes use a five-second abort timeout.
