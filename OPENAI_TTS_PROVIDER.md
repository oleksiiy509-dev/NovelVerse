# OpenAI TTS Provider

NovelVerse Phase 6 adds an `openai` server-side adapter in `supabase/functions/generate-chapter-audio/provider.ts`. The adapter reads `OPENAI_API_KEY`, `NOVELVERSE_TTS_MODEL`, `NOVELVERSE_TTS_DEFAULT_VOICE`, timeout and retry settings only from Supabase Edge Function secrets.

## Voice mapping

Default NovelVerse profile mapping: narrator→alloy, young_male→echo, mature_male/elderly_male/monster→onyx, young_female→nova, mature_female→shimmer, elderly_female→sage, child→fable, unknown→alloy. Override with `NOVELVERSE_TTS_OPENAI_VOICE_MAP` JSON in Edge secrets.

## Instructions

The adapter converts Director emotion, intensity, pace, confidence, breathiness, roughness, voice age, scene mood and emphasis into provider instructions. React never builds provider-specific prompts.

## Errors

Errors are normalized as provider_auth_missing, provider_timeout, provider_rate_limited, provider_bad_request or provider_error. Logs redact bearer tokens and do not include full chapter text.
