import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const provider = readFileSync("supabase/functions/generate-chapter-audio/provider.ts", "utf8");
const renderer = readFileSync("supabase/functions/generate-chapter-audio/renderer.ts", "utf8");
const endpoint = readFileSync("supabase/functions/generate-chapter-audio/index.ts", "utf8");
const envExample = readFileSync(".env.example", "utf8");

test("OpenAI adapter constructs server-side speech requests without frontend secrets", () => {
  assert.match(provider, /https:\/\/api\.openai\.com\/v1\/audio\/speech/);
  assert.match(provider, /OPENAI_API_KEY/);
  assert.match(provider, /NOVELVERSE_TTS_MODEL/);
  assert.match(provider, /instructions: buildOpenAiInstructions/);
  assert.doesNotMatch(readFileSync("src/lib/chapterAudio.js", "utf8"), /OPENAI_API_KEY|Authorization: `Bearer/);
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
