export const supportedVoiceLanguages = ["uk", "ru", "en"];
export const transformationEngineVersion = "voice-transform-v1";

export const safeVoiceVariationRanges = Object.freeze({
  pitch_semitones: [-4, 4], formant_shift: [-0.18, 0.18], speed: [0.82, 1.18], energy: [0.25, 0.85], roughness: [0, 0.45], breathiness: [0, 0.45], warmth: [0.2, 0.85], brightness: [0.15, 0.85], resonance: [0.2, 0.85], stability: [0.45, 1], emotional_range: [0.1, 0.9],
});

const base = { base_provider: "browser", base_model: "device-default", base_voice: "system-default", pitch_semitones: 0, formant_shift: 0, speed: 1, energy: 0.55, roughness: 0.08, breathiness: 0.08, warmth: 0.5, brightness: 0.5, resonance: 0.5, stability: 0.85, emotional_range: 0.45, post_processing_enabled: true, version: 1, languages: supportedVoiceLanguages };
const profile = (id, name, patch = {}) => validateVoiceVariationProfile({ ...base, id, name, ...patch });

export const defaultVoiceVariationProfiles = [
  profile("narrator_neutral", "Narrator Neutral", { stability: 0.92, emotional_range: 0.35 }),
  profile("young_male", "Young Male", { pitch_semitones: 1.2, formant_shift: 0.04, speed: 1.04, energy: 0.62, brightness: 0.56 }),
  profile("mature_male", "Mature Male", { pitch_semitones: -0.8, formant_shift: -0.04, speed: 0.98, warmth: 0.62, resonance: 0.58 }),
  profile("elderly_male", "Elderly Male", { pitch_semitones: -1.2, formant_shift: -0.06, speed: 0.92, energy: 0.42, roughness: 0.18, breathiness: 0.16 }),
  profile("young_female", "Young Female", { pitch_semitones: 1.6, formant_shift: 0.05, speed: 1.05, energy: 0.62, brightness: 0.6 }),
  profile("mature_female", "Mature Female", { pitch_semitones: 0.8, formant_shift: 0.02, speed: 0.99, warmth: 0.58 }),
  profile("elderly_female", "Elderly Female", { pitch_semitones: 0.2, formant_shift: -0.04, speed: 0.91, energy: 0.42, roughness: 0.17, breathiness: 0.18 }),
  profile("child", "Child", { pitch_semitones: 2.2, formant_shift: 0.08, speed: 1.07, energy: 0.66, brightness: 0.64 }),
  profile("villain", "Villain", { pitch_semitones: -1.4, formant_shift: -0.06, speed: 0.94, roughness: 0.16, warmth: 0.38, resonance: 0.65 }),
  profile("monster", "Monster", { pitch_semitones: -2.4, formant_shift: -0.1, speed: 0.9, energy: 0.7, roughness: 0.32, resonance: 0.74, stability: 0.65 }),
  profile("spirit", "Spirit", { pitch_semitones: 1.4, formant_shift: 0.06, speed: 0.96, breathiness: 0.28, energy: 0.42, warmth: 0.35 }),
  profile("robot", "Robot", { pitch_semitones: -0.6, formant_shift: 0, speed: 0.97, roughness: 0.04, breathiness: 0, stability: 0.98, emotional_range: 0.16 }),
];
export const defaultVoiceVariationProfileMap = Object.fromEntries(defaultVoiceVariationProfiles.map((p) => [p.id, p]));

export const temporaryVoiceStateModifiers = Object.freeze({
  wounded: { energy: -0.16, roughness: 0.12, breathiness: 0.1, speed: -0.04 }, exhausted: { energy: -0.2, breathiness: 0.14, speed: -0.08 }, frightened: { pitch_semitones: 0.7, speed: 0.06, stability: -0.18 }, angry: { energy: 0.14, roughness: 0.08, speed: 0.03 }, whispering: { energy: -0.22, breathiness: 0.22, brightness: -0.08 }, crying: { stability: -0.22, breathiness: 0.14, speed: -0.05 }, possessed: { pitch_semitones: -1, formant_shift: -0.05, roughness: 0.16, stability: -0.2 }, underwater: { brightness: -0.18, energy: -0.12, resonance: -0.08 }, masked: { brightness: -0.12, resonance: 0.1 }, distant: { energy: -0.24, brightness: -0.14 },
});

export function validateVoiceVariationProfile(candidate) {
  for (const key of ["id", "name", "base_provider", "base_model", "base_voice", "version"]) if (candidate[key] === undefined || candidate[key] === "") throw new Error(`Voice variation profile missing ${key}.`);
  const next = { ...candidate, languages: candidate.languages?.length ? candidate.languages : supportedVoiceLanguages };
  for (const [key, [min, max]] of Object.entries(safeVoiceVariationRanges)) {
    const value = Number(next[key]);
    if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${key} must be between ${min} and ${max}.`);
    next[key] = value;
  }
  next.version = Number(next.version);
  return next;
}

export function applyTemporaryVoiceState(profile, state) {
  const states = Array.isArray(state) ? state : state ? [state] : [];
  const merged = { ...profile, appliedTemporaryStates: states.filter((item) => temporaryVoiceStateModifiers[item]) };
  for (const name of merged.appliedTemporaryStates) for (const [key, delta] of Object.entries(temporaryVoiceStateModifiers[name])) merged[key] = Number(merged[key] || 0) + delta;
  for (const [key, [min, max]] of Object.entries(safeVoiceVariationRanges)) merged[key] = Math.min(max, Math.max(min, Number(merged[key])));
  return validateVoiceVariationProfile({ ...merged, id: profile.id, name: profile.name, version: profile.version });
}

export function evolveVoiceProfile(profile, evolution, progress = 1) {
  const amount = Math.max(0, Math.min(1, Number(progress) || 0));
  const target = defaultVoiceVariationProfileMap[evolution?.targetProfileId] || evolution?.targetProfile;
  if (!target) return validateVoiceVariationProfile(profile);
  const evolved = { ...profile };
  for (const key of Object.keys(safeVoiceVariationRanges)) evolved[key] = Number(profile[key]) + (Number(target[key]) - Number(profile[key])) * amount;
  return validateVoiceVariationProfile({ ...evolved, version: Number(profile.version || 1) + 1, evolutionReason: evolution.reason || "character-evolution" });
}

export function routeVoiceForLanguage(profile, language, fallbackProfile = defaultVoiceVariationProfileMap.narrator_neutral) {
  const lang = String(language || "auto").slice(0, 2).toLowerCase();
  if (lang === "au" || lang === "auto" || profile.languages?.includes(lang)) return { profile, warning: null };
  return { profile: fallbackProfile, warning: `Voice ${profile.name} does not support ${language}; using configured fallback ${fallbackProfile.name}.` };
}

export function buildVoiceSegmentCacheIdentity({ profile, temporaryState, engineVersion = transformationEngineVersion }) {
  return { base_provider: profile.base_provider, model: profile.base_model, voice: profile.base_voice, profile_id: profile.id, profile_version: profile.version, temporary_state: Array.isArray(temporaryState) ? temporaryState.join("+") : (temporaryState || "none"), transformation_engine_version: engineVersion };
}

export function normalizeAudioOutputOptions(options = {}) { return { sampleRate: Number(options.sampleRate || 44100), channels: Number(options.channels || 1), loudnessLufs: Number(options.loudnessLufs || -16), silencePaddingMs: Number(options.silencePaddingMs || 120), outputFormat: options.outputFormat || "mp3" }; }
