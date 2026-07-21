export const voiceProviderAdapters = [
  { id: "openai", label: "OpenAI TTS", models: ["gpt-4o-mini-tts", "tts-1-hd", "tts-1"], voices: ["alloy", "ash", "coral", "echo", "nova", "onyx", "shimmer"] },
  { id: "browser", label: "Browser SpeechSynthesis", models: ["device-default"], voices: ["system-default"] },
  { id: "elevenlabs", label: "ElevenLabs", models: ["multilingual-v2", "turbo-v2.5"], voices: ["provider-default"] },
  { id: "azure", label: "Azure Speech", models: ["neural"], voices: ["provider-default"] },
];

export const providerAdapterMap = Object.fromEntries(voiceProviderAdapters.map((adapter) => [adapter.id, adapter]));
export const emotionDefaults = ["neutral", "calm", "happy", "sad", "angry", "afraid", "determined", "mysterious"];

export const universalVoiceProfiles = [
  ["narrator", "Narrator", "openai", "gpt-4o-mini-tts", "alloy", 1, 1, 0.55, ["neutral", "calm"], "browser"],
  ["young_male", "Young Male", "openai", "gpt-4o-mini-tts", "echo", 1.05, 1.04, 0.66, ["neutral", "determined"], "browser"],
  ["mature_male", "Mature Male", "openai", "gpt-4o-mini-tts", "onyx", 0.92, 0.97, 0.58, ["neutral", "calm"], "browser"],
  ["elderly_male", "Elderly Male", "openai", "gpt-4o-mini-tts", "onyx", 0.82, 0.84, 0.38, ["calm", "tired"], "browser"],
  ["young_female", "Young Female", "openai", "gpt-4o-mini-tts", "nova", 1.16, 1.03, 0.68, ["neutral", "happy"], "browser"],
  ["mature_female", "Mature Female", "openai", "gpt-4o-mini-tts", "coral", 1.04, 0.96, 0.57, ["neutral", "calm"], "browser"],
  ["elderly_female", "Elderly Female", "openai", "gpt-4o-mini-tts", "shimmer", 0.98, 0.84, 0.36, ["calm", "sad"], "browser"],
  ["child", "Child", "openai", "gpt-4o-mini-tts", "shimmer", 1.32, 1.08, 0.72, ["happy", "afraid"], "browser"],
  ["monster", "Monster", "openai", "gpt-4o-mini-tts", "onyx", 0.62, 0.78, 0.82, ["angry", "mysterious"], "browser"],
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
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), profiles, assignments }, null, 2);
}

export function importVoicePreset(text) {
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed.profiles) || typeof parsed.assignments !== "object") throw new Error("Invalid voice preset file.");
  return parsed;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}
