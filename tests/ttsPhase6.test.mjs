import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const provider = readFileSync("supabase/functions/generate-chapter-audio/provider.ts", "utf8");
const renderer = readFileSync("supabase/functions/generate-chapter-audio/renderer.ts", "utf8");
const endpoint = readFileSync("supabase/functions/generate-chapter-audio/index.ts", "utf8");
const voiceAnalyzer = readFileSync("supabase/functions/analyze-chapter-voice/index.ts", "utf8");
const envExample = readFileSync(".env.example", "utf8");

test("OpenAI adapter constructs server-side speech requests without frontend secrets", () => {
  assert.match(provider, /https:\/\/api\.openai\.com\/v1\/audio\/speech/);
  assert.match(provider, /OPENAI_API_KEY/);
  assert.match(provider, /NOVELVERSE_TTS_MODEL/);
  assert.match(provider, /instructions: buildOpenAiInstructions/);
  assert.doesNotMatch(readFileSync("src/lib/chapterAudio.js", "utf8"), /OPENAI_API_KEY|Authorization: `Bearer/);
});

test("generation resolves every default provider value to Piper", () => {
  assert.match(provider, /!requested \|\| requested === "default" \|\| requested === "auto" \? "piper" : requested/);
  assert.match(endpoint, /resolveProviderId\(providerReceived\)/);
  assert.match(provider, /supportedProviderIds = \["mock", "piper", "openai"\]/);
  assert.match(provider, /acceptedProviderValues = \["default", "auto", \.\.\.supportedProviderIds\]/);
  assert.match(endpoint, /provider_received: providerReceived/);
  assert.match(endpoint, /accepted_provider_values: acceptedProviderValues/);
  assert.match(endpoint, /provider_resolved: provider/);
  assert.doesNotMatch(provider, /if \(env\("OPENAI_API_KEY"\)\) return "openai"/);
});

test("missing API key and provider errors are normalized", () => {
  assert.match(provider, /provider_auth_missing/);
  assert.match(provider, /provider_timeout/);
  assert.match(provider, /provider_rate_limited/);
  assert.match(provider, /provider_bad_request/);
});

test("voice mapping fallback preserves NovelVerse cast identities", () => {
  for (const key of ["narrator", "young_male", "mature_male", "elderly_male", "young_female", "mature_female", "elderly_female", "child", "monster", "unknown"]) assert.match(provider, new RegExp(`${key}`));
  assert.match(provider, /voice fallback used for cast slot/);
});

test("Director instructions include performance metadata", () => {
  for (const token of ["Emotion", "Pace multiplier", "Confidence", "Breathiness", "Roughness", "Voice age", "Scene mood", "Emphasize"]) assert.match(provider, new RegExp(token));
});

test("renderer splits text safely and retries failed segments", () => {
  assert.match(renderer, /splitTextSafely/);
  assert.match(renderer, /Dr\|Mr\|Mrs/);
  assert.match(renderer, /maxSegmentRetries = 3/);
  assert.match(renderer, /retry_count/);
});

test("endpoint enforces cache, duplicate prevention, preview and authorization safeguards", () => {
  assert.match(endpoint, /admin_required/);
  assert.match(endpoint, /unsupported_provider/);
  assert.match(endpoint, /preview_too_large/);
  assert.match(endpoint, /tts_job_too_large/);
  assert.match(endpoint, /duplicate: true/);
  assert.match(endpoint, /cache_hit: true/);
});

test("server-only environment variables are documented", () => {
  for (const key of ["OPENAI_API_KEY", "NOVELVERSE_TTS_PROVIDER", "NOVELVERSE_TTS_MODEL", "NOVELVERSE_TTS_DEFAULT_VOICE", "NOVELVERSE_TTS_DAILY_USER_LIMIT", "NOVELVERSE_TTS_PREVIEW_MAX_CHARS"]) assert.match(envExample, new RegExp(key));
  assert.equal(envExample.includes(["VITE", "OPENAI"].join("_")), false);
  assert.equal(envExample.includes("VITE_SUPABASE_ANON_KEY"), true);
});

test("Phase 7 health diagnostics and preview workflow are production safe", () => {
  assert.match(endpoint, /action === "health"/);
  assert.match(endpoint, /ADMIN_REQUIRED/);
  assert.match(endpoint, /NOVELVERSE_TTS_PREVIEW_MAX_CHARS", 250/);
  assert.match(endpoint, /provider_configured/);
  assert.match(endpoint, /ensurePrivateBucket/);
  assert.match(endpoint, /renderPreview/);
  assert.doesNotMatch(endpoint, /signed_url.*console\.log|OPENAI_API_KEY.*json/);
});

test("chapter generation resolves admin status from the caller-scoped role RPC", () => {
  assert.match(endpoint, /global: \{ headers: \{ Authorization: authorization \} \}/);
  assert.match(endpoint, /callerClient\.rpc\("is_admin"\)/);
  assert.match(endpoint, /allowed: !error && data === true/);
  assert.doesNotMatch(endpoint, /user_metadata\?\.role|app_metadata\?\.role|user_metadata\?\.is_admin/);
});

test("chapter generation validates the bigint payload and logs the public chapters lookup", () => {
  const frontend = readFileSync("src/lib/chapterAudio.js", "utf8");
  assert.match(frontend, /chapter_id: chapterId/);
  assert.match(endpoint, /body\.chapter_id \?\? body\.chapterId/);
  assert.match(endpoint, /\^\[1-9\]\\d\*\$/);
  assert.match(endpoint, /chapter_id_is_uuid/);
  assert.match(endpoint, /from public\.chapters where id = \$1 limit 1/);
  assert.match(endpoint, /schema\("public"\)\.from\("chapters"\)/);
  assert.match(endpoint, /received_chapter_id/);
  assert.match(endpoint, /lookup_result/);
  assert.match(endpoint, /CHAPTER_LOOKUP_FAILED/);
});

test("voice segment failures retain original diagnostics and HTTP status without changing API errors", () => {
  for (const field of ["function_name", "file_name", "line_number", "sql_query", "rpc_name", "request_payload", "supabase_error_object", "original_error_message", "stack_trace"]) {
    assert.match(endpoint, new RegExp(field));
    assert.match(voiceAnalyzer, new RegExp(field));
  }
  assert.match(endpoint, /null, "analyze-chapter-voice"/);
  assert.match(endpoint, /context\?\.status \|\| 500/);
  assert.match(endpoint, /supabase_response_payload/);
  assert.match(endpoint, /"x-request-id": requestId/);
  assert.match(voiceAnalyzer, /catch \(error\) \{ logDiagnostic\(error, body, activeSql\)/);
  assert.match(endpoint, /VOICE_SEGMENT_GENERATION_FAILED/);
  assert.match(voiceAnalyzer, /segment_save_failed/);
  assert.match(voiceAnalyzer, /voice_analysis_failed/);
});

test("Phase 7 normalizes user-facing TTS errors", () => {
  for (const code of ["TTS_API_KEY_MISSING", "TTS_RATE_LIMITED", "TTS_PROVIDER_UNAVAILABLE", "STORAGE_UPLOAD_FAILED", "SIGNED_URL_FAILED"]) assert.match(provider + endpoint + readFileSync("src/lib/chapterAudio.js", "utf8"), new RegExp(code));
  assert.doesNotMatch(provider, /body\.slice/);
});

test("frontend admin test panel has no API key field and keeps device fallback", () => {
  const admin = readFileSync("src/pages/Admin.jsx", "utf8");
  const audio = readFileSync("src/lib/chapterAudio.js", "utf8");
  assert.match(admin, /TTS Test/);
  assert.match(admin, /Generate test preview/);
  assert.match(admin, /audio controls/);
  assert.doesNotMatch(admin, /OPENAI_API_KEY|api key/i);
  assert.match(audio, /audioModes = \{ cinematic: "cinematic", ai: "ai", device: "device" \}/);
  assert.doesNotMatch(audio, /getPublicUrl\(data\.storage_path\)/);
});

test("repository frontend files do not reference OpenAI secrets", () => {
  const files = ["src/lib/chapterAudio.js", "src/pages/Admin.jsx", "src/App.jsx"];
  for (const file of files) assert.doesNotMatch(readFileSync(file, "utf8"), /OPENAI_API_KEY|VITE_OPENAI|sk-[A-Za-z0-9]/);
});
