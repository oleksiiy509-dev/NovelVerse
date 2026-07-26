import { createAiProducerProject } from "./aiProducerEngine.js";

export const PRODUCTION_PLAN_VERSION = 2;
export const PRODUCTION_MODES = Object.freeze({ MANUAL: "manual", ASSISTED: "assisted", FULL_AUTO: "full_auto" });
export const CONFIDENCE_THRESHOLDS = Object.freeze({ high: 0.78, medium: 0.52 });
export const SCENE_TYPES = Object.freeze(["dialogue", "narration", "action", "suspense", "horror", "romance", "comedy", "exposition", "internal monologue", "battle", "travel", "mystery", "climax", "aftermath", "quiet scene"]);
export const EMOTIONAL_ARCS = Object.freeze(["calm", "tense", "fear", "anger", "sadness", "joy", "hope", "mystery", "urgency", "triumph", "despair", "shock"]);

const rules = [
  ["battle", /\b(battle|army|warriors?|swords?|gunfire|siege)\b/iu, "urgency"],
  ["horror", /\b(blood|corpse|monster|scream|terrified|horror)\b/iu, "fear"],
  ["action", /\b(ran|chased|struck|fought|exploded|jumped|attack)\b/iu, "urgency"],
  ["romance", /\b(kiss|embrace|lover|tender|heart fluttered)\b/iu, "joy"],
  ["comedy", /\b(laughed|joke|ridiculous|chuckled|hilarious)\b/iu, "joy"],
  ["travel", /\b(journey|travelled|traveled|road|voyage|carriage|train)\b/iu, "hope"],
  ["aftermath", /\b(aftermath|when it was over|ruins|survivors)\b/iu, "sadness"],
  ["climax", /\b(at last|final battle|now or never|last chance)\b/iu, "triumph"],
  ["suspense", /\b(silence|waited|shadow|footsteps|behind the door|suddenly)\b/iu, "tense"],
  ["mystery", /\b(clue|secret|unknown|mystery|riddle|who was)\b/iu, "mystery"],
  ["internal monologue", /\b(I thought|I wondered|I remembered|in my mind)\b/iu, "calm"],
  ["exposition", /\b(years ago|history|explained|because|therefore)\b/iu, "calm"],
];
const revealRx = /\b(truth|reveal|realized|discovered|secret was|all along)\b/iu;
const argumentRx = /[!]{1,}|\b(shouted|argued|yelled)\b/iu;
const intimateRx = /\b(whispered|kiss|embrace|tender|alone together)\b/iu;
const outdoorRx = /\b(forest|street|road|field|mountain|sea|outside)\b/iu;
const sfxRules = [["door", /\b(door|gate)\b/iu], ["footsteps", /\b(footsteps|boots approached)\b/iu], ["thunder", /\bthunder(?:ed)?\b/iu], ["impact", /\b(exploded|crashed|gunshot)\b/iu], ["blade", /\b(sword|blade) (?:rang|clashed)\b/iu]];
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, Number(value)));
const round = (value) => Number(value.toFixed(2));
const hash = (value) => { let h = 2166136261; for (const char of String(value)) h = Math.imul(h ^ char.charCodeAt(0), 16777619); return (h >>> 0).toString(36); };
const clips = (project) => (project?.tracks || []).flatMap((track) => (track.clips || []).map((clip) => ({ ...clip, trackId: track.id })));

export function classifyProductionScene(scene = {}) {
  const text = String(scene.text || scene.sourceText || "");
  const dialogueCount = (text.match(/[“"][^”"]+[”"]/gu) || []).length;
  const matched = rules.find(([, rx]) => rx.test(text));
  let sceneType = matched?.[0] || (dialogueCount >= 2 ? "dialogue" : text.split(/\s+/u).length < 20 ? "quiet scene" : "narration");
  let emotionalArc = matched?.[2] || (/\b(tears|grief|wept|died)\b/iu.test(text) ? "sadness" : /\b(angry|rage|furious)\b/iu.test(text) ? "anger" : "calm");
  const evidence = matched ? 2 : dialogueCount ? 1 : 0;
  const confidence = round(clamp(0.58 + evidence * 0.13 + Math.min(text.length / 2000, 0.08)));
  return { sceneType, emotionalArc, confidence, reason: matched ? `Text evidence matched ${sceneType} production cues.` : `Structural ${sceneType} classification.` };
}

function pacingFor(type, text) {
  if (["action", "battle", "climax"].includes(type)) return { label: "fast", rate: 1.1, pauseDensity: 0.25, pauseDuration: argumentRx.test(text) ? 180 : 260 };
  if (["horror", "suspense", "mystery"].includes(type)) return { label: "slow", rate: 0.88, pauseDensity: 0.7, pauseDuration: revealRx.test(text) ? 950 : 620 };
  if (type === "exposition") return { label: "measured", rate: 0.9, pauseDensity: 0.5, pauseDuration: 480 };
  return { label: "moderate", rate: 1, pauseDensity: 0.4, pauseDuration: revealRx.test(text) ? 900 : 400 };
}

function transition(type, nextType, text) {
  if (/\b(suddenly|gunshot|exploded|shock)\b/iu.test(text)) return { type: "hard cut", length: 0, reason: "Intentional shock cue." };
  if (["suspense", "horror", "mystery"].includes(type) && revealRx.test(text)) return { type: "silence", length: 1.1, reason: "Silence protects the reveal." };
  if (type === nextType) return { type: "crossfade", length: 1.4, reason: "Compatible scene beds." };
  return { type: "ambience bridge", length: 1, reason: "Location continuity without covering speech." };
}

export function createProductionPlan(project, options = {}) {
  const mode = Object.values(PRODUCTION_MODES).includes(options.mode) ? options.mode : PRODUCTION_MODES.ASSISTED;
  const sourceScenes = project?.scenes?.length ? project.scenes : createAiProducerProject(options.chapter || {}).scenes;
  const priorLocks = new Map((options.previousPlan?.scenes || []).map((scene) => [scene.sceneId, scene.manuallyLocked]));
  const scenes = sourceScenes.map((source, index) => {
    const text = source.text || clips(project).filter((clip) => clip.sceneId === (source.id || source.sceneId)).map((clip) => clip.sourceText).join(" ");
    const classified = classifyProductionScene({ text });
    const pacing = pacingFor(classified.sceneType, text);
    const intensity = ["battle", "climax"].includes(classified.sceneType) ? 0.9 : ["action", "horror"].includes(classified.sceneType) ? 0.72 : 0.4;
    const location = source.metadata?.location || (outdoorRx.test(text) ? "outdoor location" : "unspecified");
    const musicAllowed = !["dialogue", "quiet scene"].includes(classified.sceneType) && index % 2 === 0;
    const sceneClips = clips(project).filter((clip) => clip.sceneId === (source.id || source.sceneId));
    return { sceneId: source.id || source.sceneId || `scene_${index + 1}`, sceneType: classified.sceneType, emotionalArc: classified.emotionalArc, tensionLevel: round(intensity), pacing, intensity, narrationStyle: { rate: pacing.rate, pitch: classified.emotionalArc === "fear" ? 0.96 : 1, volume: 0.92, dialogueEnergy: round(intensity) }, ambiencePlan: { sceneLocation: location, weather: source.metadata?.weather || "unspecified", indoorOrOutdoor: outdoorRx.test(text) ? "outdoor" : "unknown", timeOfDay: source.metadata?.timeOfDay || "unspecified", activityLevel: round(intimateRx.test(text) ? 0.15 : intensity), intensity: round(intimateRx.test(text) ? 0.12 : classified.sceneType === "travel" ? 0.62 : 0.3), loopRecommendation: true, crossfadeRecommendation: true, assetRequirement: `ambience:${location}`, missingAssetState: "required" }, musicPlan: { startTime: source.timeline?.start || 0, endTime: musicAllowed ? round((source.timeline?.start || 0) + (source.timeline?.duration || 0)) : null, mood: classified.emotionalArc, intensity: musicAllowed ? round(intensity * 0.65) : 0, fadeIn: 2, fadeOut: 2.5, ducking: 0.45, loopRecommendation: (source.timeline?.duration || 0) > 45, assetRequirement: musicAllowed ? `music:${classified.emotionalArc}` : null, missingAssetState: musicAllowed ? "required" : "not_required" }, sfxPlan: sfxRules.filter(([, rx]) => rx.test(text)).slice(0, 2).map(([category], sfxIndex) => ({ sourceText: text.match(sfxRules.find(([name]) => name === category)[1])?.[0] || category, sourceClipId: sceneClips.find((clip) => sfxRules.find(([name]) => name === category)[1].test(clip.sourceText || ""))?.id || null, category, timingOffset: round(0.5 + sfxIndex * 1.5), intensity: round(Math.min(0.7, intensity)), optional: true, assetRequirement: `sfx:${category}`, missingAssetState: "required" })), pausePlan: { density: pacing.pauseDensity, duration: pacing.pauseDuration, beforeReveal: revealRx.test(text) ? 1000 : 0 }, transitionIn: null, transitionOut: null, confidence: classified.confidence, confidenceReason: classified.reason, manuallyLocked: Boolean(priorLocks.get(source.id || source.sceneId) || source.manuallyLocked), sourceFingerprint: hash(text) };
  });
  const transitions = scenes.slice(0, -1).map((scene, index) => ({ transitionId: `transition_${index + 1}`, fromSceneId: scene.sceneId, toSceneId: scenes[index + 1].sceneId, ...transition(scene.sceneType, scenes[index + 1].sceneType, sourceScenes[index]?.text || "") }));
  transitions.forEach((item) => { scenes.find((scene) => scene.sceneId === item.fromSceneId).transitionOut = item; scenes.find((scene) => scene.sceneId === item.toSceneId).transitionIn = item; });
  const now = new Date().toISOString();
  const plan = { productionPlanId: options.productionPlanId || `production_${hash(`${project?.novelId}:${project?.chapterId}`)}`, projectId: project?.id || project?.projectId || `${project?.novelId}:${project?.chapterId}`, mixerProjectId: options.mixerProjectId || options.mixerProject?.mixerProjectId || null, novelId: project?.novelId || null, chapterId: project?.chapterId || null, version: PRODUCTION_PLAN_VERSION, mode, status: "analyzed", scenes, transitions, globalSettings: { narratorRate: 1, narratorPitch: 1, narratorVolume: 0.92, dialogueEnergy: 0.5, pauseDensity: 0.4, pauseDuration: 400, ambienceIntensity: 0.3, musicIntensity: 0.35, sfxDensity: 0.2, transitionLength: 1.2, duckingStrength: 0.45, preserveDynamicRange: true, compression: "gentle" }, confidence: round(scenes.reduce((sum, scene) => sum + scene.confidence, 0) / Math.max(1, scenes.length)), warnings: [], createdAt: options.previousPlan?.createdAt || now, updatedAt: now };
  plan.warnings = getProductionWarnings(plan, project, options.mixerProject);
  return plan;
}

export function shouldApplyScene(scene, mode) { if (mode === PRODUCTION_MODES.MANUAL || scene.manuallyLocked || scene.confidence < CONFIDENCE_THRESHOLDS.medium) return false; return mode === PRODUCTION_MODES.FULL_AUTO ? scene.confidence >= CONFIDENCE_THRESHOLDS.high : scene.confidence >= CONFIDENCE_THRESHOLDS.medium; }

export function applyProductionPlan(project, plan) {
  const original = structuredClone(project);
  const appliedIds = new Set(plan.scenes.filter((scene) => shouldApplyScene(scene, plan.mode)).map((scene) => scene.sceneId));
  const overrides = {};
  const tracks = project.tracks.map((track) => ({ ...track, clips: track.clips.map((clip) => {
    const scene = plan.scenes.find((item) => item.sceneId === clip.sceneId);
    if (!scene || !appliedIds.has(clip.sceneId) || clip.manuallyEdited || clip.manuallyLocked || clip.locked) return clip;
    const speech = ["narrator", "dialogue", "thought"].includes(clip.clipType);
    const patch = speech ? { rate: scene.narrationStyle.rate, pitch: scene.narrationStyle.pitch, volume: scene.narrationStyle.volume, pauseAfter: scene.pausePlan.duration } : {};
    overrides[clip.id] = { sceneId: clip.sceneId, before: Object.fromEntries(Object.keys(patch).map((key) => [key, clip[key]])), after: patch, confidence: scene.confidence, reason: scene.confidenceReason };
    return { ...clip, ...patch, productionOverride: patch };
  }) }));
  return { ...project, tracks, production: { planId: plan.productionPlanId, original, overrides, appliedSceneIds: [...appliedIds], appliedAt: new Date().toISOString() } };
}

export function revertProductionPlan(project, { sceneId, clipId } = {}) {
  const production = project.production;
  if (!production?.original) return project;
  if (!sceneId && !clipId) return structuredClone(production.original);
  const ids = Object.entries(production.overrides).filter(([id, value]) => (!clipId || id === clipId) && (!sceneId || value.sceneId === sceneId));
  const restored = project.tracks.map((track) => ({ ...track, clips: track.clips.map((clip) => { const entry = ids.find(([id]) => id === clip.id)?.[1]; if (!entry) return clip; const next = { ...clip, ...entry.before }; delete next.productionOverride; return next; }) }));
  const remaining = Object.fromEntries(Object.entries(production.overrides).filter(([id]) => !ids.some(([target]) => target === id)));
  return { ...project, tracks: restored, production: { ...production, overrides: remaining } };
}

export function generateProductionDiff(project, appliedProject) {
  const changes = Object.entries(appliedProject?.production?.overrides || {}).map(([clipId, change]) => ({ clipId, ...change }));
  return { changedScenes: [...new Set(changes.map((change) => change.sceneId))], changedClips: changes, changedTrackSettings: [], changedTransitions: [], count: changes.length };
}

export function getProductionWarnings(plan, project, mixerProject) {
  const warnings = [];
  const add = (code, message, sceneId = null) => warnings.push({ code, message, sceneId });
  plan.scenes.forEach((scene) => { if (scene.confidence < CONFIDENCE_THRESHOLDS.medium) add("low-confidence-scene-type", "Scene type confidence is too low for automatic application.", scene.sceneId); if (scene.musicPlan.intensity > 0 && scene.musicPlan.missingAssetState === "required") add("missing-assets", `Missing ${scene.musicPlan.assetRequirement}.`, scene.sceneId); if (scene.sfxPlan.length > 3) add("excessive-sfx-density", "SFX density may distract from speech.", scene.sceneId); });
  if (plan.scenes.filter((scene) => scene.musicPlan.intensity > 0).length / Math.max(1, plan.scenes.length) > 0.65) add("excessive-music-density", "Music occupies too many scenes; preserve silence and dynamic range.");
  const speech = clips(project).filter((clip) => ["narrator", "dialogue", "thought"].includes(clip.clipType));
  for (let index = 1; index < speech.length; index += 1) if (speech[index].start < speech[index - 1].start + speech[index - 1].duration) add("speech-overlap", "Important speech clips overlap.", speech[index].sceneId);
  (mixerProject?.tracks || []).forEach((track) => { if (!Number.isFinite(track.volume) || track.volume < 0 || track.volume > 2) add("invalid-volume", `Invalid volume on ${track.trackId}.`); if (!Number.isFinite(track.pan) || track.pan < -1 || track.pan > 1) add("invalid-pan", `Invalid pan on ${track.trackId}.`); });
  return warnings;
}

export function runProductionQualityChecks(plan, project, mixerProject) {
  const errors = []; const sceneIds = plan.scenes.map((scene) => scene.sceneId); const clipIds = clips(project).map((clip) => clip.id);
  if (new Set(sceneIds).size !== sceneIds.length) errors.push("duplicate scene ids");
  if (new Set(clipIds).size !== clipIds.length) errors.push("duplicate clip ids");
  clips(project).forEach((clip) => { if (clip.duration < 0) errors.push(`negative clip duration: ${clip.id}`); if (clip.productionOverride && (clip.locked || clip.manuallyLocked)) errors.push(`production override on locked item: ${clip.id}`); if (["narrator", "dialogue", "thought"].includes(clip.clipType) && !clip.sourceText) errors.push(`missing speech clip: ${clip.id}`); });
  if (mixerProject && (!Number.isFinite(mixerProject.sampleRate) || mixerProject.sampleRate <= 0)) errors.push("invalid sample rate");
  return { passed: errors.length === 0, errors, warnings: getProductionWarnings(plan, project, mixerProject) };
}

export function calculateProductionScore(plan, project, mixerProject) {
  const warnings = getProductionWarnings(plan, project, mixerProject); const penalty = (code) => warnings.filter((warning) => warning.code.includes(code)).length * 8;
  const score = (value) => round(clamp(value / 100) * 100);
  const result = { pacingScore: score(92 - penalty("silence")), clarityScore: score(96 - penalty("overlap")), emotionalConsistencyScore: score(88 + plan.confidence * 8), voiceConsistencyScore: score(96 - clips(project).filter((clip) => clip.manuallyEdited && !clip.voiceId).length * 3), transitionScore: score(90 - penalty("transition")), assetCompletenessScore: score(100 - penalty("missing-assets")) };
  result.overallScore = round(Object.values(result).reduce((sum, value) => sum + value, 0) / 6); return result;
}

export function generateProductionReport(plan, project, mixerProject) {
  const qualityScores = calculateProductionScore(plan, project, mixerProject);
  return { productionPlanId: plan.productionPlanId, chapterSummary: `${plan.scenes.length} scenes analyzed in ${plan.mode} mode.`, sceneBreakdown: plan.scenes.map(({ sceneId, sceneType, emotionalArc, confidence }) => ({ sceneId, sceneType, emotionalArc, confidence })), emotionalArc: plan.scenes.map((scene) => scene.emotionalArc), productionDecisions: plan.scenes.map((scene) => ({ sceneId: scene.sceneId, pacing: scene.pacing, music: scene.musicPlan, ambience: scene.ambiencePlan, sfx: scene.sfxPlan })), warnings: getProductionWarnings(plan, project, mixerProject), missingAssets: plan.scenes.flatMap((scene) => [scene.musicPlan, scene.ambiencePlan, ...scene.sfxPlan]).filter((item) => item.assetRequirement && item.missingAssetState === "required").map((item) => item.assetRequirement), qualityScores, manualEditsPreserved: clips(project).filter((clip) => clip.manuallyEdited).map((clip) => clip.id), generatedAt: new Date().toISOString() };
}

export function serializeProductionPlan(plan) { return JSON.stringify(migrateProductionPlan(plan), null, 2); }
export function migrateProductionPlan(input, fallback = {}) {
  const raw = typeof input === "string" ? JSON.parse(input) : input;
  if (!raw || typeof raw !== "object") throw new Error("Malformed production plan.");
  const now = new Date().toISOString();
  return { productionPlanId: raw.productionPlanId || `production_${hash(raw.chapterId || "recovered")}`, projectId: raw.projectId || fallback.projectId || null, mixerProjectId: raw.mixerProjectId || null, novelId: raw.novelId || null, chapterId: raw.chapterId || null, version: PRODUCTION_PLAN_VERSION, mode: Object.values(PRODUCTION_MODES).includes(raw.mode) ? raw.mode : PRODUCTION_MODES.MANUAL, status: raw.status || "draft", scenes: Array.isArray(raw.scenes) ? raw.scenes.map((scene, index) => ({ ...scene, sceneId: scene.sceneId || scene.id || `scene_${index + 1}`, manuallyLocked: Boolean(scene.manuallyLocked) })) : [], transitions: Array.isArray(raw.transitions) ? raw.transitions : [], globalSettings: raw.globalSettings || {}, confidence: clamp(raw.confidence || 0), warnings: Array.isArray(raw.warnings) ? raw.warnings : [], createdAt: raw.createdAt || now, updatedAt: now };
}
export function saveProductionPlan(plan, storage = globalThis.localStorage) { const safe = migrateProductionPlan(plan); storage?.setItem(`novelverse.production.v2:${safe.projectId}:${safe.version}`, serializeProductionPlan(safe)); return safe; }
export function loadProductionPlan(projectId, storage = globalThis.localStorage) { try { const raw = storage?.getItem(`novelverse.production.v2:${projectId}:${PRODUCTION_PLAN_VERSION}`); return raw ? migrateProductionPlan(raw) : null; } catch { return null; } }

export function invalidateChangedScenes(plan, project) {
  const source = new Map((project?.scenes || []).map((scene) => [scene.id || scene.sceneId, hash(scene.text || clips(project).filter((clip) => clip.sceneId === (scene.id || scene.sceneId)).map((clip) => clip.sourceText).join(" "))]));
  const scenes = plan.scenes.map((scene) => scene.manuallyLocked || source.get(scene.sceneId) === scene.sourceFingerprint ? scene : { ...scene, status: "invalidated", invalidatedReason: "Source for this scene changed." });
  return { ...plan, status: scenes.some((scene) => scene.status === "invalidated") ? "partially_invalidated" : plan.status, scenes, updatedAt: new Date().toISOString() };
}
