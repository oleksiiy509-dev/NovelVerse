# Changelog

All notable NovelVerse changes are documented here. This project follows semantic versioning; release candidates use the `-rc.N` suffix.

## [1.0.0-rc.1] - 2026-07-26

### Added

- Production reader, catalog, library, downloads, profile, subscription, and Telegram Mini App surfaces.
- Protected administration for novels, chapters, taxonomy, characters, subscriptions, and every production studio.
- Resumable novel-to-audiobook pipeline covering analysis, direction, narration, voice rendering, sound design, mixing, export, quality control, and publishing.
- Provider-neutral Voice Studio, local Voice Worker/Piper support, device-voice fallback, and server-side OpenAI TTS adapter.
- Export and Publishing Studios with validation, immutable versions, approval, rollback, archive, and restore flows.
- Subscription plans, entitlements, trials, advertising policy, privileged administration, analytics, and database policies.
- Offline reader progress, diagnostic logging, recovery checkpoints, settings portability, and error-center reporting.

### Hardened

- Route-level code splitting, bounded diagnostic history, cancellation-safe jobs, request timeouts, cache invalidation, object-URL cleanup, and paged catalog access.
- Admin authorization, server-side subscription validation, secret redaction, Voice Worker authentication/rate limiting/CORS, and deployment response headers.
- Keyboard focus, reduced motion, semantic status feedback, touch targets, safe-area layout, narrow mobile screens, and Telegram viewport/Back Button integration.

### Known limitations

- External Supabase, Telegram, OpenAI, and distribution acceptance tests require deployment credentials and cannot be completed by the repository-only suite.
- Piper requires a separately managed worker, executable, and compatible voice model.
- Final audio still requires distributor-specific loudness, metadata, rights, and listening review before commercial submission.
