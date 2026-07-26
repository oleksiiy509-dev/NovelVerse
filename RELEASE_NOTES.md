# NovelVerse Release Candidate 1.0

RC 1.0 consolidates the complete manuscript-to-audiobook workflow. It adds job-scoped pipeline execution, resumable checkpoints, timeout-aware worker/Piper/storage diagnostics, safe structured log export, portable grouped settings, responsive production controls, improved keyboard focus and reduced-motion behavior, and friendly recovery guidance.

## Known limitations

- Piper synthesis requires the separately running local voice worker and an installed voice model.
- Supabase and Telegram flows require valid deployment credentials.
- JavaScript heap metrics are Chromium-specific and appear unavailable elsewhere.
- Offline mode supports cached reader content; cloud synchronization and new synthesis wait for connectivity.
- RC 1.0 is a release candidate and should complete platform acceptance testing before the stable tag.
