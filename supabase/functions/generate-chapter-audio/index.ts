import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateSpeech } from "./provider.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
function json(body: Record<string, unknown>, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
function stripMarkup(value = "") { return String(value).replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<\s*br\s*\/?\s*>/gi, "\n").replace(/<\s*\/\s*(p|div|h[1-6]|li|blockquote)\s*>/gi, "\n\n").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim(); }
async function sha256(text: string) { const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)); return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join(""); }
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
    const voiceId = String(body.voice_id || body.voiceId || "default");
    if (!chapterId) return json({ error: "chapter_id_required" }, 400);

    const { data: chapter, error: chapterError } = await adminClient.from("chapters").select("id, novel_id, title, content").eq("id", chapterId).single();
    if (chapterError || !chapter) return json({ error: "chapter_not_found" }, 404);
    const text = stripMarkup(chapter.content);
    if (!text) return json({ error: "empty_chapter" }, 422);
    const contentHash = await sha256(text);

    const { data: existing } = await adminClient.from("chapter_audio").select("id, status, storage_path, duration_seconds, file_size").eq("chapter_id", chapterId).eq("language", language).eq("voice_id", voiceId).eq("content_hash", contentHash).eq("status", "ready").maybeSingle();
    if (existing) return json({ status: "ready", audio: existing, reused: true });

    const payload = { chapter_id: chapterId, novel_id: chapter.novel_id, language, voice_id: voiceId, provider: "unconfigured", status: "pending", content_hash: contentHash, created_by: userData.user.id, error_message: null };
    const { data: record, error: upsertError } = await adminClient.from("chapter_audio").upsert(payload, { onConflict: "chapter_id,language,voice_id,content_hash" }).select("id").single();
    if (upsertError) return json({ error: "audio_record_failed" }, 500);

    const result = await generateSpeech({ text, language, voice: voiceId, format: "mp3" });
    if (!result.ok) {
      await adminClient.from("chapter_audio").update({ status: "failed", error_message: result.message, provider: "unconfigured" }).eq("id", record.id);
      return json({ status: "failed", code: result.code, message: result.message }, result.code === "provider_not_configured" ? 501 : 502);
    }

    const storagePath = `novels/${chapter.novel_id}/chapters/${chapterId}/${language}/${voiceId}/${contentHash}.mp3`;
    const upload = await adminClient.storage.from("chapter-audio").upload(storagePath, result.audio, { contentType: result.contentType, upsert: true });
    if (upload.error) { await adminClient.from("chapter_audio").update({ status: "failed", error_message: "Audio upload failed." }).eq("id", record.id); return json({ error: "audio_upload_failed" }, 500); }
    await adminClient.from("chapter_audio").update({ status: "ready", storage_path: storagePath, duration_seconds: result.durationSeconds ?? null, file_size: result.audio.byteLength, error_message: null }).eq("id", record.id);
    return json({ status: "ready", storage_path: storagePath });
  } catch (_error) { return json({ error: "audio_generation_failed" }, 500); }
});
