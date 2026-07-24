import { directTextPerformance } from "./voiceDirector/aiDirector2.js";
import { attributeDialogueSegments, buildPersistentCharacterRegistry, getNarratorProfile, slugCharacterName } from "./characterVoiceEngine.js";
import { stripChapterHtml } from "./voiceEngine/analyzer.js";

export const AI_PRODUCER_ENGINE_VERSION = "ai-producer-engine-v1";

const sceneBreakRx = /^\s*(\*{3,}|-{3,}|#{2,}|scene\s+\d+|chapter\s+\d+)\s*$/iu;
const quoteRx = /[“"]([^”"]+)[”"]/gu;
const weatherRules = [
  ["rain", /\b(rain|storm|thunder|downpour|drizzle|злива|дощ|гроза)\b/iu],
  ["snow", /\b(snow|blizzard|ice|frost|сніг|метелиця|мороз)\b/iu],
  ["wind", /\b(wind|windy|gale|breeze|вітер|буря)\b/iu],
  ["clear", /\b(clear sky|sunny|sunlight|сонце|ясн)\b/iu],
];
const timeRules = [
  ["night", /\b(night|midnight|moon|darkness|ніч|опівночі|місяць)\b/iu],
  ["dawn", /\b(dawn|sunrise|ранок|світанок)\b/iu],
  ["day", /\b(day|noon|afternoon|день|полудень)\b/iu],
  ["evening", /\b(evening|dusk|twilight|вечір|сутінки)\b/iu],
];
const locationRules = [
  ["forest", /\b(forest|woods|trees|ліс|дерева)\b/iu],
  ["city", /\b(city|street|alley|market|місто|вулиц)\b/iu],
  ["castle", /\b(castle|palace|throne|замок|палац|трон)\b/iu],
  ["room", /\b(room|chamber|bedroom|kitchen|кімнат|зал)\b/iu],
  ["battlefield", /\b(battlefield|battle|war|combat|битва|поле бою)\b/iu],
  ["vehicle", /\b(car|train|ship|carriage|авто|поїзд|корабель)\b/iu],
];

const sfxRules = [
  ["thunder hit", /\b(thunder|грім)\b/iu], ["door creak", /\b(door|gate|двер|ворота)\b/iu],
  ["footsteps", /\b(footsteps|steps|walked|ran|крок|побіг)\b/iu], ["blade ring", /\b(sword|blade|knife|меч|клинок|ніж)\b/iu],
  ["heartbeat pulse", /\b(heart|pulse|серце|пульс)\b/iu], ["fire crackle", /\b(fire|flame|campfire|вогонь|полум)\b/iu],
];

const words = (text = "") => String(text).trim().split(/\s+/u).filter(Boolean);
const clean = (text = "") => String(text).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const firstMatch = (rules, text, fallback) => rules.find(([, rx]) => rx.test(text))?.[0] || fallback;
const stableId = (...parts) => parts.map((part) => slugCharacterName(String(part))).filter(Boolean).join("_");

export function analyzeChapterStructure(content = "", options = {}) {
  const plain = stripChapterHtml(content);
  const blocks = plain.split(/\n{2,}/u).map((block) => block.trim()).filter(Boolean);
  const scenes = [];
  let current = [];
  for (const block of blocks.length ? blocks : [plain]) {
    if (sceneBreakRx.test(block) && current.length) { scenes.push(current); current = []; continue; }
    current.push(block);
    if (/\b(later|meanwhile|elsewhere|the next morning|hours passed|раптом|згодом)\b/iu.test(block) && current.length > 1) { scenes.push(current); current = []; }
  }
  if (current.length) scenes.push(current);
  const registry = options.registry || buildPersistentCharacterRegistry({ novelId: options.novelId || "producer-preview", content: plain, knownCharacters: options.knownCharacters || [], existingRegistry: options.existingRegistry });
  return scenes.map((sceneBlocks, sceneIndex) => analyzeScene(sceneBlocks.join("\n\n"), sceneIndex, registry));
}

function analyzeScene(text, sceneIndex, registry) {
  const segments = [];
  const attributed = attributeDialogueSegments(text, registry);
  let segmentIndex = 0;
  if (attributed.length) {
    for (const item of attributed) segments.push(classifySegment(item.text, sceneIndex, segmentIndex++, item));
  } else {
    for (const paragraph of text.split(/\n+/u).map(clean).filter(Boolean)) segments.push(classifySegment(paragraph, sceneIndex, segmentIndex++));
  }
  return { id: `scene_${sceneIndex + 1}`, index: sceneIndex, text: clean(text), metadata: createSceneMetadata(text, segments), segments };
}

function classifySegment(text, sceneIndex, segmentIndex, attributed = {}) {
  const lower = text.toLowerCase();
  const quoted = quoteRx.test(text) || attributed.type === "dialogue";
  quoteRx.lastIndex = 0;
  const type = quoted ? "dialogue" : /\b(thought|wondered|remembered|I knew|I felt|подум|згадав)\b|<i>|<em>/iu.test(text) ? "internal_thought" : "narration";
  const tags = new Set([type]);
  if (/\b(ran|fought|jumped|struck|exploded|chased|побіг|удар|вибух)\b/iu.test(lower)) tags.add("action");
  if (/\b(suddenly|silence|shadow|fear|danger|waited|silent|silence|раптом|тиша|страх|небезпек)\b/iu.test(lower)) tags.add("suspense");
  if (/\b(remembered|years ago|flashback|memory|згадав|колись|спогад)\b/iu.test(lower)) tags.add("flashback");
  const duration = estimateClipDuration(text, { type });
  return { id: `seg_${sceneIndex + 1}_${segmentIndex + 1}`, sceneId: `scene_${sceneIndex + 1}`, index: segmentIndex, type, structureTags: [...tags], text: clean(text), characterId: attributed.characterId || (type === "dialogue" ? "unknown" : "narrator"), speakerName: attributed.speakerName || (type === "dialogue" ? "Unknown" : "Narrator"), duration, performance: directTextPerformance(text, { segmentType: type === "internal_thought" ? "thought" : type }) };
}

export function createSceneMetadata(text = "", segments = []) {
  const mood = segments.some((s) => s.structureTags.includes("suspense")) ? "suspenseful" : segments.some((s) => s.structureTags.includes("action")) ? "urgent" : /\b(sad|tears|grief|сум|сльоз)\b/iu.test(text) ? "melancholy" : "neutral";
  const pacing = segments.some((s) => s.structureTags.includes("action")) ? "fast" : segments.some((s) => s.type === "internal_thought") ? "slow" : "moderate";
  return { location: firstMatch(locationRules, text, "unspecified"), timeOfDay: firstMatch(timeRules, text, "unspecified"), weather: firstMatch(weatherRules, text, "unspecified"), mood, pacing };
}

export function recommendAmbience(metadata = {}) { return metadata.location === "forest" ? "forest night insects and leaves" : metadata.weather === "rain" ? "soft rain bed" : metadata.location === "city" ? "distant city street" : metadata.location === "battlefield" ? "distant battle rumble" : "subtle room tone"; }
export function recommendMusicIntensity(metadata = {}) { return metadata.pacing === "fast" ? 0.78 : metadata.mood === "suspenseful" ? 0.62 : metadata.mood === "melancholy" ? 0.38 : 0.24; }
export function recommendSoundEffects(text = "") { return sfxRules.filter(([, rx]) => rx.test(text)).map(([name]) => name); }
export function estimateClipDuration(text = "", { type = "narration" } = {}) { const wpm = type === "dialogue" ? 155 : type === "internal_thought" ? 125 : 140; return Number(Math.max(1.2, (words(text).length / wpm) * 60 + 0.35).toFixed(2)); }

export function generateProductionTimeline(chapter = {}, options = {}) {
  const scenes = analyzeChapterStructure(chapter.content || chapter.text || "", options);
  let cursor = 0;
  const events = [];
  for (const scene of scenes) {
    const sceneStart = cursor;
    for (const segment of scene.segments) {
      events.push({ id: `evt_${segment.id}`, sceneId: scene.id, segmentId: segment.id, sourceOrder: events.filter((event) => event.segmentId).length, sourceText: segment.text, speaker: segment.speakerName, emotion: segment.emotion || segment.performance?.traits?.emotion || "neutral", provider: "piper", voiceId: "", rate: segment.performance?.rate || 1, pitch: segment.performance?.pitch || 1, volume: segment.performance?.volume || 1, pauseBefore: segment.performance?.pauseBeforeMs || 0, pauseAfter: segment.performance?.pauseAfterMs || 0, estimatedDuration: segment.duration, generationStatus: "not_synthesized", manuallyEdited: false, start: Number(cursor.toFixed(2)), duration: segment.duration, type: segment.type, trackType: segment.type === "dialogue" ? "characters" : "narrator", characterId: segment.characterId, title: `${segment.speakerName}: ${segment.text.slice(0, 42)}` });
      cursor += segment.duration + segment.performance.pauseAfterMs / 1000;
    }
    const sceneDuration = Number((cursor - sceneStart).toFixed(2));
    scene.timeline = { start: Number(sceneStart.toFixed(2)), duration: sceneDuration };
    scene.recommendations = { ambience: recommendAmbience(scene.metadata), musicIntensity: recommendMusicIntensity(scene.metadata), soundEffects: recommendSoundEffects(scene.text) };
    events.push({ id: `evt_${scene.id}_ambience`, sceneId: scene.id, start: Number(sceneStart.toFixed(2)), duration: sceneDuration, type: "ambience", trackType: "ambience", title: scene.recommendations.ambience });
    if (scene.recommendations.musicIntensity > 0.3) events.push({ id: `evt_${scene.id}_music`, sceneId: scene.id, start: Number(sceneStart.toFixed(2)), duration: sceneDuration, type: "music", trackType: "music", title: `${scene.metadata.mood} score`, intensity: scene.recommendations.musicIntensity });
    for (const effect of scene.recommendations.soundEffects) events.push({ id: `evt_${scene.id}_sfx_${stableId(effect)}`, sceneId: scene.id, start: Number((sceneStart + Math.min(sceneDuration * 0.45, 5)).toFixed(2)), duration: 2, type: "sfx", trackType: "sound effects", title: effect });
    cursor += 1.2;
  }
  return { version: AI_PRODUCER_ENGINE_VERSION, novelId: chapter.novelId || chapter.novel_id || options.novelId || null, chapterId: chapter.id || "chapter", title: chapter.title || "Untitled chapter", duration: Number(cursor.toFixed(2)), scenes, events };
}

export function buildProductionTracks(timeline, registry = {}) {
  const characters = registry.characters || [getNarratorProfile()];
  const baseTracks = [
    { id: "narrator", name: "Narrator", type: "narrator", color: "#7dd3fc", clips: [] },
    ...characters.filter((c) => c.id !== "narrator").map((c) => ({ id: `character_${c.id}`, name: c.name, type: "character", characterId: c.id, color: "#c084fc", clips: [] })),
    { id: "ambience", name: "Ambience", type: "ambient", color: "#86efac", clips: [] },
    { id: "music", name: "Music", type: "music", color: "#fde68a", clips: [] },
    { id: "sfx", name: "Sound FX", type: "sfx", color: "#fca5a5", clips: [] },
  ];
  const ensureCharacterTrack = (id, name) => baseTracks.find((t) => t.id === `character_${id}`) || baseTracks.splice(baseTracks.length - 3, 0, { id: `character_${id}`, name: name || id, type: "character", characterId: id, color: "#c084fc", clips: [] })[0];
  for (const event of timeline.events) {
    const track = event.trackType === "narrator" ? baseTracks[0] : event.trackType === "characters" ? ensureCharacterTrack(event.characterId || "unknown", event.title?.split(":")[0]) : event.type === "ambience" ? baseTracks.find((t) => t.id === "ambience") : event.type === "music" ? baseTracks.find((t) => t.id === "music") : baseTracks.find((t) => t.id === "sfx");
    track.clips.push({ id: `clip_${event.id}`, novelId: timeline.novelId || null, chapterId: timeline.chapterId || null, sceneId: event.sceneId, sourceOrder: event.sourceOrder ?? event.start, sourceText: event.sourceText || event.title || "", clipType: event.type === "internal_thought" ? "thought" : event.type === "narration" ? "narrator" : event.type, speaker: event.speaker || event.title?.split(":")[0] || track.name, characterId: event.characterId || track.characterId || null, emotion: event.emotion || "neutral", provider: event.provider || "piper", voiceId: event.voiceId || "", rate: event.rate || 1, pitch: event.pitch || 1, volume: event.type === "music" ? event.intensity : event.type === "ambience" ? 0.28 : event.volume || 0.9, pauseBefore: event.pauseBefore || 0, pauseAfter: event.pauseAfter || 0, estimatedDuration: event.estimatedDuration || event.duration, generationStatus: event.generationStatus || "not_synthesized", manuallyEdited: false, title: event.title, start: event.start, duration: event.duration, fadeIn: event.type === "sfx" ? 0.05 : 0.4, fadeOut: event.type === "sfx" ? 0.2 : 0.8, sourceSegmentId: event.segmentId || null, synthesisStatus: "not_synthesized", editable: true, automation: [], pauses: event.pauseAfter ? [{ at: event.duration, duration: event.pauseAfter / 1000 }] : [] });
  }
  return baseTracks;
}

export function createAiProducerProject(chapter = {}, options = {}) {
  const registry = options.registry || buildPersistentCharacterRegistry({ novelId: chapter.novelId || chapter.novel_id || options.novelId || "producer-preview", content: chapter.content || chapter.text || "", knownCharacters: options.knownCharacters || [], existingRegistry: options.existingRegistry });
  const timeline = generateProductionTimeline(chapter, { ...options, registry });
  return { version: AI_PRODUCER_ENGINE_VERSION, audioStudioVersion: 2, novelId: chapter.novelId || chapter.novel_id || options.novelId || "global", chapterId: chapter.id || "chapter", name: `AI Producer - ${chapter.title || "Untitled chapter"}`, duration: timeline.duration, cursor: 0, updatedAt: new Date().toISOString(), editable: true, synthesisPolicy: "manual_only", registry, scenes: timeline.scenes, metadata: timeline.scenes.map((scene) => ({ sceneId: scene.id, ...scene.metadata, recommendations: scene.recommendations })), timeline: timeline.events, tracks: buildProductionTracks(timeline, registry) };
}
