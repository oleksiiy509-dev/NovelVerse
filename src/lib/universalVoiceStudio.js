export const voiceProviderAdapters = [
  { id: "local-worker", label: "Local Voice Worker", models: ["piper", "generic-http", "kokoro-future", "custom-future"], voices: ["configured-local"], freeLocal: true },
  { id: "openai", label: "OpenAI TTS", models: ["gpt-4o-mini-tts", "tts-1-hd", "tts-1"], voices: ["alloy", "ash", "coral", "echo", "nova", "onyx", "shimmer"] },
  { id: "browser", label: "Browser SpeechSynthesis", models: ["device-default"], voices: ["system-default"] },
  { id: "elevenlabs", label: "ElevenLabs", models: ["multilingual-v2", "turbo-v2.5"], voices: ["provider-default"] },
  { id: "azure", label: "Azure Speech", models: ["neural"], voices: ["provider-default"] },
];

export const providerAdapterMap = Object.fromEntries(voiceProviderAdapters.map((adapter) => [adapter.id, adapter]));
export const emotionDefaults = ["neutral", "calm", "happy", "sad", "angry", "afraid", "determined", "mysterious"];
export const VOICE_STUDIO_VERSION = 2;
export const supportedLanguages = ["en", "uk", "ru", "es", "fr", "de", "it", "pt", "ja"];
export const voicePresets = {
  Audiobook: { rate: 1, pitch: 1, volume: 1, energy: 0.55, breathing: 0.15, pauseStyle: "natural", narrationStyle: "narrative", emotionPreset: "neutral" },
  Cinematic: { rate: 0.92, pitch: 0.96, volume: 1, energy: 0.78, breathing: 0.22, pauseStyle: "dramatic", narrationStyle: "cinematic", emotionPreset: "determined" },
  Horror: { rate: 0.82, pitch: 0.84, volume: 0.9, energy: 0.42, breathing: 0.38, pauseStyle: "suspenseful", narrationStyle: "intimate", emotionPreset: "afraid" },
  Fantasy: { rate: 0.94, pitch: 1.04, volume: 1, energy: 0.64, breathing: 0.18, pauseStyle: "dramatic", narrationStyle: "epic", emotionPreset: "mysterious" },
  Calm: { rate: 0.86, pitch: 1, volume: 0.86, energy: 0.28, breathing: 0.12, pauseStyle: "gentle", narrationStyle: "warm", emotionPreset: "calm" },
  Action: { rate: 1.16, pitch: 1.02, volume: 1, energy: 0.94, breathing: 0.3, pauseStyle: "short", narrationStyle: "urgent", emotionPreset: "determined" },
  Neutral: { rate: 1, pitch: 1, volume: 1, energy: 0.5, breathing: 0.1, pauseStyle: "natural", narrationStyle: "neutral", emotionPreset: "neutral" },
};

export const universalVoiceProfiles = [
  ["narrator", "Narrator", "openai", "gpt-4o-mini-tts", "alloy", 1, 1, 0.55, ["neutral", "calm"], "browser"],
  ["young_male", "Young Male", "openai", "gpt-4o-mini-tts", "echo", 1.05, 1.04, 0.66, ["neutral", "determined"], "browser"],
  ["mature_male", "Mature Male", "openai", "gpt-4o-mini-tts", "onyx", 0.92, 0.97, 0.58, ["neutral", "calm"], "browser"],
  ["elderly_male", "Elderly Male", "openai", "gpt-4o-mini-tts", "onyx", 0.82, 0.84, 0.38, ["calm", "tired"], "browser"],
  ["young_female", "Young Female", "openai", "gpt-4o-mini-tts", "nova", 1.16, 1.03, 0.68, ["neutral", "happy"], "browser"],
  ["mature_female", "Mature Female", "openai", "gpt-4o-mini-tts", "coral", 1.04, 0.96, 0.57, ["neutral", "calm"], "browser"],
  ["elderly_female", "Elderly Female", "openai", "gpt-4o-mini-tts", "shimmer", 0.98, 0.84, 0.36, ["calm", "sad"], "browser"],
  ["child", "Child", "openai", "gpt-4o-mini-tts", "shimmer", 1.32, 1.08, 0.72, ["happy", "afraid"], "browser"],
  ["villain", "Villain", "openai", "gpt-4o-mini-tts", "onyx", 0.88, 0.94, 0.62, ["mysterious", "angry"], "browser"],
  ["monster", "Monster", "openai", "gpt-4o-mini-tts", "onyx", 0.62, 0.78, 0.82, ["angry", "mysterious"], "browser"],
  ["spirit", "Spirit", "openai", "gpt-4o-mini-tts", "shimmer", 1.08, 0.96, 0.38, ["mysterious", "calm"], "browser"],
  ["robot", "Robot", "openai", "gpt-4o-mini-tts", "ash", 0.88, 0.9, 0.28, ["neutral"], "browser"],
  ["custom", "Custom", "browser", "device-default", "system-default", 1, 1, 0.5, ["neutral"], "openai"],
].map(([id, label, provider, model, voice, pitchModifier, speedModifier, energyModifier, emotionDefaults, fallbackProvider]) => ({ id, label, provider, model, voice, pitchModifier, speedModifier, energyModifier, emotionDefaults, fallbackProvider }));

export const universalVoiceProfileMap = Object.fromEntries(universalVoiceProfiles.map((profile) => [profile.id, profile]));

export function inferUniversalProfile(character = {}) {
  const role = character.character_role || character.role;
  const gender = character.gender;
  const age = character.age_group || character.ageGroup;
  if (role === "narrator") return "narrator";
  if (role === "creature") return "monster";
  if (role === "villain" || character.archetype === "villain") return "villain";
  if (role === "spirit") return "spirit";
  if (role === "system") return "robot";
  if (age === "child") return "child";
  if (gender === "male" && age === "elderly") return "elderly_male";
  if (gender === "male" && (age === "young" || age === "teenager")) return "young_male";
  if (gender === "male") return "mature_male";
  if (gender === "female" && age === "elderly") return "elderly_female";
  if (gender === "female" && (age === "young" || age === "teenager")) return "young_female";
  if (gender === "female") return "mature_female";
  return "custom";
}

export function resolveCharacterVoice({ character, assignment, profiles = universalVoiceProfiles, storyProgress = 0 }) {
  const profileId = assignment?.assignmentMode === "custom" ? assignment.profileId : inferUniversalProfile(character);
  const profile = profiles.find((item) => item.id === profileId) || universalVoiceProfileMap.custom;
  const evolution = assignment?.evolution || { pitchPerChapter: 0, speedPerChapter: 0, energyPerChapter: 0 };
  return {
    ...profile,
    pitchModifier: clamp(profile.pitchModifier + Number(evolution.pitchPerChapter || 0) * storyProgress, 0.4, 1.8),
    speedModifier: clamp(profile.speedModifier + Number(evolution.speedPerChapter || 0) * storyProgress, 0.5, 1.8),
    energyModifier: clamp(profile.energyModifier + Number(evolution.energyPerChapter || 0) * storyProgress, 0, 1),
    assignmentMode: assignment?.assignmentMode || "automatic",
  };
}

export function exportVoicePreset(profiles, assignments) {
  return JSON.stringify(createVoiceStudioBackup({ profiles, assignments }), null, 2);
}

export function importVoicePreset(text) {
  const parsed = migrateVoiceStudioState(JSON.parse(text));
  if (!Array.isArray(parsed.profiles) || typeof parsed.assignments !== "object") throw new Error("Invalid voice preset file.");
  return parsed;
}

export function normalizeVoiceProfile(profile = {}) {
  return { id: profile.id || `voice_${Date.now()}`, name: profile.name || profile.label || "Untitled voice", label: profile.label || profile.name || "Untitled voice", provider: profile.provider || "browser", voiceId: profile.voiceId || profile.voice || "system-default", voice: profile.voice || profile.voiceId || "system-default", model: profile.model || providerAdapterMap[profile.provider]?.models[0] || "device-default", language: profile.language || "en", rate: Number(profile.rate ?? profile.speedModifier ?? 1), pitch: Number(profile.pitch ?? profile.pitchModifier ?? 1), volume: Number(profile.volume ?? 1), energy: Number(profile.energy ?? profile.energyModifier ?? 0.5), breathing: Number(profile.breathing ?? 0.1), pauseStyle: profile.pauseStyle || "natural", narrationStyle: profile.narrationStyle || "neutral", emotionPreset: profile.emotionPreset || profile.emotionDefaults?.[0] || "neutral", version: Number(profile.version || 1), updatedAt: profile.updatedAt || new Date().toISOString() };
}

export function applyVoicePreset(profile, presetName) {
  if (!voicePresets[presetName]) throw new Error(`Unknown preset: ${presetName}`);
  return { ...normalizeVoiceProfile(profile), ...voicePresets[presetName], preset: presetName };
}

export function assignVoice(assignments, characterIds, profileId, options = {}) {
  return characterIds.reduce((next, characterId) => ({ ...next, [characterId]: { ...(next[characterId] || {}), assignmentMode: "custom", profileId, locked: Boolean(options.locked), assignedAt: new Date().toISOString() } }), { ...assignments });
}

export function validateVoiceStudio({ profiles = [], assignments = {}, narratorId } = {}) {
  const issues = [];
  const ids = new Set(profiles.map((profile) => profile.id));
  const narrators = profiles.filter((profile) => profile.id === narratorId || profile.role === "narrator");
  if (!narratorId || !ids.has(narratorId)) issues.push({ code: "missing_voice", severity: "error", message: "A narrator voice is required." });
  if (narrators.length > 1) issues.push({ code: "duplicate_narrator", severity: "error", message: "Only one narrator can be the default." });
  profiles.forEach((raw) => { const profile = normalizeVoiceProfile(raw); if (!providerAdapterMap[profile.provider]) issues.push({ code: "unsupported_provider", profileId: profile.id, severity: "error", message: `${profile.name} uses an unsupported provider.` }); if (!supportedLanguages.includes(profile.language)) issues.push({ code: "invalid_language", profileId: profile.id, severity: "error", message: `${profile.name} has an invalid language.` }); if (profile.rate < 0.5 || profile.rate > 2 || profile.pitch < 0.5 || profile.pitch > 2 || profile.volume < 0 || profile.volume > 1 || profile.energy < 0 || profile.energy > 1 || profile.breathing < 0 || profile.breathing > 1) issues.push({ code: "incompatible_settings", profileId: profile.id, severity: "warning", message: `${profile.name} has settings outside supported ranges.` }); });
  Object.entries(assignments).forEach(([characterId, assignment]) => { if (!assignment.profileId || !ids.has(assignment.profileId)) issues.push({ code: "missing_voice", characterId, severity: "error", message: `Character ${characterId} has no available voice.` }); });
  return issues;
}

export function createVoiceReport({ profiles = [], assignments = {}, characters = [], narratorId } = {}) {
  const used = new Set(Object.values(assignments).map((item) => item.profileId).filter(Boolean)); if (narratorId) used.add(narratorId);
  const conflicts = validateVoiceStudio({ profiles, assignments, narratorId });
  return { assignedVoices: characters.filter((character) => assignments[character.id]).map((character) => ({ character, profileId: assignments[character.id].profileId })), unusedVoices: profiles.filter((profile) => !used.has(profile.id)), conflicts, recommendations: [...(!narratorId ? ["Choose and mark a default narrator before rendering."] : []), ...(profiles.length < 2 ? ["Add a distinct dialogue voice for clearer character separation."] : []), ...(conflicts.length ? ["Resolve validation conflicts before rendering."] : ["Voice cast is ready for a preview render."])] };
}

export function createVoiceStudioBackup({ profiles = [], assignments = {}, narratorId = null, history = [], favorites = [] } = {}) { return { version: VOICE_STUDIO_VERSION, exportedAt: new Date().toISOString(), profiles, assignments, narratorId, history, favorites }; }
export function migrateVoiceStudioState(state = {}) { if (Number(state.version || 1) >= VOICE_STUDIO_VERSION) return { ...state, version: VOICE_STUDIO_VERSION }; return { ...state, version: VOICE_STUDIO_VERSION, profiles: (state.profiles || []).map(normalizeVoiceProfile), assignments: state.assignments || {}, narratorId: state.narratorId || state.profiles?.find((profile) => profile.id === "narrator")?.id || null, history: state.history || [], favorites: state.favorites || [], migratedAt: new Date().toISOString() }; }
export function versionVoiceProfile(profile, patch) { const previous = normalizeVoiceProfile(profile); return { profile: { ...previous, ...patch, version: previous.version + 1, updatedAt: new Date().toISOString() }, historyEntry: { profileId: previous.id, version: previous.version, snapshot: previous, savedAt: new Date().toISOString() } }; }

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}
