import { isSpeechClip, orderedSpeechClips } from "./audioRenderingPipeline.js";

export const MIXER_PROJECT_VERSION = 1;
export const mixerStoragePrefix = "novelverse.mixerProjects";
export const MIXER_TRACK_ORDER = ["narrator", "character_dialogue", "internal_thoughts", "ambience", "music", "sound_effects", "silence_pauses"];
export const mixerTrackDefinitions = [
  ["narrator", "Narrator"], ["character_dialogue", "Character dialogue"], ["internal_thoughts", "Internal thoughts"],
  ["ambience", "Ambience"], ["music", "Music"], ["sound_effects", "Sound effects"], ["silence_pauses", "Silence & pauses"],
];

const now = () => new Date().toISOString();
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const seconds = (value) => { const number = Math.max(0, finite(value)); return number > 20 ? number / 1000 : number; };
const uid = (prefix, value) => `${prefix}_${String(value).replace(/[^a-z0-9_-]/gi, "_")}`;
const clipType = (clip, track = {}) => clip.clipType || clip.type || (track.type === "character" ? "dialogue" : track.type);
const mixerType = (clip, track = {}) => {
  const type = clipType(clip, track);
  if (type === "narrator" || type === "narration") return "narrator";
  if (type === "thought" || type === "internal_thought") return "internal_thoughts";
  if (type === "dialogue" || track.type === "character") return "character_dialogue";
  if (type === "ambient") return "ambience";
  if (type === "sfx") return "sound_effects";
  return type;
};

function createTrack(trackType, title) {
  return { trackId: `mixer_track_${trackType}`, trackType, title, muted: false, solo: false, volume: 1, pan: 0, fadeIn: 0, fadeOut: 0, duckingEnabled: ["ambience", "music"].includes(trackType), clips: [] };
}
function makeClip(source = {}, patch = {}) {
  const duration = Math.max(0, finite(source.renderedDuration ?? source.estimatedDuration ?? source.duration));
  const reference = source.audioReference || source.audioUrl || "";
  return { clipId: uid("mixclip", source.id || source.clipId || `${source.sceneId}_${source.sourceOrder}`), sourceClipId: source.id || source.sourceClipId || null, sceneId: source.sceneId || null, sourceOrder: finite(source.sourceOrder ?? source.start), startTime: finite(source.startTime ?? source.start), duration, trimStart: 0, trimEnd: 0, fadeIn: finite(source.fadeIn), fadeOut: finite(source.fadeOut), volume: finite(source.volume, 1), pan: finite(source.pan), loop: Boolean(source.loop), audioReference: reference, missingAudio: !reference, manuallyEdited: Boolean(source.manuallyEdited), ...patch };
}

export function buildMixerProject(sourceProject = {}, previousProject = null) {
  const tracks = new Map(mixerTrackDefinitions.map(([type, title]) => [type, createTrack(type, title)]));
  const speech = orderedSpeechClips(sourceProject);
  let speechCursor = 0;
  for (const source of speech) {
    const before = seconds(source.pauseBefore);
    const after = seconds(source.pauseAfter);
    if (before) tracks.get("silence_pauses").clips.push(makeClip(source, { clipId: uid("pause_before", source.id), sourceClipId: source.id, startTime: speechCursor, duration: before, audioReference: "", missingAudio: false }));
    speechCursor += before;
    const type = mixerType(source, { type: source.trackType });
    const duration = Math.max(0.01, finite(source.renderedDuration ?? source.estimatedDuration ?? source.duration, 0.01));
    tracks.get(type).clips.push(makeClip(source, { startTime: speechCursor, duration }));
    speechCursor += duration;
    if (after) tracks.get("silence_pauses").clips.push(makeClip(source, { clipId: uid("pause_after", source.id), sourceClipId: source.id, startTime: speechCursor, duration: after, audioReference: "", missingAudio: false }));
    speechCursor += after;
  }

  for (const sourceTrack of sourceProject.tracks || []) for (const source of sourceTrack.clips || []) {
    if (isSpeechClip(source, sourceTrack)) continue;
    const type = mixerType(source, sourceTrack);
    if (!tracks.has(type)) continue;
    const scene = (sourceProject.scenes || []).find((item) => item.id === source.sceneId);
    const patch = { startTime: finite(source.start ?? scene?.timeline?.start), duration: finite(source.duration ?? scene?.timeline?.duration), loop: type === "ambience" ? true : Boolean(source.loop) };
    if (["ambience", "music"].includes(type)) { patch.fadeIn = Math.max(.4, finite(source.fadeIn, 1)); patch.fadeOut = Math.max(.4, finite(source.fadeOut, 1)); }
    tracks.get(type).clips.push(makeClip(source, patch));
  }
  for (const track of tracks.values()) track.clips.sort((a, b) => a.startTime - b.startTime || a.sourceOrder - b.sourceOrder || a.clipId.localeCompare(b.clipId));
  const createdAt = previousProject?.createdAt || now();
  const project = { mixerProjectId: previousProject?.mixerProjectId || uid("mixer", sourceProject.id || sourceProject.projectId || `${sourceProject.novelId}_${sourceProject.chapterId}`), projectId: sourceProject.id || sourceProject.projectId || `${sourceProject.novelId || "global"}:${sourceProject.chapterId || "chapter"}`, novelId: sourceProject.novelId || null, chapterId: sourceProject.chapterId || null, version: MIXER_PROJECT_VERSION, sampleRate: 48000, channelCount: 2, duration: Math.max(finite(sourceProject.duration), speechCursor), tracks: [...tracks.values()], masterSettings: { volume: 1, peakLimiter: true, normalizationTarget: -1, fadeIn: 0, fadeOut: 0, ducking: { threshold: -30, attenuation: -12, attack: .08, release: .35 } }, exportSettings: { format: "wav", sampleRate: 48000, channelCount: 2, chunkSeconds: 30 }, createdAt, updatedAt: now() };
  return preserveMixerEdits(project, previousProject);
}

export function preserveMixerEdits(next, previous) {
  if (!previous) return next;
  const oldTracks = new Map((previous.tracks || []).map((track) => [track.trackType, track]));
  return { ...next, masterSettings: { ...next.masterSettings, ...previous.masterSettings, ducking: { ...next.masterSettings.ducking, ...previous.masterSettings?.ducking } }, exportSettings: { ...next.exportSettings, ...previous.exportSettings }, tracks: next.tracks.map((track) => {
    const old = oldTracks.get(track.trackType); const oldClips = new Map((old?.clips || []).map((clip) => [clip.sourceClipId, clip]));
    return { ...track, ...old, trackId: track.trackId, trackType: track.trackType, clips: track.clips.map((clip) => oldClips.get(clip.sourceClipId)?.manuallyEdited ? { ...clip, ...oldClips.get(clip.sourceClipId), manuallyEdited: true } : clip) };
  }), updatedAt: now() };
}

export function rebuildChangedTracks(source, mixer, changedSourceClipIds = []) {
  const fresh = buildMixerProject(source, mixer); const changed = new Set(changedSourceClipIds);
  if (!changed.size) return fresh;
  return { ...fresh, tracks: fresh.tracks.map((track) => ({ ...track, clips: track.clips.map((clip) => changed.has(clip.sourceClipId) ? { ...clip, missingAudio: !clip.audioReference, manuallyEdited: false } : clip) })) };
}

export function migrateMixerProject(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.tracks)) throw new Error("Corrupted saved mixer project.");
  const project = { ...value, version: MIXER_PROJECT_VERSION, sampleRate: finite(value.sampleRate, 48000), channelCount: value.channelCount === 1 ? 1 : 2, masterSettings: { volume: 1, peakLimiter: true, normalizationTarget: -1, fadeIn: 0, fadeOut: 0, ducking: { threshold: -30, attenuation: -12, attack: .08, release: .35 }, ...value.masterSettings }, exportSettings: { format: "wav", sampleRate: 48000, channelCount: 2, chunkSeconds: 30, ...value.exportSettings }, updatedAt: value.updatedAt || now() };
  project.tracks = mixerTrackDefinitions.map(([type, title]) => { const input = value.tracks.find((track) => (track.trackType || track.type) === type); return { ...createTrack(type, title), ...input, trackType: type, clips: (input?.clips || []).map((clip) => makeClip(clip, clip)) }; });
  return project;
}
export function getMixerStorageKey(projectId, novelId, chapterId) { return `${mixerStoragePrefix}.v${MIXER_PROJECT_VERSION}:${projectId || "project"}:${novelId || "global"}:${chapterId || "chapter"}`; }
export function saveMixerProject(project, storage = globalThis.localStorage) { const safe = migrateMixerProject(project); storage?.setItem(getMixerStorageKey(safe.projectId, safe.novelId, safe.chapterId), JSON.stringify(safe)); return safe; }
export function loadMixerProject(meta = {}, storage = globalThis.localStorage) { const key = getMixerStorageKey(meta.projectId, meta.novelId, meta.chapterId); const raw = storage?.getItem(key); if (!raw) return null; try { return migrateMixerProject(JSON.parse(raw)); } catch { storage?.removeItem(key); return null; } }

export function effectiveTrackState(tracks = []) { const anySolo = tracks.some((track) => track.solo); return tracks.map((track) => ({ ...track, audible: !track.muted && (!anySolo || track.solo) })); }
export function buildDuckingEnvelope(project) { const speech = project.tracks.filter((t) => ["narrator", "character_dialogue", "internal_thoughts"].includes(t.trackType)).flatMap((t) => t.clips).sort((a, b) => a.startTime - b.startTime); const d = project.masterSettings.ducking; return speech.flatMap((clip) => [{ time: Math.max(0, clip.startTime - d.attack), gainDb: 0 }, { time: clip.startTime, gainDb: d.attenuation }, { time: clip.startTime + clip.duration, gainDb: d.attenuation }, { time: clip.startTime + clip.duration + d.release, gainDb: 0 }]).sort((a, b) => a.time - b.time); }
export function buildPreviewManifest(project, startTime = 0) { const tracks = effectiveTrackState(project.tracks); return { version: 1, duration: project.duration, startTime, missingAssets: tracks.flatMap((t) => t.clips.filter((c) => c.missingAudio).map((c) => ({ trackId: t.trackId, clipId: c.clipId }))), items: tracks.filter((t) => t.audible).flatMap((t) => t.clips.map((c) => ({ ...c, trackId: t.trackId, trackType: t.trackType, trackVolume: t.volume }))).filter((c) => c.startTime + c.duration >= startTime).sort((a, b) => a.startTime - b.startTime || a.sourceOrder - b.sourceOrder || MIXER_TRACK_ORDER.indexOf(a.trackType) - MIXER_TRACK_ORDER.indexOf(b.trackType)) }; }

export function encodeWav({ channels, sampleRate = 48000 }) { if (!channels?.length || !channels[0]?.length || ![44100, 48000].includes(sampleRate)) throw new Error("Invalid audio buffer or unsupported sample rate."); const length = channels[0].length; const channelCount = channels.length; const buffer = new ArrayBuffer(44 + length * channelCount * 2); const view = new DataView(buffer); const write = (at, text) => [...text].forEach((char, i) => view.setUint8(at + i, char.charCodeAt(0))); write(0, "RIFF"); view.setUint32(4, 36 + length * channelCount * 2, true); write(8, "WAVEfmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channelCount, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * channelCount * 2, true); view.setUint16(32, channelCount * 2, true); view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, length * channelCount * 2, true); let offset = 44; for (let i = 0; i < length; i += 1) for (let c = 0; c < channelCount; c += 1) { const sample = Math.max(-1, Math.min(1, finite(channels[c][i]))); view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true); offset += 2; } return new Blob([buffer], { type: "audio/wav" }); }

export class BrowserMixerRenderer {
  constructor({ AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext, fetcher = globalThis.fetch } = {}) { if (!AudioContextClass) throw new Error("Browser AudioContext failure."); this.context = new AudioContextClass(); this.fetcher = fetcher; this.buffers = new Map(); }
  async decode(reference) { if (this.buffers.has(reference)) return this.buffers.get(reference); const response = await this.fetcher(reference); if (!response.ok) throw new Error(`Missing audio asset: ${reference}`); const buffer = await this.context.decodeAudioData(await response.arrayBuffer()); if (!buffer?.length || !buffer.duration) throw new Error("Invalid or silent audio buffer."); this.buffers.set(reference, buffer); return buffer; }
  async renderChunk({ project, offset, frames, sampleRate, channelCount }) { const output = Array.from({ length: channelCount }, () => new Float32Array(frames)); const chunkStart = offset / sampleRate; const chunkEnd = (offset + frames) / sampleRate; const tracks = effectiveTrackState(project.tracks).filter((track) => track.audible); for (const track of tracks) for (const clip of track.clips) { if (!clip.audioReference || clip.startTime >= chunkEnd || clip.startTime + clip.duration <= chunkStart) continue; const buffer = await this.decode(clip.audioReference); const from = Math.max(0, Math.floor((clip.startTime - chunkStart) * sampleRate)); const to = Math.min(frames, Math.ceil((clip.startTime + clip.duration - chunkStart) * sampleRate)); const gain = finite(project.masterSettings.volume, 1) * finite(track.volume, 1) * finite(clip.volume, 1); for (let frame = from; frame < to; frame += 1) { const relative = chunkStart + frame / sampleRate - clip.startTime + clip.trimStart; let sourceFrame = Math.floor(relative * buffer.sampleRate); if (clip.loop) sourceFrame %= buffer.length; if (sourceFrame < 0 || sourceFrame >= buffer.length) continue; const fade = Math.min(1, clip.fadeIn ? relative / clip.fadeIn : 1, clip.fadeOut ? (clip.duration - relative) / clip.fadeOut : 1); for (let channel = 0; channel < channelCount; channel += 1) { const source = buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1))[sourceFrame]; const pan = finite(track.pan) + finite(clip.pan); const panGain = channelCount === 1 ? 1 : channel === 0 ? Math.min(1, 1 - pan) : Math.min(1, 1 + pan); output[channel][frame] += source * gain * Math.max(0, fade) * panGain; } } } return output; }
  async dispose() { this.buffers.clear(); await this.context.close(); }
}

export class MixerExportJob {
  constructor({ onProgress = () => {} } = {}) { this.onProgress = onProgress; this.cancelled = false; this.running = false; }
  cancel() { this.cancelled = true; }
  async export(project, renderChunk) { if (this.running) throw new Error("An export job is already active."); this.running = true; this.cancelled = false; const rate = project.exportSettings.sampleRate; const count = project.exportSettings.channelCount; const total = Math.ceil(project.duration * rate); const chunk = Math.max(1, Math.floor(project.exportSettings.chunkSeconds * rate)); const output = Array.from({ length: count }, () => new Float32Array(total)); try { for (let offset = 0; offset < total; offset += chunk) { if (this.cancelled) throw new DOMException("Export cancelled.", "AbortError"); const frames = Math.min(chunk, total - offset); const rendered = await renderChunk({ project, offset, frames, sampleRate: rate, channelCount: count }); rendered?.forEach((data, channel) => output[channel]?.set(data.subarray(0, frames), offset)); this.onProgress(Math.round(((offset + frames) / total) * 100)); await new Promise((resolve) => setTimeout(resolve, 0)); } return encodeWav({ channels: output, sampleRate: rate }); } finally { output.splice(0); this.running = false; } }
}
