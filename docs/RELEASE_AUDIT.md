# NovelVerse 1.0 RC release audit

**Audit date:** 2026-07-26  
**Candidate:** `1.0.0-rc.1`  
**Decision:** Ready for staged release-candidate deployment; not approved for an automatic stable release.

## Module acceptance matrix

| Surface | Verified release contract | Status |
| --- | --- | --- |
| Reader | Chapter loading, progress, offline cache, audio controls, Device Voice fallback, responsive reading surface | Automated + code audit |
| Library | Authenticated library reads, progress synchronization, offline queue, empty/error states | Automated + code audit |
| Publishing Studio | QC, approval locks, versions, rollback, regeneration, ordering, archive/restore, role checks | Automated |
| Export Studio | WAV/package/report output, validation, persistent queue, pause/resume/cancel/retry | Automated |
| Voice Studio | Stable profiles, cast locks, evolution, import/export, provider diagnostics, Piper preview | Automated |
| Audio Studio | Non-destructive tracks/clips, assets, preview, production plan import, persistence | Automated |
| Subscription Platform | Server-derived roles, active/expiry validation, plans, trials, entitlements, admin analytics | Automated + migration audit |
| Admin Panel | Protected route boundary and complete content/studio/subscription route inventory | Automated |
| Piper Worker | Token auth, input limits, rate limit, allowlisted CORS, health/voices/synthesis, provider errors | Automated |

## Audiobook acceptance path

The canonical pipeline is:

1. **Novel and ordered chapters** are loaded without mutating manuscript text.
2. **AI analysis** identifies chapter structure and characters.
3. **Direction and production planning** create narration, emotion, scene, voice, music, ambience, and SFX instructions while preserving manual locks.
4. **Voice rendering** runs through cached, resumable jobs with timeout, retry, cancellation, and provider fallback behavior.
5. **Mixer preparation and final mix** place ordered speech and scene assets with ducking and non-destructive edits.
6. **Export** validates dependencies and produces WAV, project package, production report, and diagnostic report.
7. **Publish** runs QC, creates an immutable version, requires approval/audio, and supports rollback/archive.

The nine-stage dependency graph is tested end to end and for restart, partial rebuild, cancellation, caching, corruption recovery, and manual-edit preservation. Commercial publication remains an operator decision after an actual listening pass.

## Performance and memory

- Pages and studios are lazy-loaded; production code is split by route.
- Catalog retrieval is paginated and async results are protected from stale updates.
- Render/export work is chunked and cancellable; duplicate jobs share execution and stage cache keys are fingerprinted.
- Diagnostic history and error data are bounded. Audio object URLs, timers, abort listeners, observers, and playback resources have explicit cleanup ownership.
- Immutable production edits trade temporary allocations for predictable rollback. Long manuscripts should be batch processed; browser heap telemetry is advisory and Chromium-only.

**Release gate:** record real-device load time, peak heap, long-task count, and a full-length audiobook render in staging. No repository-only claim is made for a universal performance budget.

## Security and privacy

- Admin pages require authenticated admin authorization; subscription privileges derive from trusted server metadata.
- Provider keys remain server-side. Diagnostic exports redact secrets, authorization, cookies, sessions, email addresses, and token-like fields.
- Supabase migrations enable row-level policies for production data. The Voice Worker validates input, supports token authentication, rate limits requests, restricts CORS to local development origins, and normalizes errors.
- Hosting adds MIME-sniffing, referrer, permissions, opener, and immutable-asset cache headers. A deployment-specific CSP is intentionally a staging gate because Telegram embedding and configured Supabase/worker origins vary by environment.

**Operations gate:** rotate non-development credentials, configure exact production origins, verify RLS with separate reader/editor/admin accounts, enable platform monitoring/backups, and perform dependency/SAST scanning in the release environment.

## Accessibility, mobile, and Telegram

- Global visible focus, screen-reader-only text, reduced-motion support, labeled form controls/status regions, and error/loading/empty states are present.
- Controls meet the 44px touch-target baseline; layouts account for 320px screens, dynamic viewport height, device safe areas, virtual keyboard space, and horizontal overflow.
- Telegram integration applies theme variables, initializes/expands the Mini App, tracks stable viewport changes, and connects the native Back Button without making browser use dependent on Telegram.

**Manual gate:** complete keyboard-only, VoiceOver/TalkBack, 200% zoom, light/dark high-contrast, iOS/Android Telegram, slow-network, offline-resume, and audio-interruption checks. Automated source tests are not a substitute for WCAG conformance testing.

## Release gates and remaining issues

### Passed in the repository

- Domain/integration tests, Voice Worker tests, and whitespace validation pass in this checkout. ESLint and the production build remain mandatory CI gates; this audit environment could not restore frontend packages because registry access returned HTTP 403.
- Route inventory includes subscription and subscription administration.
- Documentation, changelog, release notes, deployment headers, migrations, and environment templates are versioned.

### Required before stable 1.0

1. Apply migrations to a staging clone and execute separate-role RLS tests.
2. Run an actual full novel through configured AI/TTS/Piper providers and listen to the complete exported artifact.
3. Validate Telegram init data server-side in the production authentication boundary and test on supported Telegram clients.
4. Perform real-device accessibility/mobile checks and capture performance/heap baselines.
5. Verify backup restore, monitoring/alerts, rate limits, custom-domain TLS, privacy terms, content rights, and distributor requirements.
6. Resolve any findings, then promote a new candidate or stable tag through review; never merge or deploy this candidate automatically.
