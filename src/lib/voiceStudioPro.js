export const VOICE_STUDIO_PROFILE_KEY = "novelverse.voiceStudio.profiles.v1";

export const defaultVoiceStudioProfile = Object.freeze({
  id: "narrator-pro",
  name: "Narrator PRO",
  voice: "novelverse-narrator",
  language: "en",
  speed: 1,
  pitch: 1,
  energy: 0.65,
  pauseLength: 320,
});

const ranges = { speed: [0.5, 1.5], pitch: [0.5, 1.5], energy: [0, 1], pauseLength: [0, 1200] };
const clamp = (value, [min, max]) => Math.min(max, Math.max(min, Number(value)));

export function normalizeStudioProfile(profile = {}) {
  return {
    ...defaultVoiceStudioProfile,
    ...profile,
    id: String(profile.id || `profile-${Date.now()}`),
    name: String(profile.name || "Untitled profile").trim().slice(0, 80),
    ...Object.fromEntries(Object.entries(ranges).map(([key, range]) => [key, clamp(profile[key] ?? defaultVoiceStudioProfile[key], range)])),
  };
}

export function readStudioProfiles(storage = localStorage) {
  try {
    const profiles = JSON.parse(storage.getItem(VOICE_STUDIO_PROFILE_KEY) || "[]");
    return Array.isArray(profiles) ? profiles.map(normalizeStudioProfile) : [];
  } catch {
    return [];
  }
}

export function saveStudioProfile(profile, storage = localStorage) {
  const normalized = normalizeStudioProfile(profile);
  const profiles = readStudioProfiles(storage);
  const next = [...profiles.filter(({ id }) => id !== normalized.id), normalized];
  storage.setItem(VOICE_STUDIO_PROFILE_KEY, JSON.stringify(next));
  return next;
}

export function voiceStudioSynthesisOptions(profile) {
  const normalized = normalizeStudioProfile(profile);
  return { rate: normalized.speed, pitch: normalized.pitch, energy: normalized.energy, pauseLengthMs: normalized.pauseLength };
}
