import { chooseVoiceProfile, voiceProfileMap } from "./voiceEngine/voiceProfiles.js";
import { detectLanguage, stripChapterHtml } from "./voiceEngine/analyzer.js";
import { defaultPiperVoiceId } from "./voiceWorker.js";

export const CHARACTER_VOICE_ENGINE_VERSION = "character-voice-engine-v2";
export const characterVoiceRegistryPrefix = "novelverse:characterVoiceRegistry:";
export const narratorCharacterId = "narrator";
export const characterVoiceSchema = {
  version: CHARACTER_VOICE_ENGINE_VERSION,
  fields: ["id", "name", "gender", "ageCategory", "role", "confidence", "speakingStyle", "defaultEmotion", "voiceProvider", "voiceId", "rate", "pitch", "volume", "pauseScale", "manualLock", "aliases"],
};

const genders = ["male", "female", "unknown"];
const ages = ["child", "teen", "young-adult", "adult", "elderly", "unknown"];
const roles = ["narrator", "protagonist", "supporting", "minor", "creature", "unknown"];
const emotions = ["neutral", "calm", "happy", "sad", "angry", "afraid", "whisper", "shout"];
const styles = ["neutral", "soft", "bright", "deep", "rough", "formal", "playful", "breathy", "commanding"];
const attributionVerbs = ["said", "asked", "answered", "replied", "whispered", "shouted", "cried", "muttered", "called", "yelled", "sobbed", "laughed", "сказав", "сказала", "спитав", "спитала", "відповів", "відповіла", "прошепотів", "прошепотіла", "вигукнув", "вигукнула", "сказал", "сказала", "спросил", "спросила", "ответил", "ответила", "прошептал", "прошептала", "крикнул", "крикнула"].join("|");
const malePronouns = /\b(he|him|his|himself|він|його|ним|он|его|ему|ним)\b/iu;
const femalePronouns = /\b(she|her|hers|herself|вона|її|нею|она|её|ей|нею)\b/iu;
const childRx = /\b(child|boy|girl|kid|little|дитина|хлопчик|дівчинка|мальчик|девочка)\b/iu;
const teenRx = /\b(teen|teenager|adolescent|юнак|дівчина|підліток|подросток)\b/iu;
const youngRx = /\b(young man|young woman|youth|молодий|молода|юный|юная)\b/iu;
const elderlyRx = /\b(old|elderly|aged|grandfather|grandmother|старий|стара|літній|дед|бабушка)\b/iu;

function nowIso() { return new Date().toISOString(); }
function storageAvailable() { return typeof localStorage !== "undefined"; }
export function getCharacterVoiceRegistryKey(novelId = "global") { return `${characterVoiceRegistryPrefix}${novelId || "global"}`; }
export function slugCharacterName(name = "") { return String(name).trim().toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "") || "unknown"; }
function titleCaseName(name = "") { return String(name).trim().replace(/[“”"'«».,!?;:()[\]{}]/g, "").replace(/\s+/g, " "); }
function clamp(n, min, max, fallback) { const value = Number(n); return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback; }
function pick(value, allowed, fallback = "unknown") { return allowed.includes(value) ? value : fallback; }
function normalizeAge(value) { return ({ teenager: "teen", young: "young-adult", young_adult: "young-adult" })[value] || pick(value, ages); }
function legacyPreferredVoice(patch, gender, ageCategory, role) { return voiceProfileMap[patch.preferredVoice || patch.voice_profile || patch.voiceProfile] ? (patch.preferredVoice || patch.voice_profile || patch.voiceProfile) : chooseVoiceProfile({ gender, ageGroup: ageCategory === "young-adult" ? "young" : ageCategory, role }); }
function uniqueAliases(items = []) { return [...new Set(items.map(titleCaseName).filter(Boolean))]; }
function confidence(value = {}) { return { gender: clamp(value.gender, 0, 1, 0), ageCategory: clamp(value.ageCategory, 0, 1, 0), role: clamp(value.role, 0, 1, 0), speaker: clamp(value.speaker, 0, 1, 0) }; }

export function getNarratorProfile() { return createCharacterProfile("Narrator", { id: narratorCharacterId, role: "narrator", gender: "unknown", ageCategory: "adult", speakingStyle: "neutral", defaultEmotion: "neutral", voiceId: "narrator_neutral", manualLock: true, source: "system", updatedAt: nowIso(), aliases: ["Narrator", "Оповідач"] }); }

export function createCharacterProfile(name, patch = {}) {
  const safeName = titleCaseName(name || patch.name || "Unknown");
  const gender = pick(patch.gender === "neutral" ? "unknown" : patch.gender, genders);
  const ageCategory = normalizeAge(patch.ageCategory || patch.age_group || patch.ageGroup);
  const role = pick(patch.role, roles);
  const voiceProvider = patch.voiceProvider || patch.provider || "piper";
  const voiceId = patch.voiceId || patch.voice_id || legacyPreferredVoice(patch, gender, ageCategory, role);
  const rate = clamp(patch.rate ?? patch.narrationOverrides?.rate, 0.5, 2, 1);
  const pitch = clamp(patch.pitch ?? patch.narrationOverrides?.pitch, 0, 2, 1);
  const volume = clamp(patch.volume ?? patch.narrationOverrides?.volume, 0, 1, 1);
  return {
    id: patch.id || slugCharacterName(safeName), name: safeName, gender, ageCategory, role,
    confidence: confidence(patch.confidence || { gender: patch.detectionConfidence, ageCategory: patch.detectionConfidence, role: patch.roleConfidence }),
    speakingStyle: pick(patch.speakingStyle || patch.style, styles, "neutral"), defaultEmotion: pick(patch.defaultEmotion || patch.emotion, emotions, "neutral"),
    voiceProvider, voiceId, preferredVoice: voiceId, rate, pitch, volume, pauseScale: clamp(patch.pauseScale ?? patch.pause_scale, 0.25, 3, 1),
    manualLock: patch.manualLock === true || patch.manuallyAssigned === true, manuallyAssigned: patch.manualLock === true || patch.manuallyAssigned === true,
    narrationOverrides: { rate, pitch, volume, ...(patch.narrationOverrides || {}) }, aliases: uniqueAliases([safeName, ...(patch.aliases || [])]), source: patch.source || "detected", updatedAt: patch.updatedAt || nowIso(),
  };
}

function matchIndexForContext(text, name, occurrence = 1) { let from = 0; for (let i = 0; i < occurrence; i += 1) { const pos = text.indexOf(name, from); if (pos < 0) return -1; from = pos + String(name).length; if (i === occurrence - 1) return pos; } return -1; }

function inferTraits(name, context, mentionCount, dialogueCount, totalDialogue) {
  let gender = "unknown", genderConfidence = 0;
  if (malePronouns.test(context)) { gender = "male"; genderConfidence = 0.72; }
  if (femalePronouns.test(context)) { gender = "female"; genderConfidence = genderConfidence ? 0 : 0.72; }
  const first = String(name).split(/\s+/)[0].toLowerCase();
  if (!genderConfidence && /^(alice|mira|anna|mary|julia|emma|sarah|olena|марія|анна|елена|оля)$/.test(first)) { gender = "female"; genderConfidence = 0.55; }
  if (!genderConfidence && /^(bob|kael|john|peter|michael|david|ivan|олег|іван|петро|сергій)$/.test(first)) { gender = "male"; genderConfidence = 0.55; }
  let ageCategory = "unknown", ageConfidence = 0;
  if (elderlyRx.test(context)) [ageCategory, ageConfidence] = ["elderly", 0.76]; else if (childRx.test(context)) [ageCategory, ageConfidence] = ["child", 0.76]; else if (teenRx.test(context)) [ageCategory, ageConfidence] = ["teen", 0.72]; else if (youngRx.test(context)) [ageCategory, ageConfidence] = ["young-adult", 0.65];
  const share = dialogueCount / Math.max(1, totalDialogue);
  const role = mentionCount >= 8 || share >= 0.4 ? "protagonist" : dialogueCount >= 2 || mentionCount >= 2 ? "supporting" : mentionCount >= 1 ? "minor" : "unknown";
  return { gender, ageCategory, role, confidence: { gender: genderConfidence, ageCategory: ageConfidence, role: role === "unknown" ? 0 : Math.min(0.9, 0.45 + share + mentionCount / 30) } };
}

export function detectUtteranceEmotion(text = "") { const t = String(text); if (/^[^.!?]*[!?]{2,}|\b(shouted|yelled|screamed|вигук|крик)\b/iu.test(t)) return "shout"; if (/\b(whisper|прошеп|шепот)\b/iu.test(t)) return "whisper"; if (/\b(angry|furious|rage|сердит|злий|гнів)\b/iu.test(t)) return "angry"; if (/\b(afraid|fear|terrified|scared|налякан|страх)\b/iu.test(t)) return "afraid"; if (/\b(sad|cried|sobbed|tears|сумн|плакав|сльоз)\b/iu.test(t)) return "sad"; if (/\b(happy|laughed|smiled|joy|щаслив|сміяв|раді)\b/iu.test(t)) return "happy"; if (/\b(calm|quietly|спокійно|тихо)\b/iu.test(t)) return "calm"; return "neutral"; }

export function detectCharacterNames(content = "", knownCharacters = []) {
  const text = stripChapterHtml(content).slice(0, 180000); const names = new Map(); const dialogueCounts = new Map();
  const add = (name, confidenceScore = 0.55, dialogue = false) => { const clean = titleCaseName(name); if (!clean || clean.length < 2 || /^(he|she|i|you|the|a|він|вона|я|ти|он|она)$/iu.test(clean)) return; const id = slugCharacterName(clean); const current = names.get(id) || { name: clean, mentions: 0, confidence: 0, contexts: [] }; current.mentions += 1; current.confidence = Math.max(confidenceScore, current.confidence); const pos = matchIndexForContext(text, name, current.mentions); if (pos >= 0) current.contexts.push(text.slice(Math.max(0, pos - 80), pos + String(name).length + 100)); names.set(id, current); if (dialogue) dialogueCounts.set(id, (dialogueCounts.get(id) || 0) + 1); };
  knownCharacters.forEach((c) => add(c.display_name || c.displayName || c.canonical_name || c.canonicalName || c.name, 0.9));
  const attrRx = new RegExp(`(?:${attributionVerbs})\\s+([\\p{Lu}][\\p{L}'’-]{1,}(?:\\s+[\\p{Lu}][\\p{L}'’-]{1,})?)|([\\p{Lu}][\\p{L}'’-]{1,}(?:\\s+[\\p{Lu}][\\p{L}'’-]{1,})?)\\s+(?:${attributionVerbs})`, "giu");
  for (const match of text.matchAll(attrRx)) add(match[1] || match[2], 0.84, true);
  const capitalRx = detectLanguage(text) === "en" ? /\b([A-Z][a-z’'-]{2,}(?:\s+[A-Z][a-z’'-]{2,})?)\b/g : /\b([А-ЯІЇЄҐЁ][а-яіїєґё’'-]{2,}(?:\s+[А-ЯІЇЄҐЁ][а-яіїєґё’'-]{2,})?)\b/gu;
  for (const match of text.matchAll(capitalRx)) add(match[1], 0.5);
  const totalDialogue = [...dialogueCounts.values()].reduce((a, b) => a + b, 0);
  return [...names.entries()].filter(([, v]) => v.mentions >= 2 || v.confidence >= 0.8).map(([id, item]) => { const inferred = inferTraits(item.name, item.contexts.join(" "), item.mentions, dialogueCounts.get(id) || 0, totalDialogue); return createCharacterProfile(item.name, { ...inferred, confidence: inferred.confidence, detectionConfidence: Number(item.confidence.toFixed(2)), roleConfidence: inferred.confidence.role }); });
}

function sameCharacter(a, b) { const aa = (a.aliases || [a.name]).map(slugCharacterName); const bb = (b.aliases || [b.name]).map(slugCharacterName); return aa.some((x) => bb.includes(x)) || aa.some((x) => bb.some((y) => x.includes(y) || y.includes(x))); }
export function mergeCharacterRegistries(base = {}, incoming = {}) { const result = []; const add = (raw) => { if (!raw?.name && !raw?.id) return; const profile = raw.id === narratorCharacterId ? { ...getNarratorProfile(), ...raw, id: narratorCharacterId, role: "narrator", manualLock: true } : createCharacterProfile(raw.name || raw.id, raw); const index = result.findIndex((c) => c.id === profile.id || sameCharacter(c, profile)); if (index < 0) result.push(profile); else { const prev = result[index]; const locked = prev.manualLock; result[index] = { ...prev, ...(locked ? {} : profile), aliases: uniqueAliases([...(prev.aliases || []), ...(profile.aliases || [])]), id: prev.id, manualLock: locked, manuallyAssigned: locked, updatedAt: nowIso() }; } };
  [getNarratorProfile(), ...(base.characters || []), ...(incoming.characters || [])].forEach(add); return { version: CHARACTER_VOICE_ENGINE_VERSION, novelId: incoming.novelId || base.novelId || "global", characters: result.sort((a, b) => (a.id === narratorCharacterId ? -1 : b.id === narratorCharacterId ? 1 : a.name.localeCompare(b.name))) }; }
export function migrateCharacterRegistry(saved, novelId = "global") { return mergeCharacterRegistries({ novelId, characters: [getNarratorProfile()] }, { ...saved, novelId, characters: saved?.characters || [] }); }
export function loadCharacterRegistry(novelId = "global") { if (!storageAvailable()) return migrateCharacterRegistry(null, novelId); try { return migrateCharacterRegistry(JSON.parse(localStorage.getItem(getCharacterVoiceRegistryKey(novelId)) || "null"), novelId); } catch { return migrateCharacterRegistry(null, novelId); } }
export function saveCharacterRegistry(novelId = "global", registry) { const next = migrateCharacterRegistry(registry, novelId); if (storageAvailable()) localStorage.setItem(getCharacterVoiceRegistryKey(novelId), JSON.stringify(next)); return next; }
export function buildPersistentCharacterRegistry({ novelId = "global", content = "", knownCharacters = [], existingRegistry = null } = {}) { return saveCharacterRegistry(novelId, mergeCharacterRegistries(existingRegistry || loadCharacterRegistry(novelId), { novelId, characters: detectCharacterNames(content, knownCharacters) })); }
export function updateCharacterProfile(novelId, characterId, patch = {}) { const registry = loadCharacterRegistry(novelId); return saveCharacterRegistry(novelId, { ...registry, characters: registry.characters.map((c) => c.id === characterId ? createCharacterProfile(patch.name || c.name, { ...c, ...patch, id: characterId, manualLock: true, updatedAt: nowIso() }) : c) }); }
export function resetCharacterToAutomatic(novelId, characterId) { const registry = loadCharacterRegistry(novelId); return saveCharacterRegistry(novelId, { ...registry, characters: registry.characters.map((c) => c.id === characterId && c.id !== narratorCharacterId ? createCharacterProfile(c.name, { ...c, manualLock: false, manuallyAssigned: false }) : c) }); }
export function mergeCharacterAliases(novelId, targetId, duplicateId) { const registry = loadCharacterRegistry(novelId); const target = registry.characters.find((c) => c.id === targetId); const duplicate = registry.characters.find((c) => c.id === duplicateId); if (!target || !duplicate || target.id === narratorCharacterId || duplicate.id === narratorCharacterId) return registry; return saveCharacterRegistry(novelId, { ...registry, characters: registry.characters.filter((c) => c.id !== duplicateId).map((c) => c.id === targetId ? { ...c, aliases: uniqueAliases([...(c.aliases || []), duplicate.name, ...(duplicate.aliases || [])]), updatedAt: nowIso() } : c) }); }
export function assignVoiceToProfile(profile = {}, availableVoices = []) { const provider = profile.voiceProvider || "piper"; if (provider === "piper") { const ids = availableVoices.map((v) => v.id || v.voice || v.name).filter(Boolean); return { provider, voice: ids.includes(profile.voiceId) ? profile.voiceId : ids[0] || defaultPiperVoiceId, safeFallback: !ids.includes(profile.voiceId) }; } return { provider, voice: profile.voiceId || "", safeFallback: true }; }
export function resolveCharacterVoiceForSegment(segment = {}, registry = {}) { const type = segment.type || segment.segment_type; if (type === "narration") return registry.characters?.find((c) => c.id === narratorCharacterId) || getNarratorProfile(); const raw = segment.characterId || segment.character_id || segment.speakerId || segment.speaker_id || segment.speakerName || segment.speaker_name; const speakerSlug = slugCharacterName(raw || ""); const match = registry.characters?.find((c) => c.id === raw || c.id === speakerSlug || c.aliases?.some((a) => slugCharacterName(a) === speakerSlug)); return match || registry.characters?.find((c) => c.id === narratorCharacterId) || getNarratorProfile(); }
export function attributeDialogueSegments(content = "", registry = {}) { const text = stripChapterHtml(content); const segments = []; const quoteRx = /[“"]([^”"]+)[”"]\s*(?:,?\s*)?(?:([A-ZА-ЯІЇЄҐЁ][\p{L}'’-]{1,})\s+)?([\p{L}'’-]+)?|([^“”"\n]+)/giu; let index = 0; for (const match of text.matchAll(quoteRx)) { const isQuote = Boolean(match[1]); const raw = (match[2] && new RegExp(attributionVerbs, "iu").test(match[3] || "")) ? match[2] : ""; const profile = isQuote ? resolveCharacterVoiceForSegment({ segment_type: "dialogue", speaker_name: raw }, registry) : getNarratorProfile(); const segmentText = (match[1] || match[4] || "").trim(); if (segmentText) segments.push({ segment_index: index++, type: isQuote ? "dialogue" : "narration", text: segmentText, characterId: profile.id, speakerName: profile.name, emotion: detectUtteranceEmotion(segmentText) }); } return segments; }
