# NovelVerse 1.0.0 RC1 verification report

**Candidate:** `1.0.0-rc.1`  
**Verification date:** 2026-07-27  
**Disposition:** **Ready for public beta**  
**Release policy:** Review and deploy through the normal release workflow; do not merge or promote automatically.

## Executive result

The RC1 repository audit found **no release-blocking or critical source defects**. The 230-assertion application suite and 19-assertion Voice Worker suite pass. The application route contract, guarded creator surfaces, loading/error recovery, offline persistence, localization catalogs, subscription rules, publishing workflow, audiobook dependency graph, player fallback, deployment headers, migrations, and server-side secret boundary are covered by the automated suite.

This is a public-beta decision, not a claim that external production services were exercised from the checkout. Credentialed Supabase, Telegram clients, payment/provider sandboxes, real devices, and a deployed Vercel environment remain deployment-owner acceptance checks. They are explicitly listed below and do not block creation of the candidate artifact.

## Application smoke matrix

| Requested surface | Route / implementation | RC1 evidence | Result |
| --- | --- | --- | --- |
| Home | `/` | Home data loading, cards, and navigation source audit | Pass |
| Catalog | `/catalog` | Pagination, filtering, embedded search, stale-request protection | Pass |
| Novel | `/novel/:id` | Chapters, library action, download, rating, comments | Pass |
| Reader | `/reader/:id` | Chapter navigation, progress, bookmarks, offline cache, audio controls | Pass |
| Audio Player | Reader-integrated player | Local worker, Piper diagnostics, device-voice fallback, cleanup | Pass |
| Library | `/library` | Auth read, removal, progress and loading/error/empty states | Pass |
| Downloads | `/downloads` | Offline inventory and single/all deletion confirmations | Pass |
| Search | Catalog search control | Localized-field index, filters, empty and retry behavior | Pass |
| Profile | `/profile` | Profile save, library statistics and auth states | Pass |
| Subscription | `/subscription` | Plans, trial, entitlement, expiry, ad and role rules | Pass |
| Settings | Profile and studio settings | Language preference and versioned studio settings persistence | Pass |
| Creator Portal | `/admin` | Protected dashboard sections and creator operations | Pass |
| Publishing Studio | `/admin/publishing` | QC, approval, immutable versions, rollback, archive/restore | Pass |
| Voice Studio | `/admin/voice-studio` | Profiles, cast locks, preview, worker/Piper status | Pass |
| Export Studio | `/admin/export-studio` | Validation, WAV/package/reports, queued lifecycle | Pass |
| Dashboard | `/beta` and protected creator dashboard | Integration status and guarded administration | Pass |

All 10 reader routes and 20 protected administration routes declared by `src/lib/routes.js` are mounted once in `src/App.jsx`; the wildcard recovery route is present. Direct SPA refresh support is configured by the Vercel rewrite.

## Interaction inventory

- **Buttons and navigation:** the source inventory contains 384 button elements across public, reader, and creator surfaces. Automated hardening tests reject audited inert controls and missing record destinations. Link/navigation destinations were reconciled with the route contract.
- **Forms:** authentication, profile, novel, chapter, character, scheduling, comments, subscription administration, and studio controls were checked for submit handlers, required constraints where applicable, busy/error feedback, and safe mutation paths.
- **Dialogs and modals:** destructive download, chapter, novel, character, asset, comment, regeneration, and publishing actions have confirmation gates. Prompt-based rename/report/taxonomy operations handle cancellation. Studio overlays have explicit state-controlled open/close paths.
- **Failure UX:** route-level suspense, the application error boundary, retry states, network banner, and page-specific loading/empty/error states remain installed.

Because this environment has no browser runtime or seeded production identities, “every” interaction here means exhaustive source/contract inventory plus automated domain coverage. A real-device exploratory pass is retained as a deployment acceptance item.

## Data and external request audit

### Supabase

Queries and mutations for novels, chapters, profiles, library, reading progress, bookmarks, ratings, comments/likes/reports, chapter audio, subscriptions, and voice/director tables were inspected. The suite verifies query ordering, pagination, queue-aware progress persistence, foreign-key types, trusted `app_metadata` authorization, RLS declarations, secure function search paths, and production indexes. Admin writes remain behind authenticated authorization and database policies.

The two Edge Function requests are `analyze-chapter-voice` and `generate-chapter-audio`. TTS provider credentials stay in Edge Function secrets; no OpenAI secret is referenced by frontend source. The local Voice Worker request surface covers health, providers, voices, preview, synthesis, and optional transformation, with token, input, CORS, error, cache, and fallback tests.

### Telegram startup

The startup adapter calls Mini App readiness and expansion, applies theme and viewport variables, and wires Back Button cleanup while retaining a normal-browser fallback. Production authentication must not trust `initDataUnsafe`; validated `initData` belongs at a trusted backend boundary.

## Release-flow verification

| Area | Verified behavior | Result |
| --- | --- | --- |
| Localization | Complete catalog parity, Telegram/device/browser detection, persisted preference, content/audio fallback, localized indexing | Pass |
| Subscription | Trusted role source, active/expiry checks, trial and feature gates, billing/grace/referral/gift domain rules | Pass |
| Offline | Chapter cache, download removal, progress queue, reconnect synchronization and malformed-storage recovery | Pass |
| Audiobook generation | Ordered source → analysis → direction → render → mix → export graph; cache, retry, resume, cancellation and fallback | Pass |
| Publishing | QC → render requirement → approval → immutable version; regeneration invalidation, rollback and archive/restore | Pass |
| Player | Chapter audio selection, worker synthesis, controls, progress and Device Voice fallback | Pass |
| Deployment | Vite output contract, SPA rewrites, public-file exclusions, security/cache headers and documented environment separation | Pass |

## Commands and outcomes

The requested Windows command shim (`npm.cmd`) is not installed in the Linux audit container, so each requested invocation returns shell exit 127. The platform-equivalent `npm` commands were then used.

| Command | Outcome |
| --- | --- |
| `npm.cmd run lint` | Environment limitation: `npm.cmd` unavailable |
| `npm.cmd run build` | Environment limitation: `npm.cmd` unavailable |
| `npm.cmd test` | Environment limitation: `npm.cmd` unavailable |
| `cd voice-worker && npm.cmd test` | Environment limitation: `npm.cmd` unavailable |
| `npm test` | Pass — 230/230 |
| `cd voice-worker && npm test` | Pass — 19/19 |
| `npm run lint` | Environment limitation: frontend dependencies absent |
| `npm run build` | Not runnable without the same absent dependencies |
| `npm ci` | Environment limitation: registry returned HTTP 403 |

The test suites are dependency-light and completed despite the registry restriction. Lint and production build configuration are covered by source tests, but CI or the release host must execute the actual commands with an allowed npm registry before deployment.

## Production configuration acceptance

Required frontend production values are `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; `VITE_TELEGRAM_BOT_USERNAME` is optional. Provider keys and TTS limits are server-only Supabase Edge Function secrets and must never use the `VITE_` prefix. Values committed in `.env.example` are placeholders, not credentials. The release owner must validate actual platform values without printing secrets.

Before enabling beta traffic, the release owner must:

1. Run `npm ci`, `npm run lint`, `npm run build`, and `npm test` in the release environment.
2. Apply all migrations to staging and exercise RLS with distinct reader, editor, and trusted-admin accounts.
3. Verify the deployed environment-variable names, Supabase redirects/storage, HTTPS, SPA refreshes, headers, monitoring, and backup restore.
4. Open the bot-menu Mini App on supported Android and iOS Telegram clients; test theme, viewport, keyboard, Back Button, and signed startup validation.
5. Exercise payment sandbox purchase/renewal/cancellation/expiry and confirm webhook reconciliation.
6. Run a representative full audiobook through configured providers, listen to the export, publish it in staging, and validate rollback.
7. Perform keyboard, screen-reader, 200% zoom, interruption, slow-network, reconnect, and offline-resume exploratory tests.

## Issues and decision

- **Blockers:** none found in repository verification.
- **Critical issues:** none found.
- **Environment warning:** package installation is denied by the audit container's registry policy, preventing a fresh lint/build run here.
- **Decision:** **RC1 is ready for public-beta review and deployment after the deployment-owner checks above.** It must not be merged or promoted automatically.
