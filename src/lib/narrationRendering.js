import { createNarrationPlan } from "./narrationEngine.js";

const defaultNarratorVoiceId = "uk_UA-ukrainian_tts-medium";

const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function narrationParameters(segment, { voice = defaultNarratorVoiceId, baseRate = 1, basePitch = 1 } = {}) {
  const metadata = segment.metadata;
  return { voice, speaker: "Narrator", characterId: "narrator", rate: finite(baseRate, 1) * metadata.speechRate, speakingRate: finite(baseRate, 1) * metadata.speechRate, pitch: finite(basePitch, 1) + metadata.pitchModifier, timbre: metadata.timbre, pauseBefore: metadata.pause.beforeMs, pauseAfter: metadata.pause.afterMs, pauses: metadata.pause, energy: metadata.energy, emphasis: metadata.emphasis, whisper: metadata.whisperLevel, breathing: metadata.breathing, narrationEngine: { version: segment.engineVersion, segmentId: segment.id, classifications: segment.classifications } };
}

/** Analyze first, then return one synthesis request per sentence with one fixed narrator. */
export function prepareNarratedSentences(text, options = {}) {
  const plan = createNarrationPlan(text, { ...options, level: "sentence", voiceId: options.voice || defaultNarratorVoiceId });
  return plan.segments.map((segment) => ({ text: segment.source.text.trim(), type: "narration", emotion: segment.classifications.includes("emotional_climax") ? "emotional" : segment.classifications.includes("horror") ? "fear" : "normal", ...narrationParameters({ ...segment, engineVersion: plan.version }, options) })).filter((segment) => segment.text);
}

export function prepareNarratedChapterSegments(segments = [], options = {}) {
  const voice = options.voice || defaultNarratorVoiceId;
  return segments.flatMap((segment) => segment.narrationEngine && segment.timbre && segment.pauses && Array.isArray(segment.emphasis) && Array.isArray(segment.breathing)
    ? [{ ...segment, voice, speaker: "Narrator", characterId: "narrator", type: "narration" }]
    : prepareNarratedSentences(segment.text, { ...options, voice, mode: segment.narrationMode || options.mode, baseRate: finite(segment.rate, options.baseRate ?? 1), basePitch: finite(segment.pitch, options.basePitch ?? 1) }));
}
