import { chooseVoiceProfile, voiceProfileMap } from "./voiceEngine/voiceProfiles.js";
import { detectLanguage, stripChapterHtml } from "./voiceEngine/analyzer.js";

export const CHARACTER_VOICE_ENGINE_VERSION = "character-voice-engine-v1";
export const characterVoiceRegistryPrefix = "novelverse:characterVoiceRegistry:";
export const narratorCharacterId = "narrator";

const defaultNarrator = {
  id: narratorCharacterId,
  name: "Narrator",
  gender: "neutral",
  ageCategory: "adult",
  preferredVoice: "narrator_neutral",
  narrationOverrides: { rate: 1, pitch: 1, volume: 1 },
  aliases: ["Narrator", "Оповідач"],
  source: "system",
  manuallyAssigned: true,
  updatedAt: null,
};

const attributionVerbs = [
  "said", "asked", "answered", "replied", "whispered", "shouted", "cried", "muttered", "called",
  "сказав", "сказала", "спитав", "спитала", "відповів", "відповіла", "прошепотів", "прошепотіла", "вигукнув", "вигукнула",
  "сказал", "сказала", "спросил", "спросила", "ответил", "ответила", "прошептал", "прошептала", "крикнул", "крикнула",
].join("|");

function nowIso() { return new Date().toISOString(); }
function storageAvailable() { return typeof localStorage !== "undefined"; }
export function getCharacterVoiceRegistryKey(novelId = "global") { return `${characterVoiceRegistryPrefix}${novelId || "global"}`; }
export function slugCharacterName(name = "") { return String(name).trim().toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "") || "unknown"; }
function titleCaseName(name = "") { return String(name).trim().replace(/[“”"'«».,!?;:()[\]{}]/g, "").replace(/\s+/g, " "); }
function normalizeAge(value) { return ["child", "teenager", "young", "adult", "elderly", "unknown"].includes(value) ? value : "unknown"; }
function normalizeGender(value) { return ["male", "female", "neutral", "unknown"].includes(value) ? value : "unknown"; }
function normalizeProfile(value, fallback = "unknown_neutral") { return voiceProfileMap[value] ? value : fallback; }

export function createCharacterProfile(name, patch = {}) {
  const safeName = titleCaseName(name || patch.name || "Unknown");
  const gender = normalizeGender(patch.gender);
  const ageCategory = normalizeAge(patch.ageCategory || patch.age_group || patch.ageGroup);
  const preferredVoice = normalizeProfile(patch.preferredVoice || patch.voice_profile || patch.voiceProfile, chooseVoiceProfile({ gender, ageGroup: ageCategory }));
  return {
    id: patch.id || slugCharacterName(safeName),
    name: safeName,
    gender,
    ageCategory,
    preferredVoice,
    narrationOverrides: { rate: 1, pitch: 1, volume: 1, ...(patch.narrationOverrides || {}) },
    aliases: [...new Set([safeName, ...(patch.aliases || [])].filter(Boolean))],
    source: patch.source || "detected",
    manuallyAssigned: patch.manuallyAssigned === true,
    updatedAt: patch.updatedAt || nowIso(),
  };
}

export function getNarratorProfile() { return { ...defaultNarrator, updatedAt: nowIso() }; }

export function mergeCharacterRegistries(base = {}, incoming = {}) {
  const byId = new Map();
  [...(base.characters || []), ...(incoming.characters || [])].forEach((raw) => {
    if (!raw?.name && !raw?.id) return;
    const profile = raw.id === narratorCharacterId ? { ...getNarratorProfile(), ...raw, id: narratorCharacterId, preferredVoice: normalizeProfile(raw.preferredVoice, "narrator_neutral") } : createCharacterProfile(raw.name || raw.id, raw);
    const previous = byId.get(profile.id);
    byId.set(profile.id, previous ? { ...previous, ...profile, aliases: [...new Set([...(previous.aliases || []), ...(profile.aliases || [])])] } : profile);
  });
  if (!byId.has(narratorCharacterId)) byId.set(narratorCharacterId, getNarratorProfile());
  return { version: CHARACTER_VOICE_ENGINE_VERSION, novelId: incoming.novelId || base.novelId || "global", characters: [...byId.values()].sort((a, b) => (a.id === narratorCharacterId ? -1 : b.id === narratorCharacterId ? 1 : a.name.localeCompare(b.name))) };
}

export function loadCharacterRegistry(novelId = "global") {
  if (!storageAvailable()) return { version: CHARACTER_VOICE_ENGINE_VERSION, novelId, characters: [getNarratorProfile()] };
  try {
    const saved = JSON.parse(localStorage.getItem(getCharacterVoiceRegistryKey(novelId)) || "null");
    const characters = Array.isArray(saved?.characters) ? saved.characters.map((c) => createCharacterProfile(c.name, c)) : [];
    return mergeCharacterRegistries({ version: CHARACTER_VOICE_ENGINE_VERSION, novelId, characters: [getNarratorProfile()] }, { ...saved, characters });
  } catch {
    return { version: CHARACTER_VOICE_ENGINE_VERSION, novelId, characters: [getNarratorProfile()] };
  }
}

export function saveCharacterRegistry(novelId = "global", registry) {
  const next = mergeCharacterRegistries(loadCharacterRegistry(novelId), registry);
  if (storageAvailable()) localStorage.setItem(getCharacterVoiceRegistryKey(novelId), JSON.stringify(next));
  return next;
}

export function detectCharacterNames(content = "", knownCharacters = []) {
  const text = stripChapterHtml(content).slice(0, 180000);
  const names = new Map();
  const add = (name, confidence = 0.55) => {
    const clean = titleCaseName(name);
    if (!clean || clean.length < 2 || /^(he|she|i|you|він|вона|я|ти|он|она)$/iu.test(clean)) return;
    const id = slugCharacterName(clean);
    names.set(id, { name: clean, confidence: Math.max(confidence, names.get(id)?.confidence || 0) });
  };
  knownCharacters.forEach((c) => add(c.display_name || c.displayName || c.canonical_name || c.canonicalName || c.name, 0.9));
  const attrRx = new RegExp(`(?:${attributionVerbs})\\s+([\\p{Lu}][\\p{L}'’-]{1,}(?:\\s+[\\p{Lu}][\\p{L}'’-]{1,})?)|([\\p{Lu}][\\p{L}'’-]{1,}(?:\\s+[\\p{Lu}][\\p{L}'’-]{1,})?)\\s+(?:${attributionVerbs})`, "giu");
  for (const match of text.matchAll(attrRx)) add(match[1] || match[2], 0.82);
  const language = detectLanguage(text);
  const capitalRx = language === "en" ? /\b([A-Z][a-z’'-]{2,}(?:\s+[A-Z][a-z’'-]{2,})?)\b/g : /\b([А-ЯІЇЄҐЁ][а-яіїєґё’'-]{2,}(?:\s+[А-ЯІЇЄҐЁ][а-яіїєґё’'-]{2,})?)\b/gu;
  const counts = new Map();
  for (const match of text.matchAll(capitalRx)) counts.set(match[1], (counts.get(match[1]) || 0) + 1);
  counts.forEach((count, name) => { if (count >= 2) add(name, Math.min(0.75, 0.45 + count / 20)); });
  return [...names.values()].map(({ name, confidence }) => ({ ...createCharacterProfile(name), detectionConfidence: Number(confidence.toFixed(2)) }));
}

export function buildPersistentCharacterRegistry({ novelId = "global", content = "", knownCharacters = [], existingRegistry = null } = {}) {
  const detected = detectCharacterNames(content, knownCharacters);
  const registry = mergeCharacterRegistries(existingRegistry || loadCharacterRegistry(novelId), { novelId, characters: detected });
  return saveCharacterRegistry(novelId, registry);
}

export function updateCharacterProfile(novelId, characterId, patch = {}) {
  const registry = loadCharacterRegistry(novelId);
  const characters = registry.characters.map((c) => c.id === characterId ? createCharacterProfile(patch.name || c.name, { ...c, ...patch, id: characterId, manuallyAssigned: true, updatedAt: nowIso() }) : c);
  return saveCharacterRegistry(novelId, { ...registry, characters });
}

export function resolveCharacterVoiceForSegment(segment = {}, registry = {}) {
  const type = segment.type || segment.segment_type;
  if (type === "narration") return registry.characters?.find((c) => c.id === narratorCharacterId) || getNarratorProfile();
  const speaker = segment.speakerName || segment.speaker_name || segment.speakerId || segment.speaker_id;
  const speakerSlug = slugCharacterName(speaker || "");
  return registry.characters?.find((c) => c.id === speakerSlug || c.aliases?.some((a) => slugCharacterName(a) === speakerSlug)) || createCharacterProfile(speaker || "Unknown", { preferredVoice: segment.voiceProfile || segment.voice_profile });
}
