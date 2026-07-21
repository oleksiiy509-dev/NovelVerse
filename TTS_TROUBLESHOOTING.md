# TTS Troubleshooting

| Code | Meaning | Action |
| --- | --- | --- |
| `TTS_PROVIDER_NOT_CONFIGURED` | Provider secret is missing. | Set `NOVELVERSE_TTS_PROVIDER=openai` or `mock`. |
| `TTS_API_KEY_MISSING` | Server has no provider key. | Run `supabase secrets set OPENAI_API_KEY=<openai-api-key>`. |
| `UNSUPPORTED_TTS_PROVIDER` | Provider name is unknown. | Use `openai` or `mock`. |
| `TTS_MODEL_NOT_CONFIGURED` | Model secret is missing. | Set `NOVELVERSE_TTS_MODEL=<tts-model>`. |
| `TTS_RATE_LIMITED` | Provider returned rate limiting. | Wait or lower request volume. |
| `TTS_PROVIDER_UNAVAILABLE` | Provider failed or timed out. | Retry later and check Edge Function logs. |
| `TEXT_TOO_LONG` | Preview or chapter exceeds limits. | Shorten text or raise server-side limits. |
| `STORAGE_UPLOAD_FAILED` | Audio could not be uploaded. | Verify private `chapter-audio` bucket and service role. |
| `SIGNED_URL_FAILED` | Playback link could not be created. | Check storage policies and bucket privacy. |
| `UNAUTHORIZED` | No valid session token. | Sign in again. |
| `ADMIN_REQUIRED` | User is not admin. | Add admin metadata or configured admin email. |

Technical details are logged server-side with `request_id`, `user_id`, `job_id`, preview/full mode, provider, model, character and segment counts, status, error code, and duration. Logs must not contain API keys, bearer tokens, full text, provider response bodies, or signed URLs.
