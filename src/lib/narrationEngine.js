export const NARRATION_ENGINE_VERSION = 3;
export const NARRATION_MODES = Object.freeze(["neutral", "audiobook", "cinematic", "dramatic", "horror", "emotional", "action", "whisper", "epic"]);
export const NARRATION_LEVELS = Object.freeze(["sentence", "paragraph", "scene"]);

const MODE = Object.freeze({
  neutral: { rate: 1, intensity: .25, pitch: 0, energy: .35, whisper: 0 },
  audiobook: { rate: .96, intensity: .42, pitch: 0, energy: .48, whisper: 0 },
  cinematic: { rate: .9, intensity: .58, pitch: -.03, energy: .62, whisper: .04 },
  dramatic: { rate: .86, intensity: .72, pitch: -.04, energy: .68, whisper: .02 },
  horror: { rate: .78, intensity: .7, pitch: -.1, energy: .42, whisper: .32 },
  emotional: { rate: .84, intensity: .68, pitch: .01, energy: .52, whisper: .08 },
  action: { rate: 1.14, intensity: .82, pitch: .04, energy: .9, whisper: 0 },
  whisper: { rate: .76, intensity: .38, pitch: -.06, energy: .25, whisper: .9 },
  epic: { rate: .82, intensity: .84, pitch: -.08, energy: .82, whisper: 0 },
});
const RX = {
  battle: /\b(battle|attack|charged|sword|gunfire|explosion|enemy|army|fight)\b/iu,
  horror: /\b(blood|corpse|dead|darkness|scream|terror|haunted|monster|horror)\b/iu,
  mystery: /\b(mystery|secret|clue|shadow|unknown|vanished|who|why)\b/iu,
  comedy: /\b(laughed|joke|ridiculous|funny|grinned|chuckled|oops)\b/iu,
  climax: /\b(love|died|death|forgive|goodbye|betrayed|truth|finally|never again)\b/iu,
  flashback: /\b(years? (?:ago|earlier)|remembered|memory|back then|once upon a time)\b/iu,
  announcement: /\b(attention|behold|hear ye|announced|declared|ladies and gentlemen)\b/iu,
  thought: /(?:\*[^*]+\*|\b(?:thought|wondered|to myself|in my mind)\b)/iu,
  revelation: /\b(truth|secret|revealed|realized|actually|was really|all along)\b/iu,
  emotional: /\b(love|hate|fear|hope|grief|joy|heart|tears?|cried|wept|sorry)\b/giu,
  location: /\b(?:in|at|to|from|across|entered(?: into)?)\s+(?:the\s+)?([A-Z][\p{L}'-]*(?:\s+[A-Z][\p{L}'-]*)*)/gu,
  object: /\b(?:the|this|that)\s+(key|ring|sword|letter|book|crown|door|weapon|photograph|map)\b/giu,
};
const clamp = (n, min = 0, max = 1) => Math.min(max, Math.max(min, n));
const round = (n) => Number(n.toFixed(2));
const hash = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0).toString(36); };
const words = (s) => (s.match(/[\p{L}\p{N}'-]+/gu) || []).length;

function timbrePlan(types, base) {
  if (types.includes("horror")) return { warmth: .25, brightness: .22, roughness: .34 };
  if (types.includes("battle")) return { warmth: .42, brightness: .68, roughness: .2 };
  if (types.includes("emotional_climax")) return { warmth: .72, brightness: .44, roughness: .12 };
  return { warmth: round(clamp(.5 + base.pitch)), brightness: round(clamp(.5 + base.energy * .2)), roughness: .08 };
}

function spans(text, level) {
  if (!text) return [];
  if (level === "scene") return [{ text, start: 0, end: text.length }];
  const rx = level === "paragraph" ? /[^\n]+(?:\n+|$)/g : /[^.!?\n]+(?:[.!?]+[”’"']?|\n+|$)/g;
  return [...text.matchAll(rx)].map((match) => ({ text: match[0], start: match.index, end: match.index + match[0].length })).filter((x) => x.text.length);
}
function classify(text) {
  const trimmed = text.trim();
  const dialogue = /^(?:[“"'—–-])/.test(trimmed) || /[“"]/.test(trimmed) || /\b(?:said|asked|replied|shouted|whispered)\b/iu.test(text);
  const types = [];
  if (dialogue) types.push("dialogue"); else types.push("narration");
  if (RX.thought.test(text)) types.push("internal_thought");
  for (const type of ["flashback", "announcement", "battle", "mystery", "horror", "comedy"]) if (RX[type].test(text)) types.push(type);
  if (RX.climax.test(text) && /[!?]|\b(?:cried|wept|screamed|died)\b/iu.test(text)) types.push("emotional_climax");
  return types;
}
function findEmphasis(text) {
  const found = [];
  const add = (match, type, weight) => found.push({ text: match[0], start: match.index, end: match.index + match[0].length, type, weight });
  for (const m of text.matchAll(/\b[A-Z][\p{L}'-]{2,}\b/gu)) if (m.index > 0 || !/^[A-Z][^A-Z]+$/.test(text.trim())) add(m, "name", .62);
  for (const m of text.matchAll(RX.location)) add({ 0: m[1], index: m.index + m[0].indexOf(m[1]) }, "location", .68);
  for (const m of text.matchAll(RX.object)) add({ 0: m[1], index: m.index + m[0].toLowerCase().lastIndexOf(m[1].toLowerCase()) }, "important_object", .64);
  for (const m of text.matchAll(RX.emotional)) add(m, "emotional_word", .72);
  for (const m of text.matchAll(new RegExp(RX.revelation.source, "giu"))) add(m, "revelation", .9);
  return found.sort((a, b) => a.start - b.start || b.weight - a.weight).filter((x, i, all) => !all.slice(0, i).some((old) => old.start === x.start && old.end === x.end));
}
function pausePlan(text, types, intensity) {
  let before = 100, after = /[!?][”’"']?\s*$/.test(text.trim()) ? 430 : /[.]\s*$/.test(text.trim()) ? 300 : 180;
  let kind = "natural";
  if (types.includes("emotional_climax")) { before = 650; after = 900; kind = "emotional"; }
  else if (types.includes("mystery") || types.includes("horror")) { before = 480; after = 720; kind = "suspense"; }
  else if (RX.revelation.test(text) || /[—…]/u.test(text)) { before = 500; after = 650; kind = "dramatic"; }
  if (words(text) > 30) after += 220;
  return { beforeMs: Math.round(before * (1 + intensity * .12)), afterMs: Math.round(after * (1 + intensity * .12)), kind, long: after >= 650 };
}
function breathingPlan(text, pause, rate) {
  const count = words(text); const plan = [];
  if (count > 18 || pause.beforeMs >= 450) plan.push({ type: pause.kind === "emotional" ? "silent_breath" : "inhale", position: "before", optional: count <= 24 });
  if (count > 32) plan.push({ type: "optional_breath", position: "midpoint", optional: true });
  if (/[!?]$/.test(text.trim()) || pause.afterMs >= 650) plan.push({ type: "exhale", position: "after", optional: rate > 1 });
  return plan;
}
function speakerFor(segment, options) {
  const mapped = options.speakers?.find((speaker) => segment.start >= speaker.start && segment.start < speaker.end);
  return { speakerId: mapped?.speakerId || mapped?.id || "narrator", speakerName: mapped?.speakerName || mapped?.name || "Narrator", voiceId: mapped?.voiceId || options.voiceId || "narrator-default" };
}

export function createNarrationPlan(chapterText, options = {}) {
  const sourceText = String(chapterText ?? ""); const mode = NARRATION_MODES.includes(options.mode) ? options.mode : "audiobook"; const level = NARRATION_LEVELS.includes(options.level) ? options.level : "sentence"; const base = MODE[mode];
  const previous = options.previousPlan; let cursorMs = 0;
  const segments = spans(sourceText, level).map((span, index) => {
    const id = `nar_${hash(`${span.start}:${span.end}:${span.text}`)}`; const old = previous?.segments?.find((item) => item.id === id); const speaker = speakerFor(span, options);
    if (old?.manualOverride || old?.manuallyEdited) { const kept = structuredClone(old); kept.source = { text: span.text, start: span.start, end: span.end }; kept.timeline = { ...kept.timeline, startMs: cursorMs }; cursorMs += kept.timeline.durationMs; return kept; }
    const types = classify(span.text); const emphasis = findEmphasis(span.text); let intensity = base.intensity;
    if (types.includes("battle") || types.includes("emotional_climax")) intensity += .16;
    if (types.includes("horror") || types.includes("mystery")) intensity += .08;
    const metadata = { speechRate: round(clamp(base.rate + (types.includes("battle") ? .08 : 0), .6, 1.35)), pause: null, emphasis, intensity: round(clamp(intensity)), breathing: [], pitchModifier: round(base.pitch), timbre: timbrePlan(types, base), energy: round(clamp(base.energy + (types.includes("battle") ? .1 : 0))), whisperLevel: round(clamp(base.whisper + (types.includes("internal_thought") ? .18 : 0))), emotionalWeight: round(clamp((types.includes("emotional_climax") ? .9 : .22) + emphasis.filter((x) => x.type === "emotional_word").length * .08)) };
    metadata.pause = pausePlan(span.text, types, metadata.intensity); metadata.breathing = breathingPlan(span.text, metadata.pause, metadata.speechRate);
    const spokenMs = Math.round(words(span.text) / (155 * metadata.speechRate) * 60000); const durationMs = metadata.pause.beforeMs + spokenMs + metadata.pause.afterMs;
    const result = { id, index, source: { text: span.text, start: span.start, end: span.end }, speaker, voiceAssignment: speaker.voiceId, classifications: types, metadata, timeline: { startMs: cursorMs, durationMs, endMs: cursorMs + durationMs }, manualOverride: false };
    cursorMs += durationMs; return result;
  });
  return { engine: "AI Narration Engine", version: NARRATION_ENGINE_VERSION, planId: options.planId || previous?.planId || `narration_${hash(sourceText)}`, chapterId: options.chapterId || null, source: { text: sourceText, fingerprint: hash(sourceText), length: sourceText.length }, mode, level, segments, timeline: { durationMs: cursorMs, segmentIds: segments.map((x) => x.id) }, preservation: { originalText: true, punctuation: true, speakerIdentity: true, voiceAssignment: true, manualOverrides: true } };
}

export function applyNarrationOverride(plan, segmentId, patch) {
  return { ...plan, segments: plan.segments.map((segment) => segment.id === segmentId ? { ...segment, ...patch, metadata: { ...segment.metadata, ...(patch.metadata || {}) }, speaker: { ...segment.speaker, ...(patch.speaker || {}) }, manualOverride: true } : segment) };
}

export function generateNarrationReport(plan) {
  const segments = plan.segments || []; const count = (type) => segments.filter((x) => x.classifications.includes(type)).length;
  return { planId: plan.planId, engineVersion: plan.version, mode: plan.mode, level: plan.level, sourceFingerprint: plan.source.fingerprint, sourcePreserved: segments.map((x) => x.source.text).join("") === plan.source.text, durationMs: plan.timeline.durationMs, segmentCount: segments.length, classificationSummary: Object.fromEntries(["dialogue", "narration", "internal_thought", "flashback", "announcement", "battle", "mystery", "horror", "comedy", "emotional_climax"].map((x) => [x, count(x)])), pauseSummary: { totalMs: segments.reduce((n, x) => n + x.metadata.pause.beforeMs + x.metadata.pause.afterMs, 0), dramatic: countPause(segments, "dramatic"), suspense: countPause(segments, "suspense"), emotional: countPause(segments, "emotional"), long: segments.filter((x) => x.metadata.pause.long).length }, emphasisCount: segments.reduce((n, x) => n + x.metadata.emphasis.length, 0), breathCount: segments.reduce((n, x) => n + x.metadata.breathing.length, 0), manualOverrideCount: segments.filter((x) => x.manualOverride).length, warnings: plan.source.text && !segments.length ? ["No narration segments generated."] : [] };
}
const countPause = (segments, kind) => segments.filter((x) => x.metadata.pause.kind === kind).length;
