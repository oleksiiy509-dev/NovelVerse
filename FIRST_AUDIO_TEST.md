# First Real Audio Test

This workflow makes one short paid provider request. Do not run it in automated tests.

## Admin panel

1. Sign in as an admin.
2. Open `/admin` and locate **TTS Test**.
3. Confirm provider, model, default voice, storage, and database diagnostics.
4. Enter fewer than 250 characters.
5. Choose one voice and click **Generate test preview**.
6. Play the returned preview, then click **Clear preview**.

Preview files are stored under `previews/<user-id>/<request-id>.mp3` in the private `chapter-audio` bucket with expiry metadata. Full chapter cache rows are not created by this preview path.

## Authenticated curl template

```bash
SUPABASE_URL=https://<project-ref>.supabase.co
ANON_KEY=<supabase-anon-key>
ACCESS_TOKEN=<admin-user-jwt>

curl -sS "$SUPABASE_URL/functions/v1/generate-chapter-audio" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action":"preview","text":"NovelVerse first production voice preview.","voice":"alloy","language":"en"}'
```

Expected success shape:

```json
{"status":"preview_ready","provider":"openai","model":"<model>","audio":{"storage_path":"previews/...mp3","signed_url":"https://..."}}
```

Expected configuration error shape:

```json
{"status":"failed","error":{"code":"TTS_API_KEY_MISSING","message":"TTS server configuration is incomplete."}}
```
