export const AI_DIRECTOR_2_VERSION = "2.0";
export const aiDirectorStorageKey = "novelverseAiDirector2Settings";

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
const normalize = (text = "") => String(text).trim();

export const narrationPresets = {
  audiobook: { label: "Audiobook", rate: 0.92, pitch: 1, volume: 0.95, pauseScale: 1, energy: 0.5 },
  dramatic: { label: "Dramatic", rate: 0.84, pitch: 1.05, volume: 1, pauseScale: 1.25, energy: 0.72 },
  calm: { label: "Calm", rate: 0.78, pitch: 0.96, volume: 0.86, pauseScale: 1.35, energy: 0.32 },
  horror: { label: "Horror", rate: 0.72, pitch: 0.9, volume: 0.9, pauseScale: 1.55, energy: 0.6 },
  action: { label: "Action", rate: 1.05, pitch: 1.03, volume: 1, pauseScale: 0.82, energy: 0.86 },
};

export const defaultAiDirector2Settings = {
  version: AI_DIRECTOR_2_VERSION,
  preset: "audiobook",
  enabled: true,
  cinematicPauses: true,
  characterOverrides: {},
};

export function loadAiDirector2Settings(storage = globalThis.localStorage) {
  try {
    return sanitizeAiDirector2Settings(JSON.parse(storage?.getItem(aiDirectorStorageKey) || "null"));
  } catch {
    return { ...defaultAiDirector2Settings };
  }
}

export function saveAiDirector2Settings(settings, storage = globalThis.localStorage) {
  const safe = sanitizeAiDirector2Settings(settings);
  storage?.setItem(aiDirectorStorageKey, JSON.stringify(safe));
  return safe;
}

export function sanitizeAiDirector2Settings(settings = {}) {
  const preset = narrationPresets[settings?.preset] ? settings.preset : defaultAiDirector2Settings.preset;
  return {
    ...defaultAiDirector2Settings,
    ...settings,
    preset,
    enabled: settings?.enabled !== false,
    cinematicPauses: settings?.cinematicPauses !== false,
    characterOverrides: Object.fromEntries(Object.entries(settings?.characterOverrides || {}).map(([name, override]) => [name, {
      rate: clamp(override?.rate ?? 1, 0.5, 1.5),
      pitch: clamp(override?.pitch ?? 1, 0.5, 1.5),
      volume: clamp(override?.volume ?? 1, 0.2, 1.2),
      pauseScale: clamp(override?.pauseScale ?? 1, 0.4, 2.5),
    }])),
  };
}

export function detectPerformanceTraits(text = "", context = {}) {
  const clean = normalize(text);
  const quoted = /^\s*["“«'‘—–-]/u.test(clean) || /["“«][^"”»]+["”»]/u.test(clean) || context.segmentType === "dialogue";
  const lower = clean.toLowerCase();
  const shouting = /!{2,}|\b(shouted|yelled|screamed|roared|cried out)\b|\b(крич|вигук|зарев|заволав)\b|[A-ZА-ЯІЇЄҐЁ]{4,}/u.test(clean);
  const whisper = /\b(whispered|murmured|hushed|softly)\b|\b(шеп|прошеп|тихо|пошепки)\b/u.test(lower);
  const thought = /(^\s*[(_*]*\s*i thought\b)|\b(thought|wondered|remembered)\b|\b(подум|згадав|здавалося)\b|<i>|<em>/u.test(lower) || context.segmentType === "thought";
  return {
    dialogue: quoted,
    narration: !quoted && !thought,
    thoughts: thought,
    shouting,
    whisper,
    questions: /\?+["”»')\]]*\s*$/u.test(clean),
    exclamations: /!+["”»')\]]*\s*$/u.test(clean),
  };
}

export function getCinematicPause(text = "", { paragraphBreak = false, sceneBreak = false, scale = 1 } = {}) {
  const clean = normalize(text);
  let pause = /[,;:]\s*$/u.test(clean) ? 260 : /[.!?…]["”»')\]]*\s*$/u.test(clean) ? 560 : 180;
  if (/…|\.\.\./u.test(clean)) pause = Math.max(pause, 780);
  if (paragraphBreak) pause = Math.max(pause, 900);
  if (sceneBreak || /^\s*(\*{3,}|-{3,}|#{2,})\s*$/u.test(clean)) pause = Math.max(pause, 1600);
  return Math.round(clamp(pause * scale, 80, 5000));
}

export function directTextPerformance(text = "", options = {}) {
  const settings = sanitizeAiDirector2Settings(options.settings || loadAiDirector2Settings(options.storage));
  const preset = narrationPresets[settings.preset] || narrationPresets.audiobook;
  const traits = detectPerformanceTraits(text, options);
  const override = settings.characterOverrides?.[options.speakerName] || {};
  let rate = preset.rate, pitch = preset.pitch, volume = preset.volume, pauseScale = preset.pauseScale;
  if (traits.dialogue) { rate += 0.03; pitch += 0.02; }
  if (traits.thoughts) { rate -= 0.08; pitch -= 0.04; volume -= 0.08; pauseScale += 0.18; }
  if (traits.shouting) { rate += 0.1; pitch += 0.08; volume += 0.12; pauseScale -= 0.12; }
  if (traits.whisper) { rate -= 0.12; pitch -= 0.08; volume -= 0.25; pauseScale += 0.22; }
  if (traits.questions) { pitch += 0.06; pauseScale += 0.08; }
  if (traits.exclamations) { rate += 0.05; volume += 0.06; }
  rate *= override.rate ?? 1; pitch *= override.pitch ?? 1; volume *= override.volume ?? 1; pauseScale *= override.pauseScale ?? 1;
  return {
    version: AI_DIRECTOR_2_VERSION,
    preset: settings.preset,
    traits,
    rate: Number(clamp(rate, 0.5, 1.5).toFixed(2)),
    pitch: Number(clamp(pitch, 0, 2).toFixed(2)),
    volume: Number(clamp(volume, 0, 1).toFixed(2)),
    pauseAfterMs: settings.cinematicPauses ? getCinematicPause(text, { ...options, scale: pauseScale }) : 0,
  };
}
