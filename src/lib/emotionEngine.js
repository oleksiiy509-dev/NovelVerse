export const EMOTION_ENGINE_VERSION = 1;
export const EMOTIONS = Object.freeze(["neutral", "happy", "sad", "angry", "fear", "surprise", "suspense", "mystery", "excitement", "calm"]);
export const CONTEXTS = Object.freeze(["emotionalClimax", "dialogueTension", "internalMonologue", "battle", "comedy", "romance", "horror"]);

const rules = [
  ["horror", /\b(blood|corpse|scream|monster|haunt|terror|dead)\b/i],
  ["battle", /\b(sword|gun|attack|fight|battle|strike|enemy|explosion)\b/i],
  ["romance", /\b(love|kiss|heart|darling|embrace|beloved)\b/i],
  ["comedy", /\b(laugh|joke|funny|ridiculous|giggle|oops)\b/i],
  ["fear", /\b(afraid|fear|terrified|panic|trembl|danger)\w*/i],
  ["angry", /\b(angry|rage|furious|hate|damn|shouted?)\b/i],
  ["sad", /\b(sad|cry|cried|tears?|grief|alone|lost|sorry)\b/i],
  ["happy", /\b(happy|joy|smile|delight|wonderful|glad)\w*/i],
  ["surprise", /\b(suddenly|unexpected|astonish|surpris|gasp)\w*/i],
  ["mystery", /\b(secret|unknown|clue|myster|shadow|strange)\w*/i],
  ["suspense", /\b(wait|silence|slowly|behind|closer|watching)\b/i],
  ["excitement", /\b(excited|hurry|victory|amazing|incredible|adventure)\b/i],
  ["calm", /\b(calm|peace|gentle|quiet|softly|serene)\w*/i],
];

const profiles = {
  neutral: [0, 0, 0, "none", 0, 35, 0], happy: [8, 6, -8, "moderate", 5, 65, 0], sad: [-10, -14, 18, "moderate", 18, 28, 8],
  angry: [5, 14, -12, "strong", 8, 90, 0], fear: [12, 10, 8, "strong", 30, 75, 22], surprise: [15, 12, 5, "strong", 15, 80, 0],
  suspense: [-6, -12, 28, "moderate", 20, 48, 32], mystery: [-8, -10, 22, "moderate", 16, 42, 28], excitement: [12, 18, -15, "strong", 10, 92, 0], calm: [-4, -12, 15, "light", 8, 25, 10],
};

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(Number(value) || 0)));
function stableId(text, index) { let hash = 2166136261; for (const char of text) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); } return `emotion-${index}-${(hash >>> 0).toString(16)}`; }

export function splitSentences(text = "") {
  const result = []; const matcher = /[^.!?\n]+(?:[.!?]+["'”’)]*)?|\n+/g; let match;
  while ((match = matcher.exec(String(text)))) if (!/^\n+$/.test(match[0]) && match[0].trim()) result.push({ text: match[0], start: match.index, end: matcher.lastIndex });
  return result;
}

function detectContext(text, emotion, intensity) {
  const dialogue = /^[\s“"']/.test(text) && /[”"']/.test(text.trim().slice(1));
  return {
    emotionalClimax: intensity >= 80 || /!{2,}|\b(finally|never again|this is it)\b/i.test(text),
    dialogueTension: dialogue && (/[!?]/.test(text) || ["angry", "fear", "suspense"].includes(emotion)),
    internalMonologue: /\b(I thought|I wondered|to myself|in my mind)\b/i.test(text) || /^\s*[‘']/.test(text),
    battle: rules[1][1].test(text), comedy: rules[3][1].test(text), romance: rules[2][1].test(text), horror: rules[0][1].test(text),
  };
}

export function detectEmotion(text = "") {
  const candidates = rules.filter(([, pattern]) => pattern.test(text));
  let emotion = candidates.find(([name]) => EMOTIONS.includes(name))?.[0] || "neutral";
  if (candidates[0]?.[0] === "horror") emotion = "fear";
  if (candidates[0]?.[0] === "battle") emotion = /victory|amazing/i.test(text) ? "excitement" : "angry";
  if (candidates[0]?.[0] === "romance") emotion = /lost|tears|sorry/i.test(text) ? "sad" : "happy";
  if (candidates[0]?.[0] === "comedy") emotion = "happy";
  const punctuation = (text.match(/[!?]/g) || []).length * 8 + (text.match(/\b[A-Z]{3,}\b/g) || []).length * 12;
  const intensity = clamp((emotion === "neutral" ? 20 : 48) + punctuation + Math.min(24, candidates.length * 8));
  return { emotion, intensity, contexts: detectContext(text, emotion, intensity) };
}

export function speechMetadata(emotion, intensity) {
  const [pitch, rate, pause, emphasis, breathing, energy, whisper] = profiles[emotion] || profiles.neutral; const scale = clamp(intensity) / 100;
  return { pitchModifier: clamp(pitch * scale, -30, 30), rateModifier: clamp(rate * scale, -30, 30), pauseModifier: clamp(pause * scale, -30, 40), emphasis, breathing: clamp(breathing * scale), energy: clamp(energy * (.45 + scale * .55)), whisperLevel: clamp(whisper * scale) };
}

export function analyzeEmotions(text, previous = []) {
  const overrides = new Map(previous.filter((item) => item.manualOverride).map((item) => [item.id, item]));
  return splitSentences(text).map((sentence, index) => {
    const id = stableId(sentence.text, index); const detected = detectEmotion(sentence.text); const generated = { id, index, ...sentence, ...detected, metadata: speechMetadata(detected.emotion, detected.intensity), manualOverride: false };
    const saved = overrides.get(id); return saved ? { ...generated, ...saved, text: sentence.text, start: sentence.start, end: sentence.end, id, manualOverride: true } : generated;
  });
}

export function applyEmotionOverride(items, id, patch) {
  return items.map((item) => item.id === id ? { ...item, ...patch, metadata: { ...item.metadata, ...(patch.metadata || {}) }, manualOverride: true } : item);
}

export function createEmotionTimeline(items) {
  return items.map((item) => ({ id: item.id, index: item.index, emotion: item.emotion, intensity: item.intensity, contexts: CONTEXTS.filter((key) => item.contexts[key]), manualOverride: item.manualOverride }));
}

export function createEmotionReport(items) {
  const counts = Object.fromEntries(EMOTIONS.map((emotion) => [emotion, 0])); items.forEach((item) => { counts[item.emotion] = (counts[item.emotion] || 0) + 1; });
  const contextCounts = Object.fromEntries(CONTEXTS.map((context) => [context, items.filter((item) => item.contexts[context]).length]));
  const peak = items.reduce((best, item) => !best || item.intensity > best.intensity ? item : best, null);
  return { version: EMOTION_ENGINE_VERSION, sentences: items.length, averageIntensity: items.length ? Math.round(items.reduce((sum, item) => sum + item.intensity, 0) / items.length) : 0, emotions: counts, contexts: contextCounts, manualOverrides: items.filter((item) => item.manualOverride).length, peak: peak ? { id: peak.id, index: peak.index, emotion: peak.emotion, intensity: peak.intensity } : null };
}

export function createEmotionStorage(storage = globalThis.localStorage) {
  const memory = new Map(); const target = storage || { getItem: (key) => memory.get(key) || null, setItem: (key, value) => memory.set(key, value) };
  return { load(chapterId) { const raw = target.getItem(`novelverse.emotions.v${EMOTION_ENGINE_VERSION}:${chapterId}`); return raw ? JSON.parse(raw) : []; }, save(chapterId, items) { target.setItem(`novelverse.emotions.v${EMOTION_ENGINE_VERSION}:${chapterId}`, JSON.stringify(items)); return items; } };
}
