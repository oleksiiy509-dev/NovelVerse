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

## Production hardening v1 audit (2026-07-26)

The release hardening pass covers the complete reader and protected-admin route inventory, the analysis/director/voice/render/export/publishing pipeline, Supabase access sites, local Voice Worker and Piper behavior, offline progress, diagnostics, and Telegram Mini App layout. The canonical route inventory lives in `src/lib/routes.js` and is protected by `tests/productionHardening.test.mjs` so a page cannot silently disappear from the router.

### Reliability guarantees

- Route chunks render a responsive skeleton and the application error boundary records a redacted correlation code. Navigating to another route resets a failed route without requiring a full reload.
- Offline progress synchronization is single-flight, stops when the component unmounts or connectivity drops, checks remote timestamps before upsert, and retains queued work after any Supabase failure.
- Voice Worker health and synthesis requests have finite timeouts. Retryable worker/Piper failures are classified for the existing Device Voice fallback; caller abort listeners and timers are always removed.
- Diagnostic history is bounded and exported contexts redact tokens, credentials, cookies, sessions, email addresses, and authorization values.
- Large reader and studio surfaces remain lazy-loaded at route level. Catalog queries are paged and guarded against stale timers/observers; audio object URLs and playback resources are revoked by their owners.

### Supabase query contract

All mutations must inspect and surface the returned `error`; list queries must select only required columns where practical. The application expects the core content/auth schema (`novels`, `chapters`, `profiles`, `library`, reading and social tables) plus the versioned audio/voice migrations in `supabase/migrations`. Deployments must apply their core schema before these repository migrations; missing configuration deliberately uses a non-secret placeholder client and presents user-facing load errors.

### Known limitations

- Browser/device SpeechSynthesis is an approximation, not a byte-identical Piper render.
- IndexedDB fallback uses localStorage and is therefore quota-limited; audio blobs should be kept in IndexedDB in supported browsers.
- Local Piper availability depends on the operator-installed executable/model and browser access to the configured worker URL. HTTPS deployments may block an HTTP localhost worker under browser mixed-content policy.
- Export audio in the current v1 workspace is a deterministic project render/packaging workflow, not a replacement for external mastering or distributor validation.

## Sprint 5 public-beta hardening (2026-07-27)

Authorization has one trust boundary: administrative UI checks and PostgreSQL policies accept only Supabase `app_metadata`, which is assigned by a privileged backend. User-editable profile metadata and build-time email lists are display/configuration data, never permissions. Subscription access remains a database decision through `has_subscription_feature`; its security-definer function fixes the search path and derives the subject exclusively from `auth.uid()`.

Reader progress has a single resilience path. It is written locally first, queued in IndexedDB (with localStorage fallback) when offline or after a Supabase error, and replayed by the single-flight network synchronizer on startup and browser `online` events. Remote timestamps prevent stale queued state from replacing newer server state. Audio sentence position and scroll position use the same queue-aware persistence instead of an unobserved direct mutation.

The Sprint 5 migration completes RLS coverage for commerce configuration and operational tables and adds indexes matching subscription entitlement, notification, listening, billing retry, redemption, and reading-progress queries. Apply migrations in timestamp order and validate their query plans and policies against a staging copy with realistic volume before beta promotion.
