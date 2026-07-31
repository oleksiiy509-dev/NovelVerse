import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderPreview, renderChapterJob, sha256 } from "./renderer.ts";
import { acceptedProviderValues, normalizeProviderError, resolveProviderId, supportedProviderIds, supportedVoices } from "./provider.ts";
import { directChapterPerformance, validateDirectorPlan } from "../../../src/lib/voiceDirector/director.js";

// Backward-compatible static safeguards: admin_required unsupported_provider preview_too_large tts_job_too_large duplicate: true cache_hit: true
const deploymentVersion = "tts-phase7-2026-07-21";
const audioBucket = "chapter-audio";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

type JsonBody = Record<string, unknown>;
function json(body: JsonBody, status = 200, requestId = crypto.randomUUID()) { return new Response(JSON.stringify({ request_id: requestId, ...body }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
function stripMarkup(value = "") { return String(value).replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<\s*br\s*\/?\s*>/gi, "\n").replace(/<\s*\/\s*(p|div|h[1-6]|li|blockquote)\s*>/gi, "\n\n").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim(); }
function env(name: string) { return Deno.env.get(name) || ""; }
function parsePositiveInt(name: string, fallback: number) { const value = Number(env(name) || fallback); return Number.isFinite(value) && value > 0 ? value : fallback; }
function logEvent(fields: JsonBody) { console.log(JSON.stringify({ deployment_version: deploymentVersion, ...fields })); }
function sourceLocation(stack: string | null, fallbackFile: string) {
  const frame = stack?.split("\n").find((line) => line.includes(".ts:"));
  const match = frame?.match(/(?:file:\/\/)?([^\s()]+\.ts):(\d+):(\d+)/);
  return { file_name: match?.[1] || fallbackFile, line_number: match ? Number(match[2]) : null };
}
async function logVoiceSegmentDiagnostic(error: unknown, requestId: string, requestPayload: JsonBody, sqlQuery: string | null, rpcName: string | null) {
  const value = error as { message?: string; stack?: string; code?: string; details?: string; hint?: string; context?: Response } | null;
  const stack = value?.stack || new Error().stack || null;
  const location = sourceLocation(stack, "supabase/functions/generate-chapter-audio/index.ts");
  let responsePayload: unknown = null;
  if (value?.context instanceof Response) {
    const responseText = await value.context.clone().text().catch(() => "");
    if (responseText) {
      try { responsePayload = JSON.parse(responseText); } catch { responsePayload = responseText; }
    }
  }
  const responseError = responsePayload && typeof responsePayload === "object" ? responsePayload as { error?: unknown; message?: unknown } : null;
  const supabaseError = value ? { ...value, name: error instanceof Error ? error.name : null, message: value.message || String(error), code: value.code || null, details: value.details || null, hint: value.hint || null } : error;
  console.error(JSON.stringify({ deployment_version: deploymentVersion, request_id: requestId, function_name: "generate-chapter-audio", ...location, sql_query: sqlQuery, rpc_name: rpcName, request_payload: requestPayload, supabase_error_object: supabaseError, supabase_response_status: value?.context?.status || null, supabase_response_payload: responsePayload, original_error_message: responseError?.message || responseError?.error || value?.message || String(error), stack_trace: stack }));
}
function safeError(code: string, message: string, status = 400, requestId: string, extra: JsonBody = {}) { logEvent({ request_id: requestId, status: "failed", error_code: code, duration_ms: extra.duration_ms }); return json({ status: "failed", error: { code, message }, ...extra }, status, requestId); }
function normalizeChapterId(value: unknown) {
  const received = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  // public.chapters.id is bigint in the production schema. A UUID here is a
  // book/user identifier and must not be used to look up a chapter.
  return { received, valid: /^[1-9]\d*$/.test(received), isUuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(received) };
}

async function resolveAdmin(supabaseUrl: string, apiKey: string, authorization: string) {
  const callerClient = createClient(supabaseUrl, apiKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await callerClient.rpc("is_admin");
  return { allowed: !error && data === true, error };
}

function readConfig() {
  const provider = resolveProviderId(env("NOVELVERSE_TTS_PROVIDER") || env("NOVELVERSE_AUDIO_PROVIDER"));
  const model = env("NOVELVERSE_TTS_MODEL") || (env("OPENAI_API_KEY") ? "gpt-4o-mini-tts" : "");
  const defaultVoice = env("NOVELVERSE_TTS_DEFAULT_VOICE") || "alloy";
  const maxChars = parsePositiveInt("NOVELVERSE_TTS_MAX_CHARS_PER_JOB", 120000);
  const maxSegments = parsePositiveInt("NOVELVERSE_TTS_MAX_SEGMENTS_PER_JOB", 600);
  const previewMaxChars = parsePositiveInt("NOVELVERSE_TTS_PREVIEW_MAX_CHARS", 250);
  const errors: string[] = [];
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

async function createDirectorPlan(adminClient: any, chapter: any, segments: any[], cast: any[], createdBy: string) {
  const { data: characters, error: characterError } = await adminClient.from("voice_characters").select("*").eq("novel_id", chapter.novel_id);
  if (characterError) throw characterError;
  const plan = directChapterPerformance({ chapterId: chapter.id, novelId: chapter.novel_id, segments, cast, characters: characters || [] });
  const validationWarnings = validateDirectorPlan(plan, segments);
  if (validationWarnings.length) throw new Error(`DIRECTOR_PLAN_INVALID: ${validationWarnings.join(" ")}`);

  // A plan is not made renderable until its scenes and segment settings have
  // all been persisted. This preserves the existing ready-plan validation.
  const { data: savedPlan, error: planError } = await adminClient.from("chapter_director_plans").insert({
    chapter_id: chapter.id, novel_id: chapter.novel_id, analysis_version: segments[0]?.analysis_version || null,
    director_version: plan.version, language: plan.language, scene_count: plan.statistics.sceneCount,
    total_segments: plan.statistics.totalSegments, average_intensity: plan.statistics.averageIntensity,
    status: "draft", warnings: plan.warnings, statistics: plan.statistics, content_hash: plan.contentHash,
    manually_edited: false, created_by: createdBy,
  }).select("*").single();
  if (planError) throw planError;
  const sceneRows = plan.scenes.map((scene: any) => ({
    director_plan_id: savedPlan.id, chapter_id: chapter.id, novel_id: chapter.novel_id,
    scene_index: scene.sceneIndex, scene_type: scene.sceneType, title: scene.title,
    start_segment_index: scene.startSegmentIndex, end_segment_index: scene.endSegmentIndex,
    intensity: scene.intensity, pace: scene.pace, atmosphere_profile: scene.atmosphereProfile,
    ambience_volume: scene.ambienceVolume, manually_edited: false,
  }));
  const { data: savedScenes, error: sceneError } = await adminClient.from("director_scenes").insert(sceneRows).select("id, scene_index");
  if (sceneError) throw sceneError;
  const sceneByIndex = new Map((savedScenes || []).map((scene: any) => [scene.scene_index, scene.id]));
  const settingRows = plan.segmentSettings.map((setting: any) => ({
    director_plan_id: savedPlan.id,
    scene_id: sceneByIndex.get(plan.scenes.find((scene: any) => setting.segmentIndex >= scene.startSegmentIndex && setting.segmentIndex <= scene.endSegmentIndex)?.sceneIndex) || null,
    voice_segment_id: setting.voiceSegmentId, segment_index: setting.segmentIndex, cast_slot: setting.castSlot,
    voice_profile: setting.voiceProfile, emotion: setting.emotion, intensity: setting.intensity,
    delivery_style: setting.deliveryStyle, rate: setting.rate, pitch: setting.pitch, energy: setting.energy,
    volume: setting.volume, pause_before_ms: setting.pauseBeforeMs, pause_after_ms: setting.pauseAfterMs,
    emphasis: setting.emphasis, sound_cues: setting.soundCues, manually_edited: false,
  }));
  const { error: settingError } = await adminClient.from("director_segment_settings").insert(settingRows);
  if (settingError) throw settingError;
  const { data: readyPlan, error: readyError } = await adminClient.from("chapter_director_plans").update({ status: "ready" }).eq("id", savedPlan.id).select("*, director_segment_settings(*)").single();
  if (readyError) throw readyError;
  return readyPlan;
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
    // Resolve authorization through the caller-scoped database RPC. user_roles is
    // the source of truth; auth user metadata and editable profiles are not.
    const adminResolution = await resolveAdmin(supabaseUrl, env("SUPABASE_ANON_KEY") || serviceKey, authHeader);
    const admin = adminResolution.allowed;
    if (adminResolution.error) logEvent({ request_id: requestId, user_id: userData.user.id, status: "admin_check_failed", error_code: "ADMIN_LOOKUP_FAILED" });
    const rawRequestBody = await req.text();
    logEvent({ request_id: requestId, raw_request_body: rawRequestBody });
    const body = (() => {
      try { return JSON.parse(rawRequestBody); } catch { return {}; }
    })();
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
    const providerReceived = Object.prototype.hasOwnProperty.call(body, "provider") ? body.provider : null;
    const provider = resolveProviderId(providerReceived);
    logEvent({
      request_id: requestId,
      user_id: userData.user.id,
      status: "provider_validation",
      "request.provider": providerReceived,
      provider_received: providerReceived,
      resolvedProvider: provider,
      provider_resolved: provider,
      supportedProviders: supportedProviderIds,
      accepted_provider_values: acceptedProviderValues,
    });
    if (!supportedProviderIds.includes(provider)) return safeError("UNSUPPORTED_TTS_PROVIDER", "Configured TTS provider is not supported.", 400, requestId, { provider_received: providerReceived });
    if (provider === "openai" && !env("OPENAI_API_KEY")) return safeError("TTS_API_KEY_MISSING", "OpenAI TTS credentials are missing on the server.", 500, requestId);
    await ensurePrivateBucket(adminClient);

    if (action === "preview") {
      const text = stripMarkup(String(body.text || body.previewText || ""));
      const voice = String(body.voice || cfg.defaultVoice);
      if (!text) return safeError("TEXT_REQUIRED", "Enter a short preview text.", 400, requestId);
      if (text.length > cfg.previewMaxChars) return safeError("TEXT_TOO_LONG", `Preview text must be ${cfg.previewMaxChars} characters or fewer.`, 413, requestId, { max_chars: cfg.previewMaxChars, character_count: text.length });
      const result = await renderPreview(adminClient, { requestId, userId: userData.user.id, provider, model: cfg.model, voice, text, language: String(body.language || "auto"), bucket: audioBucket, expiresInSeconds: 900 });
      logEvent({ request_id: requestId, user_id: userData.user.id, preview: true, provider, model: cfg.model, character_count: text.length, segment_count: 1, status: "ready", duration_ms: Date.now() - started });
      return json({ status: "preview_ready", provider, model: cfg.model, voice, character_count: text.length, expires_at: result.expiresAt, audio: { storage_path: result.storagePath, signed_url: result.signedUrl } }, 200, requestId);
    }

    const chapterIdentifier = normalizeChapterId(body.chapter_id ?? body.chapterId);
    const chapterId = chapterIdentifier.received;
    const language = String(body.language || "auto");
    // Older callers use "default" as a voice/provider sentinel. Resolve that
    // sentinel server-side so it cannot be rejected as an unsupported provider.
    const priority = Number(body.priority || 5);
    const preview = body.preview || null;
    logEvent({ request_id: requestId, status: "chapter_lookup_started", received_chapter_id: chapterId, chapter_id_is_uuid: chapterIdentifier.isUuid, sql_query: "select id, novel_id, title, content from public.chapters where id = $1 limit 1", sql_parameters: [chapterId] });
    if (!chapterId) return safeError("CHAPTER_ID_REQUIRED", "Chapter id is required.", 400, requestId);
    if (!chapterIdentifier.valid) return safeError("INVALID_CHAPTER_ID", "Chapter id must be a positive bigint chapter identifier, not a UUID.", 400, requestId, { received_chapter_id: chapterId, chapter_id_is_uuid: chapterIdentifier.isUuid });
    const { data: chapter, error: chapterError } = await adminClient.schema("public").from("chapters").select("id, novel_id, title, content").eq("id", chapterId).maybeSingle();
    logEvent({ request_id: requestId, status: "chapter_lookup_finished", received_chapter_id: chapterId, lookup_result: chapter ? { found: true, chapter_id: chapter.id, novel_id: chapter.novel_id } : { found: false }, lookup_error: chapterError ? { code: chapterError.code, message: chapterError.message } : null });
    if (chapterError) return safeError("CHAPTER_LOOKUP_FAILED", "Chapter lookup failed.", 500, requestId);
    if (!chapter) return safeError("CHAPTER_NOT_FOUND", "Chapter was not found.", 404, requestId);
    if (!stripMarkup(chapter.content)) return safeError("EMPTY_CHAPTER", "Chapter has no renderable text.", 422, requestId);
    const [segmentResult, { data: cast }] = await Promise.all([adminClient.from("chapter_voice_segments").select("*").eq("chapter_id", chapterId).order("segment_index"), adminClient.from("novel_voice_cast").select("*").eq("novel_id", chapter.novel_id)]);
    if (segmentResult.error) await logVoiceSegmentDiagnostic(segmentResult.error, requestId, body, "select * from public.chapter_voice_segments where chapter_id = $1 order by segment_index", null);
    let segments = segmentResult.data;
    if (!segments?.length) {
      const analysisPayload = { chapter_id: chapterId };
      // This is an internal function-to-function call. Forwarding the browser
      // token makes the analyzer re-authorize a user from metadata and can
      // reject an admin already verified through the user_roles RPC above.
      const { error: analysisError } = await adminClient.functions.invoke("analyze-chapter-voice", { body: analysisPayload, headers: { Authorization: `Bearer ${serviceKey}`, "x-request-id": requestId } });
      const analysisStatus = (analysisError as { context?: Response } | null)?.context?.status || 500;
      if (analysisError) await logVoiceSegmentDiagnostic(analysisError, requestId, analysisPayload, null, "analyze-chapter-voice");
      if (!analysisError) ({ data: segments } = await adminClient.from("chapter_voice_segments").select("*").eq("chapter_id", chapterId).order("segment_index"));
      if (analysisError || !segments?.length) {
        if (!analysisError) await logVoiceSegmentDiagnostic(new Error("analyze-chapter-voice completed without persisted chapter voice segments"), requestId, analysisPayload, "select * from public.chapter_voice_segments where chapter_id = $1 order by segment_index", "analyze-chapter-voice");
        return safeError("VOICE_SEGMENT_GENERATION_FAILED", "Chapter voice segments could not be generated.", analysisStatus, requestId);
      }
    }
    let { data: directorPlan, error: directorPlanError } = await adminClient.from("chapter_director_plans").select("*, director_segment_settings(*)").eq("chapter_id", chapterId).eq("status", "ready").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (directorPlanError) throw directorPlanError;
    if (!directorPlan) {
      try {
        directorPlan = await createDirectorPlan(adminClient, chapter, segments, cast || [], userData.user.id);
      } catch (error) {
        await logVoiceSegmentDiagnostic(error, requestId, { chapter_id: chapterId }, null, "voice-director-local-v1");
        return safeError("DIRECTOR_PLAN_GENERATION_FAILED", "A ready voice director plan could not be generated.", 500, requestId);
      }
    }
    // Keep the renderer's ready-plan requirement explicit; automatic generation
    // satisfies the requirement rather than bypassing it.
    if (!directorPlan || directorPlan.status !== "ready") return safeError("DIRECTOR_PLAN_REQUIRED", "Create a ready voice director plan before rendering audio.", 409, requestId);
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
