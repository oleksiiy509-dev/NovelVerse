# NovelVerse Voice Director

Phase 3 adds a deterministic AI Director layer on top of Voice Engine segment analysis and persistent cast memory. It does not call paid TTS providers, generate MP3 files, clone voices, or add audio assets.

## Architecture

`directChapterPerformance` receives chapter IDs, analyzed voice segments, novel cast entries, characters, and an optional previous plan. It returns versioned scenes, segment performance settings, warnings, statistics, and a content hash. Manual segment overrides from a previous plan are preserved.

## Scene detection and boundaries

Scene detection is rule-based and language-aware. Ukrainian, Russian, and English keyword files score battle, chase, horror, romance, comedy, system, dream, and flashback evidence. Neutral fallback is always allowed. Romance requires explicit romantic evidence; battle requires combat evidence.

Boundaries preserve segment order and use system blocks, explicit separators, and confident tone changes. Uncertain inferred boundaries are reported as warnings.

## Performance planning

The central scene catalog defines base rate, energy, intensity, narrator style, pause multiplier, ambience profile, sound density limit, and descriptions for neutral, dialogue, exposition, mystery, horror, battle, chase, danger, romance, sadness, comedy, celebration, discovery, training, system notification, dream, and flashback scenes.

Voice rules keep narrator voices safe, make young-hero determination more energetic, keep fear hesitant, make elderly delivery slightly slower without caricature, avoid extreme young-female pitch, keep system delivery mechanical-neutral, and leave creature processing as future provider metadata.

## Emotion smoothing

Automatic intensity changes are clamped across adjacent speaker changes. Narrator emotion remains separate from character emotion, and manual segment edits are not overwritten during regeneration.

## Pause planning

Pauses use punctuation, ellipses, em-dash interruption, speaker changes, and scene boundaries. Values are clamped to avoid excessive silence.

## Emphasis

The emphasis planner records ranges for bold, italics, uppercase words, repeated punctuation, and quoted important words. It never rewrites source text or adds words.

## Sound cue suggestions

Suggestions are metadata only. Supported cue types include rain, thunder, wind, forest, fire, water, footsteps, horse steps, sword clash, impact, door open, door creak, crowd, birds, cave echo, heartbeat, explosion, and silence. Cues require textual evidence, include confidence, and are capped per scene so they do not cover important dialogue.

## Atmosphere profiles

Abstract ambience profiles include none, quiet room, city, village, forest day/night, light rain, storm, cave, battlefield, ocean, fire camp, palace, dungeon, dream, and void. Each stores label, volume, fades, loop behavior, and description. No audio files are included.

## Director Studio workflow

Admins can generate a deterministic plan, inspect a compact timeline, edit scene type, intensity, pace, ambience, segment emotion, rate, pitch, energy, pauses, delivery style, and remove cues. Device Voice preview is explicitly labeled as a timing/role approximation, not final AI audio.

## Offline caching

Downloaded chapters may cache ready director metadata alongside voice segments and cast. No audio assets are downloaded. Reader falls back to standard Device Voice or plain text narration when a director plan is missing or stale.

## Validation and security

Validation warns about invalid numeric values, negative/excessive pauses, missing cast slots, narrator/creature mismatch, cue confidence issues, invalid ranges, missing voice segments, stale hashes, and manual edits at overwrite risk. Supabase RLS lets users read ready plans for playback while only admins can create, update, or delete director data.

## Limitations and future work

Browser SpeechSynthesis cannot reproduce real timbre, roughness, or emotional acting. Future phases can render provider-based multi-voice audio, map abstract ambience/cue metadata to licensed assets, and produce downloadable audio manifests without exposing provider secrets.

## AI Brain input

Director planning accepts story context, current character states and voice evolution modifiers so delivery reflects emotional history, relationships and recent events.

## Phase 6 provider instructions

Director emotion, intensity, pace, confidence, breathiness, roughness, voice age, scene mood and emphasis are now consumed by the real provider adapter as style instructions. Provider-specific prompt construction remains outside the frontend.
