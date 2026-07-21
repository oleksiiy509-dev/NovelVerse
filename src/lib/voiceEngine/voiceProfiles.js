export const voiceProfiles = [
  ["narrator_neutral","Оповідач нейтральний","neutral","adult",1,1,0.1,0.5,0.5,"Balanced narration preview"],["narrator_dark","Оповідач темний","neutral","adult",0.85,0.9,0.25,0.25,0.45,"Darker narration"],["narrator_warm","Оповідач теплий","neutral","adult",1.05,0.95,0.05,0.65,0.45,"Warm narration"],["narrator_epic","Оповідач епічний","neutral","adult",0.9,0.9,0.15,0.45,0.75,"Epic narration"],
  ["male_child","Хлопчик","male","child",1.25,1.05,0.05,0.65,0.65,"Young male child"],["male_teen","Юнак-підліток","male","teenager",1.1,1.05,0.05,0.55,0.65,"Teen male"],["male_young_soft","Молодий чоловік м'який","male","young",1.02,1,0.05,0.55,0.5,"Soft young male"],["male_young_hero","Молодий герой","male","young",0.98,1.04,0.12,0.5,0.75,"Confident young male hero"],["male_adult_neutral","Дорослий чоловік","male","adult",0.92,0.98,0.1,0.45,0.55,"Neutral adult male"],["male_adult_deep","Глибокий чоловічий","male","adult",0.78,0.9,0.18,0.35,0.6,"Deep adult male"],["male_elderly","Літній чоловік","male","elderly",0.82,0.82,0.25,0.35,0.35,"Elderly male"],["male_elderly_rough","Хрипкий старий","male","elderly",0.75,0.78,0.45,0.25,0.38,"Rough elderly male"],
  ["female_child","Дівчинка","female","child",1.35,1.05,0.02,0.75,0.65,"Young female child"],["female_teen","Дівчина-підліток","female","teenager",1.22,1.04,0.03,0.7,0.65,"Teen female"],["female_young_soft","Молода жінка м'яка","female","young",1.15,1,0.03,0.7,0.5,"Soft young female"],["female_young_bright","Молода яскрава","female","young",1.2,1.05,0.02,0.85,0.75,"Bright young female"],["female_adult_neutral","Доросла жінка","female","adult",1.08,0.98,0.04,0.6,0.55,"Neutral adult female"],["female_adult_deep","Глибокий жіночий","female","adult",0.98,0.92,0.08,0.5,0.5,"Lower adult female"],["female_elderly","Літня жінка","female","elderly",1,0.82,0.18,0.45,0.35,"Elderly female"],["female_elderly_rough_bright","Літня жінка хрипка","female","elderly",1.02,0.8,0.32,0.55,0.38,"Rough elderly female"],
  ["system_neutral","Система","neutral","unknown",1,0.92,0,0.4,0.35,"Mechanical system preview"],["creature_dark","Темна істота","unknown","unknown",0.72,0.82,0.5,0.2,0.65,"Creature"],["unknown_neutral","Невідомий","unknown","unknown",1,1,0.05,0.5,0.45,"Unknown speaker"]
].map(([id,label,gender,ageGroup,basePitch,baseRate,roughness,brightness,energy,description]) => ({ id,label,gender,ageGroup,basePitch,baseRate,roughness,brightness,energy,description }));
export const voiceProfileMap = Object.fromEntries(voiceProfiles.map((profile) => [profile.id, profile]));
export function chooseVoiceProfile({ gender = "unknown", ageGroup = "unknown", role = "unknown", rough = false } = {}) {
  if (role === "narrator") return "narrator_neutral";
  if (role === "system") return "system_neutral";
  if (role === "creature") return "creature_dark";
  if (gender === "male" && ageGroup === "elderly") return rough ? "male_elderly_rough" : "male_elderly";
  if (gender === "male" && ageGroup === "young") return "male_young_hero";
  if (gender === "male" && ageGroup === "child") return "male_child";
  if (gender === "male" && ageGroup === "teenager") return "male_teen";
  if (gender === "male") return "male_adult_neutral";
  if (gender === "female" && ageGroup === "elderly") return rough ? "female_elderly_rough_bright" : "female_elderly";
  if (gender === "female" && ageGroup === "young") return "female_young_soft";
  if (gender === "female" && ageGroup === "child") return "female_child";
  if (gender === "female" && ageGroup === "teenager") return "female_teen";
  if (gender === "female") return "female_adult_neutral";
  return "unknown_neutral";
}
export function getPreviewSettings(profileId) { const p = voiceProfileMap[profileId] || voiceProfileMap.unknown_neutral; return { pitch: p.basePitch, rate: p.baseRate }; }
