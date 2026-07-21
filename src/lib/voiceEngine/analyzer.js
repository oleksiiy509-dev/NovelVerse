import uk from "./rules/uk.js";
import ru from "./rules/ru.js";
import en from "./rules/en.js";
import { chooseVoiceProfile } from "./voiceProfiles.js";

export const VOICE_ANALYSIS_VERSION = "voice-engine-local-v1";
const rulesByLanguage = { uk, ru, en };
const unknown = { speakerId: null, speakerName: "Невідомий", voiceProfile: "unknown_neutral", confidence: 0.25 };

export function stripChapterHtml(content = "") {
  return String(content).replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<\s*(p|div|br|li|h[1-6])[^>]*>/gi, "\n").replace(/<\s*\/(p|div|li|h[1-6])\s*>/gi, "\n").replace(/<\s*(em|i)[^>]*>/gi, " _").replace(/<\s*\/(em|i)\s*>/gi, "_ ").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\r\n/g, "\n").replace(/[\t ]+/g, " ").trim();
}
export function detectLanguage(text = "") { if (/[іїєґ]/iu.test(text)) return "uk"; if (/[ыэъ]/iu.test(text)) return "ru"; return /[а-яё]/iu.test(text) ? "uk" : "en"; }
function slug(value) { return String(value).toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "") || "unknown"; }
function cleanDialogue(line) { return line.replace(/^\s*[—–-]\s*/, "").replace(/^["“«„]|["”»]$/g, "").trim(); }
function splitParagraphs(text) { return text.split(/\n{2,}|\n/).map((p) => p.trim()).filter(Boolean); }
function makeCharacter(match, fallbackRole = "supporting") { const role = match.characterRole || fallbackRole; return { canonicalName: match.canonicalName, displayName: match.displayName || match.canonicalName, aliases: [match.canonicalName, match.displayName].filter(Boolean), gender: match.gender || "unknown", ageGroup: match.ageGroup || "unknown", characterRole: role, voiceProfile: chooseVoiceProfile({ gender: match.gender, ageGroup: match.ageGroup, role, rough: match.rough }), defaultEmotion: "neutral", description: "Inferred by local textual evidence.", confidence: 0.72, manuallyVerified: false }; }
function inferFromText(text, rules) { const found = rules.descriptors.find(([rx]) => rx.test(text)); return found ? makeCharacter(found[1]) : null; }
function emotionFor(text, context, rules) { const sample = `${text} ${context}`; const hit = rules.emotions.find(([rx]) => rx.test(sample)); let emotion = hit?.[1] || "neutral"; if (!hit && /!{2,}/.test(text)) emotion = "excited"; const intensity = Math.min(1, (hit ? 0.55 : 0.2) + (/!/.test(text) ? 0.15 : 0) + (/!{2,}/.test(text) ? 0.15 : 0) + (/\.\.\.|…/.test(text) ? 0.1 : 0)); return { emotion, intensity, confidence: hit ? 0.72 : emotion === "neutral" ? 0.45 : 0.5 }; }
function indexKnown(known = []) { const map = new Map(); known.forEach((c) => [c.canonical_name, c.canonicalName, c.display_name, c.displayName, ...(c.aliases || [])].filter(Boolean).forEach((name) => map.set(String(name).toLowerCase(), c))); return map; }
function resolveSpeaker(context, rules, knownMap, previousSpeaker) {
  for (const [name, c] of knownMap) if (name && context.toLowerCase().includes(name)) return { speakerId: c.id || slug(c.canonical_name || c.canonicalName || name), speakerName: c.display_name || c.displayName || c.canonical_name || c.canonicalName || name, voiceProfile: c.voice_profile || c.voiceProfile || "unknown_neutral", confidence: 0.86 };
  const inferred = inferFromText(context, rules);
  if (inferred) return { speakerId: slug(inferred.canonicalName), speakerName: inferred.displayName, voiceProfile: inferred.voiceProfile, confidence: 0.72, character: inferred };
  if (/\b(він|он|he)\b/iu.test(context) && previousSpeaker?.confidence >= 0.7) return { ...previousSpeaker, confidence: 0.55 };
  if (/\b(вона|она|she)\b/iu.test(context) && previousSpeaker?.confidence >= 0.7) return { ...previousSpeaker, confidence: 0.55 };
  return unknown;
}
function segmentFor(type, text, index, speaker, emo) { return { id: `${type}-${index}`, segmentIndex: index, type, segmentType: type, speakerId: speaker.speakerId, speakerName: speaker.speakerName, voiceProfile: speaker.voiceProfile, emotion: emo.emotion, intensity: emo.intensity, text: text.trim(), sourceStart: null, sourceEnd: null, confidence: Math.min(speaker.confidence ?? 0.8, emo.confidence ?? 0.8), manuallyEdited: false, analysisVersion: VOICE_ANALYSIS_VERSION }; }
export function analyzeChapterVoice({ chapterId, novelId, content, knownCharacters = [] }) {
  const clean = stripChapterHtml(content).slice(0, 180000); const language = detectLanguage(clean); const rules = rulesByLanguage[language] || uk; const knownMap = indexKnown(knownCharacters); const segments = []; const characters = new Map(); let previousSpeaker = null;
  const addChar = (c) => { if (!c) return; characters.set(slug(c.canonicalName), c); };
  splitParagraphs(clean).forEach((paragraph) => {
    const system = rules.system.test(paragraph); const thought = /^_.*_$/.test(paragraph) || rules.thought.test(paragraph);
    const dialogue = /^\s*[—–-]/.test(paragraph) || /^["“«„].+["”»]/u.test(paragraph);
    const attributionRx = new RegExp(`(?:${rules.attributionVerbs})\\s+([^,.!?:;—–-]+)|([^,.!?:;—–-]+)\\s+(?:${rules.attributionVerbs})`, "iu");
    if (dialogue) {
      const raw = cleanDialogue(paragraph); const parts = raw.split(/,\s*[—–-]\s*|,\s+(?=(?:сказ|відпов|прошеп|закрич|вигук|мов|спит|запит|повідом|said|answered|whispered|shouted|asked|сказал|ответил|прошептал|закричал))/iu); const spoken = (parts[0] || raw).replace(/^["“«„]|["”»]$/g, "").trim(); const attribution = parts.slice(1).join(" ") || raw.match(attributionRx)?.[0] || ""; const speaker = resolveSpeaker(attribution || paragraph, rules, knownMap, previousSpeaker); addChar(speaker.character); const emo = emotionFor(spoken, attribution, rules); segments.push(segmentFor("dialogue", spoken, segments.length, speaker, emo)); if (speaker.speakerId) previousSpeaker = speaker;
    } else if (system) { const speaker = { speakerId: "system", speakerName: "Система", voiceProfile: "system_neutral", confidence: 0.9 }; addChar(makeCharacter({ canonicalName: "system", displayName: "Система", gender: "neutral", characterRole: "system" }, "system")); segments.push(segmentFor("system", paragraph, segments.length, speaker, emotionFor(paragraph, "", rules))); }
    else if (thought) { segments.push(segmentFor("thought", paragraph.replace(/^_|_$/g, ""), segments.length, previousSpeaker || unknown, emotionFor(paragraph, "", rules))); }
    else { const inferred = inferFromText(paragraph, rules); addChar(inferred); segments.push(segmentFor("narration", paragraph, segments.length, { speakerId: "narrator", speakerName: language === "en" ? "Narrator" : "Оповідач", voiceProfile: "narrator_neutral", confidence: 0.95 }, emotionFor(paragraph, "", rules))); }
  });
  const avg = segments.reduce((sum, s) => sum + s.confidence, 0) / (segments.length || 1);
  return { version: VOICE_ANALYSIS_VERSION, language, characters: [...characters.values()], segments, warnings: clean.length >= 180000 ? ["Chapter was truncated at the safe analysis limit."] : [], statistics: { totalSegments: segments.length, narrationSegments: segments.filter((s) => s.type === "narration").length, dialogueSegments: segments.filter((s) => s.type === "dialogue").length, thoughtSegments: segments.filter((s) => s.type === "thought").length, unresolvedSpeakers: segments.filter((s) => s.type === "dialogue" && !s.speakerId).length, averageConfidence: Number(avg.toFixed(2)) }, chapterId, novelId };
}
