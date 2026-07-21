import { supabase } from "./supabase";

export const audioModes = { ai: "ai", device: "device" };
export const audioModeStorageKey = "novelverse:narrationMode";
export const defaultAudioLanguage = "auto";
export const defaultAudioVoice = "default";

export function getSavedAudioMode() {
  return localStorage.getItem(audioModeStorageKey) === audioModes.device ? audioModes.device : audioModes.ai;
}

export function saveAudioMode(mode) {
  localStorage.setItem(audioModeStorageKey, mode === audioModes.device ? audioModes.device : audioModes.ai);
}

export function getAudioPositionKey(chapterId) {
  return `novelverse:aiAudioPosition:${chapterId}`;
}

export function getAudioDownloadKey(chapterId) {
  return `novelverse:aiAudioDownloaded:${chapterId}`;
}

export function formatFileSize(bytes) {
  const value = Number(bytes) || 0;
  if (!value) return "—";
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export async function getChapterAudioMetadata(chapterId, language = defaultAudioLanguage, voiceId = defaultAudioVoice) {
  if (!chapterId) return { audio: null, playbackUrl: "", error: null };
  const query = supabase
    .from("chapter_audio")
    .select("id, chapter_id, novel_id, language, voice_id, provider, status, storage_path, duration_seconds, file_size, content_hash, error_message, bitrate, sample_rate, waveform, render_version, cast_version, director_version, created_at, updated_at")
    .eq("chapter_id", chapterId)
    .in("status", ["ready", "pending", "processing", "failed"])
    .order("updated_at", { ascending: false })
    .limit(1);
  if (language !== defaultAudioLanguage) query.eq("language", language);
  if (voiceId !== defaultAudioVoice) query.eq("voice_id", voiceId);
  const { data, error } = await query.maybeSingle();
  if (error) return { audio: null, playbackUrl: "", error };
  if (!data?.storage_path || data.status !== "ready") return { audio: data || null, playbackUrl: "", error: null };
  const signed = await supabase.storage.from("chapter-audio").createSignedUrl(data.storage_path, 60 * 60);
  if (!signed.error) return { audio: data, playbackUrl: signed.data.signedUrl, error: null };
  const publicUrl = supabase.storage.from("chapter-audio").getPublicUrl(data.storage_path);
  return { audio: data, playbackUrl: publicUrl.data.publicUrl || "", error: null };
}

export async function callChapterAudioGeneration(chapterId, language = defaultAudioLanguage, provider = defaultAudioVoice, preview = null) {
  const { data, error } = await supabase.functions.invoke("generate-chapter-audio", { body: { chapter_id: chapterId, language, provider, preview } });
  if (error) throw error;
  return data;
}
