# NovelVerse Voice Cast

Phase 2 adds a persistent, novel-level voice cast. `voice_characters` remains the canonical character table, `chapter_voice_segments` remains the segment table, and `novel_voice_cast` stores the stable voice identity assigned to each recurring character.

## Architecture

- `novel_voice_cast` has one row per `(novel_id, character_id)` and a unique `(novel_id, cast_slot)` so major characters do not drift across chapters.
- `voice_cast_audit` records assignment, lock, alias, merge and parameter changes for admin review.
- Cast slots are abstract NovelVerse identities. They are not paid provider voices and they do not contain biometric voice data.

## Cast slots

The catalog lives in `src/lib/voiceEngine/castSlots.js`. It includes narrator slots, young/adult/elderly male and female slots, child slots, system, creature and unknown fallbacks. Each slot declares compatible gender, age group, roles, default voice profile and acoustic defaults.

## Assignment rules

`assignNovelVoiceCast` is deterministic. It preserves existing and manually locked assignments, gives narrators `narrator_main`, system messages `system_01`, prefers gender/age/role compatibility, gives protagonists hero slots when available, avoids sharing exclusive slots between major characters, and never invents provider voice IDs.

## Identity and aliases

`resolveCharacterAlias` normalizes punctuation, honorifics, titles and Ukrainian/Russian transliteration differences. Exact aliases are high confidence. Risky one-token surname/given-name matches are not merged automatically and require admin confirmation.

## Merge workflow

Voice Studio exposes duplicate merge controls. Admins must explicitly confirm a permanent merge. The intended safe flow is: review source and target characters, aliases, affected chapters and segments, compare cast assignments, move segments to the target, preserve the target cast row, delete the duplicate cast row, and add an audit entry. Manually verified metadata should be reviewed rather than silently discarded.

## Locking

Locked cast rows are preserved during re-analysis and validation warnings are shown instead of overwriting admin corrections.

## Validation warnings

Validation checks include multiple slots for one character, exclusive slots shared by several major characters, incompatible age/profile combinations, narrator segments assigned to character voices, locked cast/profile mismatches and missing cast records.

## Offline caching

Downloaded chapters include cast metadata with `OFFLINE_RECORD_VERSION` and `OFFLINE_CAST_CACHE_VERSION`. Reader fallback works when metadata is missing; Device Voice remains available.

## Future provider mapping

`resolveProviderVoice` supports provider-independent mappings for OpenAI, ElevenLabs, Azure, Google, local speaker IDs and cloned voice IDs. Phase 2 returns `provider_voice_not_configured` unless an admin mapping already exists. No provider is called.

## Future voice cloning requirements

Voice cloning is not implemented. Future support must require owner consent, recording source, consent timestamp, identity and rights confirmation, prohibited impersonation checks, sample quality review, model/provider reference, deletion process and audit history. Do not add celebrity, public figure or unauthorized presets.

## Limitations

Browser SpeechSynthesis can approximate pitch and rate only. It cannot create real timbre, roughness, cloned voices or actor-level emotional performance.

## Director usage

Persistent cast assignments are reused by the Voice Director as stable `castSlot` and `voiceProfile` inputs. Manual cast locks remain authoritative. Director regeneration preserves manually edited segment performance where possible and does not replace Phase 2 cast memory.

## Character memory integration

Persistent cast entries can be informed by AI Brain character profiles and append-only timeline states. Alias changes are reviewed before merge when confidence is low.
