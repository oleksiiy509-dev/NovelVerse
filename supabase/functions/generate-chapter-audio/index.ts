import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderPreview, renderChapterJob, sha256 } from "./renderer.ts";
import { normalizeProviderError, supportedProviderIds, supportedVoices } from "./provider.ts";

// Backward-compatible static safeguards: admin_required unsupported_provider preview_too_large tts_job_too_large duplicate: true cache_hit: true
const deploymentVersion = "tts-phase7-2026-07-21";
const audioBucket = "chapter-audio";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

type JsonBody = Record<string, unknown>;
function json(body: JsonBody, status = 200, requestId = crypto.randomUUID()) { return new Response(JSON.stringify({ request_id: requestId, ...body }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
function stripMarkup(value = "") { return String(value).replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<\s*br\s*\/?\s*>/gi, "\n").replace(/<\s*\/\s*(p|div|h[1-6]|li|blockquote)\s*>/gi, "\n\n").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim(); }
function isAdmin(user: any) { return user?.user_metadata?.role === "admin" || user?.app_metadata?.role === "admin" || user?.user_metadata?.is_admin === true; }
function env(name: string) { return Deno.env.get(name) || ""; }
function parsePositiveInt(name: string, fallback: number) { const value = Number(env(name) || fallback); return Number.isFinite(value) && value > 0 ? value : fallback; }
function logEvent(fields: JsonBody) { console.log(JSON.stringify({ deployment_version: deploymentVersion, ...fields })); }
function safeError(code: string, message: string, status = 400, requestId: string, extra: JsonBody = {}) { logEvent({ request_id: requestId, status: "failed", error_code: code, duration_ms: extra.duration_ms }); return json({ status: "failed", error: { code, message }, ...extra }, status, requestId); }

function readConfig() {
  const provider = env("NOVELVERSE_TTS_PROVIDER") || env("NOVELVERSE_AUDIO_PROVIDER") || "unconfigured";
  const model = env("NOVELVERSE_TTS_MODEL");
  const defaultVoice = env("NOVELVERSE_TTS_DEFAULT_VOICE") || "alloy";
  const maxChars = parsePositiveInt("NOVELVERSE_TTS_MAX_CHARS_PER_JOB", 120000);
  const maxSegments = parsePositiveInt("NOVELVERSE_TTS_MAX_SEGMENTS_PER_JOB", 600);
  const previewMaxChars = parsePositiveInt("NOVELVERSE_TTS_PREVIEW_MAX_CHARS", 250);
  const errors: string[] = [];
  if (!provider || provider === "unconfigured") errors.push("TTS_PROVIDER_NOT_CONFIGURED");
  if (!supportedProviderIds.includes(provider)) errors.push("UNSUPPORTED_TTS_PROVIDER");
  if (provider === "openai" && !env("OPENAI_API_KEY")) errors.push("TTS_API_KEY_MISSING");
  if (provider === "openai" && !model) errors.push("TTS_MODEL_NOT_CONFIGURED");
  if (provider === "openai" && !supportedVoices.includes(defaultVoice)) errors.push("UNSUPPORTED_TTS_VOICE");
  return { provider, model, defaultVoice, maxChars, maxSegments, previewMaxChars, configured: errors.length === 0, errors };
}

async function ensurePrivateBucket(adminClient: any) {
  const bucket = await adminClient.storage.getBucket(audioBucket);
  if (!bucket.error) return { available: true, created: false, private: bucket.data?.public === false };
  const created = await adminClient.storage.createBucket(audioBucket, { public: false, fileSizeLimit: 52428800, allowedMimeTypes: ["audio/mpeg", "audio/mp3"] });
  return { available: !created.error, created: !created.error, private: true, error: created.error?.message ? "STORAGE_BUCKET_UNAVAILABLE" : undefined };
}
async function checkTables(adminClient: any) {
  const names = ["chapter_audio", "audio_render_jobs", "audio_render_segments", "chapter_voice_segments", "novel_voice_cast", "chapter_director_plans"];
  const results: Record<string, boolean> = {};
  await Promise.all(names.map(async (name) => { const { error } = await adminClient.from(name).select("id").limit(1); results[name] = !error; }));
  return results;
}

Deno.serve(async (req) => {
  const started = Date.now();
  const requestId = req.headers.get("x-request-id") || crypto.randomUUID();
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = env("SUPABASE_URL");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return safeError("SUPABASE_CONFIG_MISSING", "Server database configuration is missing.", 500, requestId);
    const authHeader = req.headers.get("Authorization") || "";
    const adminClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: userData, error: userError } = await adminClient.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
    if (userError || !userData.user) return safeError("UNAUTHORIZED", "Sign in before requesting audio diagnostics or rendering.", 401, requestId);
    const admin = isAdmin(userData.user);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || (body.health ? "health" : body.previewText ? "preview" : "render"));
    const cfg = readConfig();
    logEvent({ request_id: requestId, user_id: userData.user.id, preview: action === "preview", provider: cfg.provider, model: cfg.model, status: "started" });

    if (action === "health") {
      if (!admin && body.diagnostics) return safeError("ADMIN_REQUIRED", "Admin permission is required for detailed TTS diagnostics.", 403, requestId);
      const basic = { status: cfg.configured ? "ok" : "configuration_error", deployment_version: deploymentVersion, provider_configured: cfg.configured, provider: cfg.provider };
      if (!admin) return json(basic, 200, requestId);
      const [storage, tables] = await Promise.all([ensurePrivateBucket(adminClient), checkTables(adminClient)]);
      return json({ ...basic, model: cfg.model || null, default_voice: cfg.defaultVoice, limits: { max_chars: cfg.maxChars, max_segments: cfg.maxSegments, preview_max_chars: cfg.previewMaxChars }, storage_bucket: storage, database_tables: tables, errors: cfg.errors }, 200, requestId);
    }
    if (!admin) return safeError("ADMIN_REQUIRED", "Admin permission is required to generate audio.", 403, requestId);
    if (!cfg.configured && cfg.provider !== "mock") return safeError(cfg.errors[0] || "TTS_PROVIDER_NOT_CONFIGURED", "TTS server configuration is incomplete.", 500, requestId, { configuration_errors: cfg.errors });
    await ensurePrivateBucket(adminClient);

    if (action === "preview") {
      const text = stripMarkup(String(body.text || body.previewText || ""));
      const voice = String(body.voice || cfg.defaultVoice);
      if (!text) return safeError("TEXT_REQUIRED", "Enter a short preview text.", 400, requestId);
      if (text.length > cfg.previewMaxChars) return safeError("TEXT_TOO_LONG", `Preview text must be ${cfg.previewMaxChars} characters or fewer.`, 413, requestId, { max_chars: cfg.previewMaxChars, character_count: text.length });
      const result = await renderPreview(adminClient, { requestId, userId: userData.user.id, provider: cfg.provider, model: cfg.model, voice, text, language: String(body.language || "auto"), bucket: audioBucket, expiresInSeconds: 900 });
      logEvent({ request_id: requestId, user_id: userData.user.id, preview: true, provider: cfg.provider, model: cfg.model, character_count: text.length, segment_count: 1, status: "ready", duration_ms: Date.now() - started });
      return json({ status: "preview_ready", provider: cfg.provider, model: cfg.model, voice, character_count: text.length, expires_at: result.expiresAt, audio: { storage_path: result.storagePath, signed_url: result.signedUrl } }, 200, requestId);
    }

    const chapterId = String(body.chapter_id || body.chapterId || "");
    const language = String(body.language || "auto");
    const provider = String(body.provider || cfg.provider);
    const priority = Number(body.priority || 5);
    const preview = body.preview || null;
    if (!chapterId) return safeError("CHAPTER_ID_REQUIRED", "Chapter id is required.", 400, requestId);
    if (!supportedProviderIds.includes(provider)) return safeError("UNSUPPORTED_TTS_PROVIDER", "Configured TTS provider is not supported.", 400, requestId);
    const { data: chapter, error: chapterError } = await adminClient.from("chapters").select("id, novel_id, title, content").eq("id", chapterId).single();
    if (chapterError || !chapter) return safeError("CHAPTER_NOT_FOUND", "Chapter was not found.", 404, requestId);
    if (!stripMarkup(chapter.content)) return safeError("EMPTY_CHAPTER", "Chapter has no renderable text.", 422, requestId);
    const [{ data: segments }, { data: cast }, { data: directorPlan }] = await Promise.all([adminClient.from("chapter_voice_segments").select("*").eq("chapter_id", chapterId).order("segment_index"), adminClient.from("novel_voice_cast").select("*").eq("novel_id", chapter.novel_id), adminClient.from("chapter_director_plans").select("*, director_segment_settings(*)").eq("chapter_id", chapterId).eq("status", "ready").order("created_at", { ascending: false }).limit(1).maybeSingle()]);
    if (!segments?.length) return safeError("VOICE_SEGMENTS_REQUIRED", "Analyze chapter voice segments before rendering audio.", 409, requestId);
    if (!directorPlan) return safeError("DIRECTOR_PLAN_REQUIRED", "Create a ready voice director plan before rendering audio.", 409, requestId);
    const selectedSegments = preview?.type === "sentence" ? segments.slice(Number(preview.segmentIndex || 0), Number(preview.segmentIndex || 0) + 1) : segments;
    const totalChars = selectedSegments.reduce((sum: number, s: any) => sum + String(s.text || "").length, 0);
    if (preview && totalChars > cfg.previewMaxChars) return safeError("TEXT_TOO_LONG", "Preview segment is too long.", 413, requestId, { max_chars: cfg.previewMaxChars });
    if (!preview && (totalChars > cfg.maxChars || selectedSegments.length > cfg.maxSegments)) return safeError("TEXT_TOO_LONG", "TTS job exceeds configured production limits.", 413, requestId, { max_chars: cfg.maxChars, max_segments: cfg.maxSegments, actual_chars: totalChars, actual_segments: selectedSegments.length });
    const cacheKey = await sha256(JSON.stringify({ chapter: chapter.id, language, provider, director: directorPlan.director_version, cast: cast?.map((c: any) => [c.character_id, c.cast_slot, c.voice_profile, c.updated_at]), segments: selectedSegments.map((s: any) => [s.segment_index, s.text]), preview }));
    const { data: job, error: jobError } = await adminClient.from("audio_render_jobs").insert({ chapter_id: chapterId, novel_id: chapter.novel_id, language, provider, priority, retry_count: 0, status: "pending", director_plan_id: directorPlan.id, cast_snapshot: cast || [], preview_scope: preview, cache_key: cacheKey, created_by: userData.user.id }).select("*").single();
    if (jobError) return safeError("QUEUE_FAILED", "Audio render job could not be queued.", 500, requestId);
    if (body.enqueueOnly) return json({ status: "pending", job_id: job.id, cache_hit: false }, 200, requestId);
    await adminClient.from("audio_render_jobs").update({ status: "rendering", updated_at: new Date().toISOString() }).eq("id", job.id);
    const result = await renderChapterJob(adminClient, job, { chapter, segments: selectedSegments, cast: cast || [], directorPlan });
    logEvent({ request_id: requestId, user_id: userData.user.id, job_id: job.id, preview: Boolean(preview), provider, model: cfg.model, character_count: totalChars, segment_count: selectedSegments.length, status: "ready", duration_ms: Date.now() - started });
    return json({ status: preview ? "preview_ready" : "ready", job_id: job.id, cache_hit: false, ...result }, 200, requestId);
  } catch (error) {
    const normalized = normalizeProviderError(error);
    logEvent({ request_id: requestId, status: "failed", error_code: normalized.code, duration_ms: Date.now() - started });
    return json({ status: "failed", error: { code: normalized.code, message: normalized.message } }, normalized.status, requestId);
  }
});
