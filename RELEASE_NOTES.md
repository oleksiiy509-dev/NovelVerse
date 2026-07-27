# NovelVerse Release Candidate 1.0

## 1.0.0 RC1 — public beta candidate

RC1 completes the release-candidate verification pass without adding product features. The application and Voice Worker automated suites pass, and the route, interaction, data-access, offline, localization, subscription, audiobook, publishing, player, Telegram, and deployment contracts are recorded in `docs/RELEASE_CANDIDATE_RC1.md`. Credentialed service and real-device checks remain deployment-owner gates; this candidate must not be merged or promoted automatically.

RC 1.0 consolidates the complete manuscript-to-audiobook workflow. It adds job-scoped pipeline execution, resumable checkpoints, timeout-aware worker/Piper/storage diagnostics, safe structured log export, portable grouped settings, responsive production controls, improved keyboard focus and reduced-motion behavior, and friendly recovery guidance.

The candidate also includes the production Subscription Platform, protected subscription administration, a canonical route acceptance inventory, baseline deployment security headers, and immutable caching for hashed assets. The complete audit and stable-release gates are recorded in `docs/RELEASE_AUDIT.md`; changes are enumerated in `CHANGELOG.md`.

## Release decision

The repository is ready for a controlled RC deployment. Promotion to stable 1.0 remains conditional on credentialed Supabase/RLS validation, a full-length provider-backed render and listening pass, real-device Telegram/mobile/accessibility testing, and staging performance and memory baselines. This candidate must be reviewed and must not be merged or deployed automatically.

## Known limitations

- Piper synthesis requires the separately running local voice worker and an installed voice model.
- Supabase and Telegram flows require valid deployment credentials.
- JavaScript heap metrics are Chromium-specific and appear unavailable elsewhere.
- Offline mode supports cached reader content; cloud synchronization and new synthesis wait for connectivity.
- RC 1.0 is a release candidate and should complete platform acceptance testing before the stable tag.
