import { createAiProducerProject } from "./aiProducerEngine.js";

const TRACK_TYPES = ["narrator", "character", "ambient", "music", "sfx"];
export const audioStudioStorageKey = "novelverse.aiAudioStudio.v1";
export const productionProgressStates = ["loading chapter", "analyzing text", "detecting scenes", "resolving speakers", "building tracks", "saving project", "completed", "failed"];

export const audioStudioTrackTemplates = [
  { id: "narrator", name: "Narrator", type: "narrator", color: "#7dd3fc" },
  { id: "character_mira", name: "Mira", type: "character", color: "#c084fc" },
  { id: "character_kael", name: "Kael", type: "character", color: "#f0abfc" },
  { id: "ambient", name: "Ambient", type: "ambient", color: "#86efac" },
  { id: "music", name: "Music", type: "music", color: "#fde68a" },
  { id: "sfx", name: "Sound FX", type: "sfx", color: "#fca5a5" },
];

export function sortChaptersByNumber(chapters = []) { return [...chapters].sort((a, b) => (Number(a.number ?? a.chapter_number) || 0) - (Number(b.number ?? b.chapter_number) || 0)); }
export function getChapterText(chapter = {}) { return String(chapter.content ?? chapter.text ?? chapter.body ?? ""); }
export function hasChapterText(chapter = {}) { return getChapterText(chapter).replace(/<[^>]+>/g, " ").trim().length > 0; }
export function getProjectStorageKey(novelId, chapterId) { return `${audioStudioStorageKey}:project:${novelId || "global"}:${chapterId || "chapter"}`; }

export async function fetchAudioStudioNovels(supabase) {
  const { data, error } = await supabase.from("novels").select("id,title").order("title", { ascending: true });
  if (error) throw error;
  return data || [];
}
export async function fetchAudioStudioChapters(supabase, novelId) {
  if (!novelId) return [];
  const { data, error } = await supabase.from("chapters").select("id,novel_id,number,title,content,text").eq("novel_id", novelId).order("number", { ascending: true });
  if (error) throw error;
  return sortChaptersByNumber(data || []);
}
export async function fetchAudioStudioChapterText(supabase, chapterId) {
  const { data, error } = await supabase.from("chapters").select("id,novel_id,number,title,content,text").eq("id", chapterId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Selected chapter was deleted or is unavailable.");
  if (!hasChapterText(data)) throw new Error("Selected chapter has no text content.");
  return data;
}

export function createAudioStudioProject() {
  return { version: 2, novelId: "demo", name: "AI Audio Studio v1 Project", bpm: 80, duration: 90, cursor: 12, updatedAt: new Date().toISOString(), tracks: audioStudioTrackTemplates.map((track) => ({ ...track, muted: false, solo: false, clips: defaultClips(track.id) })) };
}
function defaultClips(trackId) {
  const clips = {
    narrator: [{ id: "clip_narrator_1", characterId: "narrator", title: "Opening narration", start: 0, duration: 28, volume: 0.92, fadeIn: 1.2, fadeOut: 1.6, pauses: [{ at: 8, duration: 0.7 }], automation: [{ at: 0, volume: 0.85 }, { at: 12, volume: 1 }, { at: 26, volume: 0.75 }] }],
    character_mira: [{ id: "clip_mira_1", characterId: "mira", title: "Mira dialogue", start: 30, duration: 18, volume: 0.9, fadeIn: 0.3, fadeOut: 0.5, pauses: [{ at: 7, duration: 0.4 }], automation: [{ at: 0, volume: 0.8 }, { at: 10, volume: 0.95 }] }],
    character_kael: [{ id: "clip_kael_1", characterId: "kael", title: "Kael reply", start: 50, duration: 16, volume: 0.88, fadeIn: 0.2, fadeOut: 0.6, pauses: [], automation: [{ at: 0, volume: 0.9 }, { at: 14, volume: 0.7 }] }],
    ambient: [{ id: "clip_rain", title: "Rain bed", start: 0, duration: 90, volume: 0.28, fadeIn: 4, fadeOut: 6, pauses: [], automation: [{ at: 0, volume: 0 }, { at: 8, volume: 0.28 }, { at: 80, volume: 0.18 }] }],
    music: [{ id: "clip_theme", title: "Low strings", start: 18, duration: 54, volume: 0.22, fadeIn: 8, fadeOut: 10, pauses: [], automation: [{ at: 0, volume: 0 }, { at: 20, volume: 0.22 }, { at: 50, volume: 0.12 }] }],
    sfx: [{ id: "clip_door", title: "Door hit", start: 47, duration: 3, volume: 0.75, fadeIn: 0.1, fadeOut: 0.4, pauses: [], automation: [{ at: 0, volume: 0.7 }, { at: 1.5, volume: 1 }] }],
  };
  return clips[trackId] || [];
}

export function createAudioStudioProjectFromChapter(chapter, options = {}) { return validateAudioStudioProject(createAiProducerProject(chapter, options)); }

function normalizeClip(clip, track, project) {
  const sourceText = clip.sourceText ?? clip.title ?? "";
  const clipType = clip.clipType || clip.type || (track.type === "character" ? "dialogue" : track.type === "narrator" ? "narrator" : track.type);
  return { novelId: project.novelId || null, chapterId: project.chapterId || null, sceneId: clip.sceneId || null, sourceOrder: Number(clip.sourceOrder ?? clip.start ?? 0), sourceText, clipType, speaker: clip.speaker || (track.type === "narrator" ? "Narrator" : track.name), characterId: clip.characterId || (track.type === "narrator" ? "narrator" : track.type === "character" ? track.id.replace(/^character_/, "") : null), emotion: clip.emotion || "neutral", provider: clip.provider || "piper", voiceId: clip.voiceId || clip.voice || "", rate: Number(clip.rate ?? 1), pitch: Number(clip.pitch ?? 1), volume: Number(clip.volume ?? 1), pauseBefore: Number(clip.pauseBefore ?? 0), pauseAfter: Number(clip.pauseAfter ?? clip.pauses?.[0]?.duration ?? 0), estimatedDuration: Number(clip.estimatedDuration ?? clip.duration ?? 0), generationStatus: clip.generationStatus || clip.synthesisStatus || "not_synthesized", manuallyEdited: Boolean(clip.manuallyEdited), ...clip, sourceText, clipType };
}
export function validateAudioStudioProject(project) {
  if (!project || typeof project !== "object") throw new Error("Project JSON must be an object.");
  if (!Array.isArray(project.tracks)) throw new Error("Project JSON must include tracks.");
  for (const track of project.tracks) { if (!TRACK_TYPES.includes(track.type)) throw new Error(`Unsupported track type: ${track.type}`); if (!Array.isArray(track.clips)) throw new Error(`Track ${track.name || track.id} must include clips.`); }
  return { ...project, version: typeof project.version === "string" ? project.version : Math.max(2, Number(project.version) || 1), audioStudioVersion: Math.max(2, Number(project.audioStudioVersion || project.version) || 1), updatedAt: new Date().toISOString(), editable: project.editable !== false, synthesisPolicy: project.synthesisPolicy || "manual_only", tracks: project.tracks.map((track) => ({ ...track, clips: track.clips.map((clip) => normalizeClip({ ...clip, editable: clip.editable !== false }, track, project)) })) };
}
export function serializeAudioStudioProject(project) { return JSON.stringify(validateAudioStudioProject(project), null, 2); }
export function deserializeAudioStudioProject(json) { return validateAudioStudioProject(JSON.parse(json)); }
export function updateClip(project, trackId, clipId, patch) { return { ...project, updatedAt: new Date().toISOString(), tracks: project.tracks.map((track) => track.id !== trackId ? track : { ...track, clips: track.clips.map((clip) => clip.id === clipId ? { ...clip, ...patch, manuallyEdited: true } : clip) }) }; }
export function updateScene(project, sceneId, patch) { return { ...project, updatedAt: new Date().toISOString(), scenes: (project.scenes || []).map((scene) => scene.id === sceneId ? { ...scene, ...patch, metadata: { ...scene.metadata, ...patch.metadata }, manuallyEdited: true } : scene) }; }
export function mergeManualEdits(nextProject, previousProject, { preserveManualEdits = true } = {}) {
  if (!preserveManualEdits) return nextProject;
  const edits = new Map((previousProject?.tracks || []).flatMap((t) => t.clips || []).filter((c) => c.manuallyEdited).map((c) => [c.id, c]));
  return { ...nextProject, tracks: nextProject.tracks.map((track) => ({ ...track, clips: track.clips.map((clip) => edits.has(clip.id) ? { ...clip, ...edits.get(clip.id), manuallyEdited: true } : clip) })) };
}
export function regenerateScene(project, chapter, sceneId, options = {}) { const fresh = createAudioStudioProjectFromChapter(chapter, options); return mergeManualEdits({ ...project, scenes: project.scenes.map((s) => s.id === sceneId ? fresh.scenes.find((x) => x.id === sceneId) || s : s), tracks: project.tracks.map((track) => ({ ...track, clips: [...track.clips.filter((c) => c.sceneId !== sceneId), ...((fresh.tracks.find((t) => t.id === track.id)?.clips || []).filter((c) => c.sceneId === sceneId))].sort((a, b) => a.sourceOrder - b.sourceOrder) })) }, project, options); }
export function regenerateClip(project, chapter, clipId, options = {}) { const freshClip = createAudioStudioProjectFromChapter(chapter, options).tracks.flatMap((t) => t.clips).find((c) => c.id === clipId); if (!freshClip) return project; return updateClip(project, project.tracks.find((t) => t.clips.some((c) => c.id === clipId))?.id, clipId, freshClip); }
export function saveAudioStudioProject(project, storage = globalThis.localStorage) { const safe = validateAudioStudioProject(project); storage?.setItem(getProjectStorageKey(safe.novelId, safe.chapterId), serializeAudioStudioProject(safe)); storage?.setItem(audioStudioStorageKey, serializeAudioStudioProject(safe)); return safe; }
export function loadAudioStudioProject(novelId, chapterId, storage = globalThis.localStorage) { const raw = storage?.getItem(getProjectStorageKey(novelId, chapterId)); if (!raw) return null; return deserializeAudioStudioProject(raw); }
export function mixPreviewSummary(project, seconds = project.cursor || 0) { return project.tracks.flatMap((track) => track.clips.map((clip) => ({ track: track.name, clip: clip.title, active: seconds >= clip.start && seconds <= clip.start + clip.duration, effectiveVolume: Number((clip.volume * (track.muted ? 0 : 1)).toFixed(2)) }))).filter((item) => item.active); }
