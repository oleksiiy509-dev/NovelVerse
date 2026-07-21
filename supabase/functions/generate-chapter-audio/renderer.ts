import { renderAudioSegment, type AudioRenderSegmentRequest } from "./provider.ts";

export const renderVersion = "audio-renderer-v2-openai";
export const maxSegmentRetries = 3;
export const queueStatuses = ["pending", "rendering", "rendered", "failed", "canceled"] as const;
export type QueueStatus = typeof queueStatuses[number];

type Db = { from(name: string): any; storage: any };
type Chapter = { id: string; novel_id: string; title: string; content: string };
type SegmentRow = { id?: string; segment_index: number; text: string; speaker_name?: string; speaker_id?: string; voice_profile?: string; emotion?: string; intensity?: number };
type DirectorSetting = { id?: string; segment_index?: number; cast_slot?: string; voice_profile?: string; emotion?: string; intensity?: number; rate?: number; pause_before_ms?: number; pause_after_ms?: number; emphasis?: string[] };
type CastRow = { character_id?: string; cast_slot?: string; voice_profile?: string; updated_at?: string; character_state_version?: string; voice_evolution_version?: string };
type DirectorPlan = { id: string; director_version?: string; director_segment_settings?: DirectorSetting[]; segmentSettings?: DirectorSetting[] };

export async function sha256(text: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function splitTextSafely(text: string, maxChars = 3600) {
  const value = String(text || "").trim();
  if (value.length <= maxChars) return value ? [value] : [];
  const protectedText = value.replace(/\b(Dr|Mr|Mrs|Ms|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e|т\.д|т\.п|ім|п|вул|м|р|див)\./giu, (m) => m.replace(/\./g, "∯"));
  const units = protectedText.split(/(?<=[.!?…])\s+(?=[\p{Lu}\p{N}«“"(—-])/u).flatMap((part) => part.split(/\n{2,}/));
  const chunks: string[] = [];
  let current = "";
  for (const raw of units) {
    const unit = raw.replace(/∯/g, ".").trim();
    if (!unit) continue;
    if ((current + " " + unit).trim().length <= maxChars) { current = (current + " " + unit).trim(); continue; }
    if (current) chunks.push(current);
    if (unit.length <= maxChars) { current = unit; continue; }
    let rest = unit;
    while (rest.length > maxChars) {
      const cut = Math.max(rest.lastIndexOf(",", maxChars), rest.lastIndexOf(";", maxChars), rest.lastIndexOf(" ", maxChars));
      const index = cut > maxChars * 0.55 ? cut : maxChars;
      chunks.push(rest.slice(0, index).trim()); rest = rest.slice(index).trim();
    }
    current = rest;
  }
  if (current) chunks.push(current);
  return chunks;
}

export function concatBytes(parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  parts.forEach((part) => { merged.set(part, offset); offset += part.byteLength; });
  return merged;
}

export function silentMp3Pause(ms = 0) {
  if (ms <= 0) return new Uint8Array();
  return new Uint8Array(Math.max(1, Math.ceil(ms / 26))).fill(0);
}

export async function mergeAudioSegments(parts: Uint8Array[], strategy = Deno.env.get("NOVELVERSE_AUDIO_MERGE_STRATEGY") || "segment-manifest") {
  if (strategy !== "byte-concat") {
    throw new Error("audio_merge_unavailable: Configure NOVELVERSE_AUDIO_MERGE_STRATEGY=byte-concat only for MP3-compatible test providers, or run an ffmpeg merge worker before marking chapters rendered.");
  }
  return concatBytes(parts);
}

export function buildWaveform(audio: Uint8Array, buckets = 96) {
  if (!audio.byteLength) return [];
  const size = Math.max(1, Math.floor(audio.byteLength / buckets));
  return Array.from({ length: Math.min(buckets, Math.ceil(audio.byteLength / size)) }, (_, index) => {
    const slice = audio.subarray(index * size, Math.min(audio.byteLength, (index + 1) * size));
    const peak = slice.reduce((max, value) => Math.max(max, Math.abs(value - 128)), 0);
    return Number((peak / 128).toFixed(3));
  });
}

function bySegmentIndex(plan: DirectorPlan) {
  return new Map((plan.director_segment_settings || plan.segmentSettings || []).map((setting) => [Number(setting.segment_index), setting]));
}

function castBySpeaker(cast: CastRow[]) {
  return new Map(cast.map((entry) => [String(entry.character_id || ""), entry]));
}

export function castVersion(cast: CastRow[]) {
  return cast.map((entry) => `${entry.character_id}:${entry.cast_slot}:${entry.voice_profile}:${entry.updated_at || ""}:${entry.character_state_version || "state-v0"}:${entry.voice_evolution_version || "evo-v0"}`).sort().join("|") || "cast-v0";
}

export function makeSegmentRequest(segment: SegmentRow, setting: DirectorSetting | undefined, cast: CastRow | undefined, language: string): AudioRenderSegmentRequest {
  return {
    segmentId: String(segment.id || segment.segment_index),
    text: segment.text || "",
    language,
    speaker: segment.speaker_name || "Narrator",
    castSlot: setting?.cast_slot || cast?.cast_slot || (segment.speaker_id === "narrator" ? "narrator_main" : "unknown_01"),
    voiceProfile: setting?.voice_profile || cast?.voice_profile || segment.voice_profile || "narrator_neutral",
    emotion: setting?.emotion || segment.emotion || "neutral",
    intensity: Number(setting?.intensity ?? segment.intensity ?? 0.5),
    pace: Number(setting?.rate ?? 1),
    pauses: { beforeMs: Number(setting?.pause_before_ms || 0), afterMs: Number(setting?.pause_after_ms || 0) },
    emphasis: Array.isArray(setting?.emphasis) ? setting.emphasis : [],
    format: "mp3",
  };
}

export async function renderChapterJob(db: Db, job: any, deps: { chapter: Chapter; segments: SegmentRow[]; cast: CastRow[]; directorPlan: DirectorPlan }) {
  const provider = String(job.provider || "unconfigured");
  const settings = bySegmentIndex(deps.directorPlan);
  const castMap = castBySpeaker(deps.cast);
  const chapterHash = await sha256(deps.segments.map((s) => `${s.segment_index}:${s.text}`).join("\n"));
  const castHash = await sha256(castVersion(deps.cast));
  let completed = 0;
  await db.from("audio_render_jobs").update({ status: "rendering", total_segments: deps.segments.length, current_segment_index: 0, progress_percent: 0 }).eq("id", job.id);
  const renderedSegments = [];
  for (const segment of deps.segments) {
    const request = makeSegmentRequest(segment, settings.get(Number(segment.segment_index)), castMap.get(String(segment.speaker_id || "")), job.language || "auto");
    const inputHash = await sha256(JSON.stringify({ request, chapterHash, directorVersion: deps.directorPlan.director_version, castHash, provider, renderVersion }));
    const cached = await db.from("audio_render_segments").select("storage_path,duration_seconds,waveform").eq("input_hash", inputHash).eq("status", "rendered").maybeSingle();
    if (cached.data?.storage_path) {
      completed += 1;
      await db.from("audio_render_jobs").update({ current_segment_index: completed, progress_percent: Math.round((completed / deps.segments.length) * 100) }).eq("id", job.id);
      renderedSegments.push({ ...cached.data, request, reused: true, bytes: new Uint8Array() });
      continue;
    }
    const chunks = splitTextSafely(request.text, Number(Deno.env.get("NOVELVERSE_TTS_PROVIDER_MAX_INPUT_CHARS") || 3600));
    const chunkAudio: Uint8Array[] = [];
    let result: any;
    for (const [chunkIndex, chunk] of chunks.entries()) {
      let lastError = "";
      for (let attempt = 1; attempt <= maxSegmentRetries; attempt += 1) {
        result = await renderAudioSegment(provider, { ...request, segmentId: `${request.segmentId}.${chunkIndex + 1}`, text: chunk });
        if (result.ok) { chunkAudio.push(result.audio); break; }
        lastError = result.message;
        await db.from("audio_render_segments").upsert({ job_id: job.id, chapter_id: deps.chapter.id, segment_index: segment.segment_index, input_hash: inputHash, provider, status: "failed", error_message: lastError, retry_count: attempt });
      }
      if (!result?.ok) throw new Error(lastError || "Segment rendering failed.");
    }
    const segmentAudio = concatBytes(chunkAudio);
    const path = `segments/${deps.chapter.novel_id}/${deps.chapter.id}/${provider}/${inputHash}.mp3`;
    const upload = await db.storage.from("chapter-audio").upload(path, segmentAudio, { contentType: result.contentType, upsert: true });
    if (upload.error) throw new Error("Segment upload failed.");
    const waveform = buildWaveform(segmentAudio);
    await db.from("audio_render_segments").upsert({ job_id: job.id, chapter_id: deps.chapter.id, segment_index: segment.segment_index, input_hash: inputHash, provider, provider_version: result.providerVersion, status: "rendered", storage_path: path, duration_seconds: result.durationSeconds ?? null, waveform, render_version: renderVersion });
    completed += 1;
    await db.from("audio_render_jobs").update({ current_segment_index: completed, progress_percent: Math.round((completed / deps.segments.length) * 100) }).eq("id", job.id);
    renderedSegments.push({ storage_path: path, duration_seconds: result.durationSeconds ?? null, waveform, request, bytes: segmentAudio });
  }
  const parts = renderedSegments.flatMap((segment) => [silentMp3Pause(segment.request.pauses.beforeMs), segment.bytes || new Uint8Array(), silentMp3Pause(segment.request.pauses.afterMs)]);
  const chapterAudio = await mergeAudioSegments(parts);
  const storagePath = `novels/${deps.chapter.novel_id}/chapters/${deps.chapter.id}/renders/${chapterHash}/chapter.mp3`;
  const upload = await db.storage.from("chapter-audio").upload(storagePath, chapterAudio, { contentType: "audio/mpeg", upsert: true });
  if (upload.error) throw new Error("Chapter upload failed.");
  const waveform = buildWaveform(chapterAudio);
  await db.from("chapter_audio").upsert({ chapter_id: deps.chapter.id, novel_id: deps.chapter.novel_id, language: job.language || "auto", voice_id: provider, provider, status: "ready", storage_path: storagePath, duration_seconds: renderedSegments.reduce((sum, s) => sum + Number(s.duration_seconds || 0), 0), file_size: chapterAudio.byteLength, content_hash: chapterHash, waveform, bitrate: 128000, sample_rate: 44100, render_version: renderVersion, cast_version: castHash, director_version: deps.directorPlan.director_version || "unknown" });
  await db.from("audio_render_jobs").update({ status: "rendered", progress_percent: 100, updated_at: new Date().toISOString() }).eq("id", job.id);
  return { storagePath, waveform, reusedSegments: renderedSegments.filter((s) => s.reused).length };
}
