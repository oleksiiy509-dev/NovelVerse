const TRACK_TYPES = ["narrator", "character", "ambient", "music", "sfx"];

export const audioStudioTrackTemplates = [
  { id: "narrator", name: "Narrator", type: "narrator", color: "#7dd3fc" },
  { id: "character_mira", name: "Mira", type: "character", color: "#c084fc" },
  { id: "character_kael", name: "Kael", type: "character", color: "#f0abfc" },
  { id: "ambient", name: "Ambient", type: "ambient", color: "#86efac" },
  { id: "music", name: "Music", type: "music", color: "#fde68a" },
  { id: "sfx", name: "Sound FX", type: "sfx", color: "#fca5a5" },
];

export function createAudioStudioProject() {
  return {
    version: 2,
    novelId: "demo",
    name: "AI Audio Studio v1 Project",
    bpm: 80,
    duration: 90,
    cursor: 12,
    updatedAt: new Date().toISOString(),
    tracks: audioStudioTrackTemplates.map((track) => ({ ...track, muted: false, solo: false, clips: defaultClips(track.id) })),
  };
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

export function validateAudioStudioProject(project) {
  if (!project || typeof project !== "object") throw new Error("Project JSON must be an object.");
  if (!Array.isArray(project.tracks)) throw new Error("Project JSON must include tracks.");
  for (const track of project.tracks) {
    if (!TRACK_TYPES.includes(track.type)) throw new Error(`Unsupported track type: ${track.type}`);
    if (!Array.isArray(track.clips)) throw new Error(`Track ${track.name || track.id} must include clips.`);
  }
  return { ...project, version: Math.max(2, Number(project.version) || 1), updatedAt: new Date().toISOString(), tracks: project.tracks.map((track) => ({ ...track, clips: track.clips.map((clip) => ({ ...clip, characterId: clip.characterId || (track.type === "narrator" ? "narrator" : track.type === "character" ? track.id.replace(/^character_/, "") : null) })) })) };
}

export function serializeAudioStudioProject(project) {
  return JSON.stringify(validateAudioStudioProject(project), null, 2);
}

export function deserializeAudioStudioProject(json) {
  return validateAudioStudioProject(JSON.parse(json));
}

export function updateClip(project, trackId, clipId, patch) {
  return { ...project, updatedAt: new Date().toISOString(), tracks: project.tracks.map((track) => track.id !== trackId ? track : { ...track, clips: track.clips.map((clip) => clip.id === clipId ? { ...clip, ...patch } : clip) }) };
}

export function mixPreviewSummary(project, seconds = project.cursor || 0) {
  return project.tracks.flatMap((track) => track.clips.map((clip) => ({ track: track.name, clip: clip.title, active: seconds >= clip.start && seconds <= clip.start + clip.duration, effectiveVolume: Number((clip.volume * (track.muted ? 0 : 1)).toFixed(2)) }))).filter((item) => item.active);
}
