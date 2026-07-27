# NovelVerse Global Language Platform v1

## Supported languages

V1 ships interface catalogs and content identifiers for English (`en`), Ukrainian (`uk`), Russian (`ru`), Spanish (`es`), German (`de`), and Japanese (`ja`). Language identifiers are normalized from BCP-47-style values such as `uk-UA`.

## Architecture

`globalLanguage.js` is the framework-independent domain layer. It owns detection, fallbacks, localized book/audio selection, workflow validation, voice selection, multilingual search, notification localization, API projection, and analytics aggregation. `LanguageProvider` is the React adapter: it detects the initial language, persists user overrides locally, updates the document language, and exposes catalog translation through `t()`.

A book has an `originalLanguage` and a `languages` map with no fixed size. Each value can contain localized title, description, metadata, chapters, audio, cover, keywords, and publication status. API handlers can pass a book and user preferences to `localizeApiResponse` while retaining `availableLanguages` and resolution metadata.

## Detection and fallback

Automatic interface detection uses Telegram `language_code`, then the device language list, then browser language, then English. Users can disable automatic mode and separately choose interface, reading, and audio language. Content and audio resolve in this order: preferred language → English → original language. If none exists, the first valid version is returned so legacy content remains usable.

## Translation workflow

Translations progress through Draft → Machine Translation → Human Review → Approved → Published. The domain layer rejects skipped quality gates and records actor/timestamp history. Published content can return to Human Review when corrections are required.

## Voice mapping

Each language mapping supports `defaultMale`, `defaultFemale`, and a `premium` list. Selection honors a premium request, then gender, then any configured default. Celebrity voices are intentionally reserved for a future catalog extension.

## Notifications, search, and analytics

Push payloads store a translations map and are localized with the same deterministic fallback. Search considers titles, descriptions, keywords, and metadata in all versions. Analytics aggregates top interface languages, countries, playback languages, and conversion rates by language without coupling the domain to an analytics vendor.

## Limitations

V1 includes six curated core UI catalogs; product-specific screens can migrate remaining legacy inline copy incrementally through the provider. Preferences are device-local until profile preference columns and sync endpoints are deployed. Machine translation, human-review assignment, push delivery, country enrichment, celebrity voice licensing, and search persistence require external providers/back-end infrastructure; this release supplies their stable domain contracts and admin visibility.
