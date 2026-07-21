import { voiceProfileMap } from "./voiceProfiles.js";

const acoustic = (profileId, overrides = {}) => {
  const profile = voiceProfileMap[profileId] || voiceProfileMap.unknown_neutral;
  return { pitchOffset: 0, rateOffset: 0, energy: profile.energy ?? 0.5, roughness: profile.roughness ?? 0, brightness: profile.brightness ?? 0.5, stability: 0.5, styleStrength: 0.5, ...overrides };
};

const slot = (id, label, gender, ageGroup, roles, voiceProfile, description, options = {}) => ({
  id, label, gender, ageGroup, compatibleRoles: roles, defaultVoiceProfile: voiceProfile, acoustic: acoustic(voiceProfile, options.acoustic), exclusive: options.exclusive !== false, shareable: options.shareable === true, description,
});

export const voiceCastSlots = [
  slot("narrator_main", "Main narrator", "neutral", "adult", ["narrator"], "narrator_neutral", "Primary novel narrator."),
  slot("narrator_dark", "Dark narrator", "neutral", "adult", ["narrator"], "narrator_dark", "Darker narration identity."),
  slot("narrator_warm", "Warm narrator", "neutral", "adult", ["narrator"], "narrator_warm", "Warm narration identity."),
  slot("young_male_01", "Young male 01", "male", "young", ["supporting", "unknown"], "male_young_soft", "Young male supporting character."),
  slot("young_male_02", "Young male 02", "male", "young", ["supporting", "unknown"], "male_teen", "Light young male alternate."),
  slot("young_male_03", "Young male 03", "male", "young", ["supporting", "unknown"], "male_young_soft", "Additional young male identity."),
  slot("young_male_hero_01", "Young male hero 01", "male", "young", ["protagonist"], "male_young_hero", "Heroic young male protagonist."),
  slot("adult_male_01", "Adult male 01", "male", "adult", ["supporting", "unknown"], "male_adult_neutral", "Adult male identity."),
  slot("adult_male_deep_01", "Deep adult male 01", "male", "adult", ["antagonist", "supporting"], "male_adult_deep", "Deep adult male identity."),
  slot("adult_male_rough_01", "Rough adult male 01", "male", "adult", ["antagonist", "supporting"], "male_adult_deep", "Rougher adult male identity.", { acoustic: { roughness: 0.35 } }),
  slot("elderly_male_01", "Elderly male 01", "male", "elderly", ["supporting", "unknown"], "male_elderly", "Elderly male identity."),
  slot("elderly_male_rough_01", "Rough elderly male 01", "male", "elderly", ["supporting", "antagonist"], "male_elderly_rough", "Rough elderly male identity."),
  slot("elderly_male_soft_01", "Soft elderly male 01", "male", "elderly", ["supporting"], "male_elderly", "Softer elderly male identity.", { acoustic: { roughness: 0.12 } }),
  slot("young_female_01", "Young female 01", "female", "young", ["supporting", "unknown"], "female_young_soft", "Young female identity."),
  slot("young_female_02", "Young female 02", "female", "young", ["supporting", "unknown"], "female_teen", "Light young female alternate."),
  slot("young_female_bright_01", "Bright young female 01", "female", "young", ["protagonist", "supporting"], "female_young_bright", "Bright young female identity."),
  slot("adult_female_01", "Adult female 01", "female", "adult", ["supporting", "unknown"], "female_adult_neutral", "Adult female identity."),
  slot("adult_female_deep_01", "Deep adult female 01", "female", "adult", ["antagonist", "supporting"], "female_adult_deep", "Deep adult female identity."),
  slot("elderly_female_01", "Elderly female 01", "female", "elderly", ["supporting", "unknown"], "female_elderly", "Elderly female identity."),
  slot("elderly_female_rough_bright_01", "Rough bright elderly female 01", "female", "elderly", ["supporting", "antagonist"], "female_elderly_rough_bright", "Rough elderly female identity."),
  slot("elderly_female_soft_01", "Soft elderly female 01", "female", "elderly", ["supporting"], "female_elderly", "Soft elderly female identity.", { acoustic: { roughness: 0.08 } }),
  slot("child_male_01", "Child male 01", "male", "child", ["supporting", "unknown"], "male_child", "Child male identity."),
  slot("child_female_01", "Child female 01", "female", "child", ["supporting", "unknown"], "female_child", "Child female identity."),
  slot("system_01", "System 01", "neutral", "unknown", ["system"], "system_neutral", "System message identity."),
  slot("creature_dark_01", "Dark creature 01", "unknown", "unknown", ["creature", "antagonist"], "creature_dark", "Dark creature identity."),
  slot("unknown_01", "Unknown 01", "unknown", "unknown", ["unknown", "supporting"], "unknown_neutral", "Fallback unknown speaker identity.", { exclusive: false, shareable: true }),
];
export const voiceCastSlotMap = Object.fromEntries(voiceCastSlots.map((s) => [s.id, s]));
