# NovelVerse Voice Engine — Phase 1

## Architecture
Phase 1 adds a provider-independent voice analysis layer. It does not call paid LLM or TTS providers and does not store provider secrets in frontend code. The pipeline is:

1. Admin opens a chapter in Voice Studio.
2. The deterministic parser strips unsafe markup and segments chapter text.
3. Speaker resolution uses attribution, known `voice_characters`, aliases, cautious pronouns, and local textual evidence.
4. Character inference creates preliminary profiles only when descriptors are explicit.
5. Emotion detection assigns an emotion, intensity, and confidence.
6. Admin can save or correct `chapter_voice_segments`.
7. Reader can optionally preview structured segments with browser Device Voice pitch/rate approximations.

## Parser stages
- Sanitize HTML by removing script/style and tags while keeping paragraph boundaries.
- Detect language as Ukrainian, Russian, or English.
- Apply language-specific rules from separate files under `src/lib/voiceEngine/rules/`.
- Split paragraphs in source order.
- Classify system messages, thoughts, em-dash dialogue, quoted dialogue, and narration.
- Preserve the original sentence text after markup stripping; the parser never invents missing sentences.

## Speaker resolution
Resolution is intentionally conservative:
- Exact known character names and aliases win.
- Nearby attribution phrases such as `сказав старий`, `відповіла дівчина`, `прошепотів Лін Фань`, and equivalent Russian/English forms are considered.
- Pronouns may inherit a previous active speaker only when that speaker was already high-confidence.
- Dialogue alternation is not treated as proof.
- Low-confidence speakers remain unresolved with `speakerId: null` and `unknown_neutral`.

## Character inference
Characters are inferred only from supported textual descriptors, for example:
- `старий`, `літній чоловік`, `старик` → elderly male.
- `стара жінка`, `бабуся`, `старуха` → elderly female.
- `хлопчик`, `мальчик`, `boy` → male child.
- `дівчинка`, `девочка`, `girl` → female child.
- `юнак`, `молодий чоловік`, `young man` → young male.
- `дівчина`, `молода жінка`, `young woman` → young female.
- `система`, `system` → system role.
- `монстр`, `демон`, `звір`, `monster`, `demon`, `beast` → creature only when explicit.

Names alone do not imply age or gender unless an admin manually configures a character.

## Voice profiles
`src/lib/voiceEngine/voiceProfiles.js` defines abstract profiles with id, label, gender, age group, base pitch, base rate, roughness, brightness, energy, and description. They are control hints, not cloned voices.

## Emotion detection
Rules inspect attribution verbs, punctuation, capitalization-like emphasis, ellipses, and nearby narrative context. Examples:
- `закричав`, `люто`, `гнівно` → angry.
- `прошепотів`, `налякано`, `тремтячи` → afraid or mysterious by context.
- `засміялася`, `радісно` → happy.
- `сумно`, `заплакав` → sad.
- `твердо`, `рішуче`, `не відступлю` → determined.
- `здивовано` → surprised.

Exclamation marks raise intensity but do not automatically mean anger.

## Confidence handling
Every segment has confidence from 0 to 1. Speaker confidence and emotion confidence are combined conservatively. Admin changes set `manually_edited` and should be treated as authoritative.

## Admin workflow
- Open a chapter edit page and use Voice Studio.
- Run local preview for immediate deterministic results.
- Run server analysis to persist characters and segments.
- Filter unresolved speakers, bulk assign speaker or profile, preview with Device Voice, then save corrections.
- Manage novel-level characters from the admin character page.

## Browser preview limitations
SpeechSynthesis can adjust pitch and rate only. It cannot create real timbre, roughness, brightness, cloned voices, or consistent multi-speaker casting across devices. The structured preview is development-safe and falls back to standard Device Voice when segments are missing.

## Offline and caching
Reading a chapter never requires analysis. Standard narration still works with plain chapter sentences. Downloaded chapters continue to store text; future analysis cache invalidation should sync edited segment timestamps to offline records. No future audio files are downloaded in Phase 1.

## Security model
- No TTS provider keys are introduced.
- React only uses the public Supabase client and authenticated Edge Function calls.
- The Edge Function verifies the user and admin role server-side before using service-role access.
- New tables use RLS: public reads metadata, admins write.
- Chapter markup is sanitized and analysis has a maximum size limit.

## Known limitations
- Heuristic parsing will miss ambiguous or stylistic dialogue.
- Pronouns are intentionally conservative and may leave speakers unresolved.
- Language detection is simple.
- Merging duplicate characters is a guided admin workflow, not a fully automatic destructive operation.

## Future enhancements
- Optional LLM-assisted review after deterministic parsing.
- Real multi-voice TTS provider integration through server-side provider adapters.
- Timestamp alignment and audio manifest generation.
- Offline segment cache migrations with stale-analysis invalidation.

## Phase 2 persistent cast

Voice Engine Phase 2 adds a novel-level cast memory. Chapter analysis can continue to produce narration, dialogue, thought and system segments, but recurring characters now resolve through `novel_voice_cast` so the same canonical character keeps the same abstract cast slot across chapters. Manual locks and existing assignments are preserved during re-analysis.

See `VOICE_CAST.md` for the full architecture, slot catalog, alias handling, merge workflow and validation rules.
