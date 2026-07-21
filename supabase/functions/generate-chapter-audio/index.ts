import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderChapterJob, sha256 } from "./renderer.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
function json(body: Record<string, unknown>, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
function stripMarkup(value = "") { return String(value).replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<\s*br\s*\/?\s*>/gi, "\n").replace(/<\s*\/\s*(p|div|h[1-6]|li|blockquote)\s*>/gi, "\n\n").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim(); }
function isAdmin(user: any) { return user?.user_metadata?.role === "admin" || user?.app_metadata?.role === "admin" || user?.user_metadata?.is_admin === true; }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    const adminClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: userData, error: userError } = await adminClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userError || !userData.user) return json({ error: "authentication_required" }, 401);
    if (!isAdmin(userData.user)) return json({ error: "admin_required" }, 403);

    const body = await req.json().catch(() => ({}));
    const chapterId = String(body.chapter_id || body.chapterId || "");
    const language = String(body.language || "auto");
    const provider = String(body.provider || Deno.env.get("NOVELVERSE_AUDIO_PROVIDER") || "unconfigured");
    const priority = Number(body.priority || 5);
    const preview = body.preview || null;
    if (!chapterId) return json({ error: "chapter_id_required" }, 400);

    const { data: chapter, error: chapterError } = await adminClient.from("chapters").select("id, novel_id, title, content").eq("id", chapterId).single();
    if (chapterError || !chapter) return json({ error: "chapter_not_found" }, 404);
    if (!stripMarkup(chapter.content)) return json({ error: "empty_chapter" }, 422);

    const [{ data: segments }, { data: cast }, { data: directorPlan }] = await Promise.all([
      adminClient.from("chapter_voice_segments").select("*").eq("chapter_id", chapterId).order("segment_index"),
      adminClient.from("novel_voice_cast").select("*").eq("novel_id", chapter.novel_id),
      adminClient.from("chapter_director_plans").select("*, director_segment_settings(*)").eq("chapter_id", chapterId).eq("status", "ready").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (!segments?.length) return json({ error: "voice_segments_required" }, 409);
    if (!directorPlan) return json({ error: "director_plan_required" }, 409);

    const selectedSegments = preview?.type === "sentence" ? segments.slice(Number(preview.segmentIndex || 0), Number(preview.segmentIndex || 0) + 1) : preview?.type === "dialogue" ? segments.filter((s: any) => s.segment_type === "dialogue").slice(0, 1) : preview?.type === "scene" ? segments.slice(Number(preview.startSegmentIndex || 0), Number(preview.endSegmentIndex || preview.startSegmentIndex || 0) + 1) : segments;
    const cacheKey = await sha256(JSON.stringify({ chapter: chapter.id, language, provider, director: directorPlan.director_version, cast: cast?.map((c: any) => [c.character_id, c.cast_slot, c.voice_profile, c.updated_at]), segments: selectedSegments.map((s: any) => [s.segment_index, s.text]), preview }));
    const { data: existing } = !preview ? await adminClient.from("chapter_audio").select("id, status, storage_path, duration_seconds, file_size, waveform").eq("chapter_id", chapterId).eq("language", language).eq("voice_id", provider).eq("content_hash", cacheKey).eq("status", "ready").maybeSingle() : { data: null };
    if (existing) return json({ status: "ready", audio: existing, reused: true });

    const { data: job, error: jobError } = await adminClient.from("audio_render_jobs").insert({ chapter_id: chapterId, novel_id: chapter.novel_id, language, provider, priority, retry_count: 0, status: "pending", director_plan_id: directorPlan.id, cast_snapshot: cast || [], preview_scope: preview, cache_key: cacheKey, created_by: userData.user.id }).select("*").single();
    if (jobError) return json({ error: "queue_failed" }, 500);
    if (body.enqueueOnly) return json({ status: "pending", job });

    await adminClient.from("audio_render_jobs").update({ status: "rendering", updated_at: new Date().toISOString() }).eq("id", job.id);
    try {
      const result = await renderChapterJob(adminClient, job, { chapter, segments: selectedSegments, cast: cast || [], directorPlan });
      return json({ status: preview ? "preview_ready" : "ready", job_id: job.id, ...result });
    } catch (error) {
      await adminClient.from("audio_render_jobs").update({ status: "failed", retry_count: Number(job.retry_count || 0) + 1, error_message: error instanceof Error ? error.message : "Rendering failed.", updated_at: new Date().toISOString() }).eq("id", job.id);
      return json({ status: "failed", message: error instanceof Error ? error.message : "Rendering failed." }, provider === "unconfigured" ? 501 : 502);
    }
  } catch (_error) { return json({ error: "audio_generation_failed" }, 500); }
});
