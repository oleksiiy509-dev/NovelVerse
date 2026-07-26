export const ASSET_LIBRARY_VERSION = 1;
export const ANALYSIS_VERSION = 1;
export const ASSET_TYPES = ["ambience", "music", "sfx", "room tone", "transition", "impulse response", "unknown"];
export const AUDIO_EXTENSIONS = ["wav", "mp3", "m4a", "ogg", "flac"];
export const DEFAULT_MAX_FILE_SIZE = 250 * 1024 * 1024;

export const TAG_VOCABULARY = Object.freeze({
  ambience: ["forest", "city", "village", "road", "sea", "ship", "rain", "storm", "wind", "fire", "cave", "dungeon", "battlefield", "crowd", "tavern", "palace", "temple", "night", "indoor", "outdoor"],
  moods: ["calm", "tense", "mysterious", "sad", "hopeful", "triumphant", "dark", "horror", "action", "romantic", "comedic", "epic"],
  sfx: ["footsteps", "door", "weapon", "impact", "cloth", "object", "magic", "monster", "animal", "vehicle", "weather", "environment", "crowd", "body movement"],
});

const now = () => new Date().toISOString();
const id = (prefix) => `${prefix}_${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
const unique = (items) => [...new Set((items || []).map((item) => String(item).trim().toLowerCase()).filter(Boolean))];
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, Number(value) || 0));

export function sanitizeFileName(name = "audio") {
  return Array.from(String(name).split(/[\\/]/).pop().normalize("NFKC"))
    .filter((character) => character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127)
    .join("").replace(/[^\p{L}\p{N}._() -]/gu, "_").replace(/\.{2,}/g, ".").trim().slice(0, 180) || "audio";
}

export function createAssetLibrary(input = {}) {
  const timestamp = now();
  return { libraryId: input.libraryId || id("library"), version: ASSET_LIBRARY_VERSION, assets: [], collections: [], tags: [], analysisVersion: ANALYSIS_VERSION, createdAt: timestamp, updatedAt: timestamp, ...input };
}

export function createAssetMetadata(input = {}) {
  const timestamp = now();
  const fileName = sanitizeFileName(input.fileName || input.name);
  const extension = (input.extension || fileName.split(".").pop() || "").toLowerCase();
  const sanitizedInput = { ...input, fileName, extension };
  return {
    assetId: input.assetId || id("asset"), fileName, displayName: input.displayName || fileName.replace(/\.[^.]+$/, ""), assetType: "unknown",
    mimeType: input.mimeType || "application/octet-stream", extension, sizeBytes: Number(input.sizeBytes || 0), duration: 0, sampleRate: 0, channelCount: 0, bitDepth: null,
    objectReference: input.objectReference || null, checksum: input.checksum || "", waveformSummary: [], loudness: null, peak: 0, silenceRatio: 0,
    loopCandidate: false, seamlessLoopConfidence: 0, loopBoundaries: [], tags: [], tagSuggestions: [], categories: [], moods: [], environments: [], events: [],
    intensity: "medium", transientProfile: { density: 0, label: "unknown" }, frequencyProfile: { low: 0, mid: 0, high: 0 }, manuallyEdited: {},
    favorite: false, collectionId: "", notes: "", usage: { chapters: [], scenes: [], cues: [], usageCount: 0, mostRecentlyUsed: null },
    missing: false, invalid: false, analysisStatus: "pending", analysisError: "", analysisVersion: 0, createdAt: timestamp, updatedAt: timestamp, ...sanitizedInput,
  };
}

export async function checksumBlob(blob) {
  if (!blob || typeof blob.arrayBuffer !== "function") throw new Error("Checksum failure: invalid file data.");
  const bytes = await blob.arrayBuffer();
  if (!globalThis.crypto?.subtle) { // deterministic fallback for restricted browsers; not a security checksum
    let hash = 2166136261;
    new Uint8Array(bytes).forEach((byte) => { hash ^= byte; hash = Math.imul(hash, 16777619); });
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function validateImportFile(file, { maxFileSize = DEFAULT_MAX_FILE_SIZE } = {}) {
  if (!file || !file.size) throw new Error("Empty files cannot be imported.");
  if (file.size > maxFileSize) throw new Error(`File exceeds the ${Math.round(maxFileSize / 1024 / 1024)} MB limit.`);
  const name = sanitizeFileName(file.name);
  const extension = name.split(".").pop().toLowerCase();
  if (!AUDIO_EXTENSIONS.includes(extension)) throw new Error("Unsupported audio extension. Decoding was not attempted.");
  if (file.type && !file.type.startsWith("audio/") && file.type !== "application/ogg") throw new Error("The declared MIME type is not audio.");
  return { name, extension };
}

export function inferTags(asset, collectionName = "") {
  const text = `${asset.fileName} ${collectionName}`.toLowerCase().replace(/[_-]/g, " ");
  const vocabulary = [...TAG_VOCABULARY.ambience, ...TAG_VOCABULARY.moods, ...TAG_VOCABULARY.sfx];
  const suggestions = unique(vocabulary).filter((tag) => text.includes(tag.replace(/s$/, ""))).map((tag) => ({ tag, confidence: .86, reason: "Found in the sanitized file or collection name." }));
  const analysisSuggestions = [];
  if (asset.silenceRatio > .55 && asset.transientProfile?.density < .03) analysisSuggestions.push({ tag: "room tone", confidence: .35, reason: "Low activity suggests room tone; waveform evidence is not semantic certainty." });
  if (asset.transientProfile?.density > .2) analysisSuggestions.push({ tag: "impact", confidence: .3, reason: "High transient density weakly suggests effects; waveform evidence is not semantic certainty." });
  if (asset.loopCandidate) analysisSuggestions.push({ tag: "loop", confidence: .7, reason: "Start and end waveform levels are similar." });
  return [...suggestions, ...analysisSuggestions].sort((a, b) => b.confidence - a.confidence);
}

export function classifyAsset(asset) {
  const words = unique([...(asset.tags || []), ...(asset.tagSuggestions || []).map((x) => x.tag), asset.fileName]);
  const text = words.join(" ").toLowerCase();
  if (/impulse|\bir\b/.test(text)) return "impulse response";
  if (/room.?tone/.test(text)) return "room tone";
  if (/transition|whoosh|sweep|riser/.test(text)) return "transition";
  if (TAG_VOCABULARY.sfx.some((tag) => text.includes(tag.replace(/s$/, ""))) || asset.transientProfile?.density > .15) return "sfx";
  if (/music|score|theme|song|underscore/.test(text) || (asset.duration > 25 && asset.frequencyProfile?.mid > .2 && asset.transientProfile?.density > .03)) return "music";
  if (TAG_VOCABULARY.ambience.some((tag) => text.includes(tag)) || (asset.duration > 15 && asset.loopCandidate)) return "ambience";
  return "unknown";
}

function frequencySummary(channel, sampleRate) {
  // Zero-crossing and adjacent-difference proxies keep analysis bounded without retaining an AudioBuffer.
  let low = 0, mid = 0, high = 0;
  const stride = Math.max(1, Math.floor(channel.length / 50000));
  for (let i = stride * 2; i < channel.length; i += stride) {
    const slow = Math.abs(channel[i] - channel[i - stride * 2]);
    const fast = Math.abs(channel[i] - channel[i - stride]);
    low += Math.abs(channel[i]); mid += slow; high += Math.max(0, fast - slow / 2);
  }
  const scale = Math.max(1, channel.length / stride);
  const nyquistFactor = Math.min(1, sampleRate / 44100);
  return { low: clamp(low / scale), mid: clamp(mid / scale * 3), high: clamp(high / scale * 5 * nyquistFactor) };
}

export function analyzeAudioBuffer(buffer) {
  if (!buffer?.numberOfChannels || !buffer.length) throw new Error("Decode produced no audio samples.");
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
  const bins = 128; const waveform = []; let peak = 0, sum = 0, silent = 0, samples = 0, transients = 0;
  for (let bin = 0; bin < bins; bin += 1) {
    const start = Math.floor(buffer.length * bin / bins); const end = Math.max(start + 1, Math.floor(buffer.length * (bin + 1) / bins)); let binPeak = 0;
    for (const channel of channels) for (let i = start; i < end; i += 1) { const value = Math.abs(channel[i]); peak = Math.max(peak, value); binPeak = Math.max(binPeak, value); sum += value * value; silent += value < .001 ? 1 : 0; samples += 1; if (i > start && value - Math.abs(channel[i - 1]) > .18) transients += 1; }
    waveform.push(Number(binPeak.toFixed(4)));
  }
  const rms = Math.sqrt(sum / Math.max(1, samples)); const silenceRatio = silent / Math.max(1, samples); const transientDensity = transients / Math.max(1, samples);
  const edge = Math.max(1, Math.floor(buffer.length * .02)); let edgeDifference = 0;
  for (const channel of channels) for (let i = 0; i < edge; i += 1) edgeDifference += Math.abs(channel[i] - channel[buffer.length - edge + i]);
  edgeDifference /= edge * channels.length; const seamlessLoopConfidence = clamp(1 - edgeDifference * 8); const frequencyProfile = frequencySummary(channels[0], buffer.sampleRate);
  return { duration: buffer.duration, sampleRate: buffer.sampleRate, channelCount: buffer.numberOfChannels, waveformSummary: waveform, loudness: rms ? 20 * Math.log10(rms) : -Infinity, peak, silenceRatio, loopCandidate: buffer.duration > 2 && seamlessLoopConfidence >= .65, seamlessLoopConfidence, loopBoundaries: seamlessLoopConfidence >= .65 ? [{ start: 0, end: buffer.duration, confidence: seamlessLoopConfidence }] : [], transientProfile: { density: transientDensity, label: transientDensity > .12 ? "sharp" : transientDensity > .025 ? "mixed" : "smooth" }, frequencyProfile, invalid: peak === 0 || silenceRatio > .995 };
}

export async function decodeAndAnalyze(file, audioContext) {
  const bytes = await file.arrayBuffer();
  let buffer;
  try { buffer = await audioContext.decodeAudioData(bytes.slice(0)); } catch (error) { throw new Error(`Browser decode failed; this format is not supported here. ${error.message || ""}`.trim(), { cause: error }); }
  return analyzeAudioBuffer(buffer);
}

export function applyAnalysis(asset, analysis, { collectionName = "" } = {}) {
  const manual = asset.manuallyEdited || {};
  const analyzed = { ...asset, ...analysis, analysisVersion: ANALYSIS_VERSION, analysisStatus: "complete", analysisError: "", invalid: Boolean(analysis.invalid), updatedAt: now() };
  analyzed.tagSuggestions = inferTags(analyzed, collectionName);
  const suggestedTags = analyzed.tagSuggestions.filter((x) => x.confidence >= .65).map((x) => x.tag);
  analyzed.tags = unique([...(manual.tags ? asset.tags : []), ...suggestedTags]);
  analyzed.assetType = manual.assetType ? asset.assetType : classifyAsset(analyzed);
  for (const field of ["displayName", "moods", "environments", "intensity", "loopCandidate", "favorite", "collectionId", "notes"]) if (manual[field]) analyzed[field] = asset[field];
  return analyzed;
}

export function migrateAssetLibrary(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== "object") return createAssetLibrary();
    const library = createAssetLibrary({ ...parsed, version: ASSET_LIBRARY_VERSION, assets: Array.isArray(parsed.assets) ? parsed.assets.map((asset) => createAssetMetadata(asset)) : [], collections: Array.isArray(parsed.collections) ? parsed.collections : [], tags: Array.isArray(parsed.tags) ? parsed.tags : [] });
    return library;
  } catch { return createAssetLibrary(); }
}

export function editAsset(asset, patch) {
  const manual = { ...(asset.manuallyEdited || {}) };
  Object.keys(patch).forEach((key) => { manual[key] = true; });
  return { ...asset, ...patch, tags: patch.tags ? unique(patch.tags) : asset.tags, manuallyEdited: manual, updatedAt: now() };
}

export function replaceAsset(asset, fileMetadata) {
  const replacement = createAssetMetadata({ ...fileMetadata, assetId: asset.assetId, displayName: asset.displayName, tags: asset.tags, moods: asset.moods, environments: asset.environments, intensity: asset.intensity, favorite: asset.favorite, collectionId: asset.collectionId, notes: asset.notes, manuallyEdited: asset.manuallyEdited, usage: asset.usage, createdAt: asset.createdAt });
  return { ...replacement, missing: false, invalid: false, updatedAt: now() };
}

export function findDuplicates(assets, candidate) {
  return (assets || []).filter((asset) => asset.assetId !== candidate.assetId && ((candidate.checksum && asset.checksum === candidate.checksum) || (candidate.duration && Math.abs(asset.duration - candidate.duration) < .05 && waveformDistance(asset.waveformSummary, candidate.waveformSummary) < .03))).map((asset) => ({ asset, exact: asset.checksum === candidate.checksum }));
}
function waveformDistance(a = [], b = []) { if (!a.length || a.length !== b.length) return 1; return a.reduce((sum, value, i) => sum + Math.abs(value - b[i]), 0) / a.length; }

const compatible = { doors: "door", impacts: "impact", footsteps: "footsteps", ambience: "environment", weather: "weather", vehicles: "vehicle", weapons: "weapon", transitions: "transition" };
const semanticGroups = [["indoor", "outdoor"], ["calm", "action", "tense", "horror", "comedic"], ["sea", "forest", "city", "cave", "tavern"]];
export function hasSemanticConflict(required = [], tags = []) { return semanticGroups.some((group) => required.some((x) => group.includes(x)) && tags.some((x) => group.includes(x) && !required.includes(x))); }

export function scoreAssetMatch(asset, cue, context = {}) {
  if (asset.missing || asset.invalid) return null;
  const required = unique(cue.requiredAssetTags || cue.requiredTags || cue.tags);
  const tags = unique([...(asset.tags || []), ...(asset.categories || []), asset.assetType]);
  const conflicts = hasSemanticConflict(required, tags);
  const exact = required.filter((tag) => tags.includes(tag));
  const cueCategory = String(cue.category || cue.assetType || "").toLowerCase();
  const categoryScore = tags.includes(cueCategory) ? 1 : tags.includes(compatible[cueCategory]) || (asset.categories || []).some((x) => compatible[x] === cueCategory) ? .7 : 0;
  const tagScore = required.length ? exact.length / required.length : .5;
  const moodScore = cue.mood ? ((asset.moods || []).includes(cue.mood) ? 1 : .25) : .5;
  const environmentScore = cue.environment ? ((asset.environments || []).includes(cue.environment) || tags.includes(cue.environment) ? 1 : .15) : .5;
  const intensityMap = { low: 1, medium: 2, high: 3 }; const expectedIntensity = intensityMap[cue.intensity] || Math.round(clamp(cue.intensity) * 2) + 1; const actualIntensity = intensityMap[asset.intensity] || 2;
  const intensityScore = 1 - Math.min(2, Math.abs(expectedIntensity - actualIntensity)) / 2;
  const desiredDuration = Number(cue.duration || cue.desiredDuration || 0); const durationScore = desiredDuration ? clamp(1 - Math.abs(asset.duration - desiredDuration) / Math.max(desiredDuration, asset.duration, 1)) : .6;
  const needsLoop = Boolean(cue.loop || cue.loopRequired || cue.type === "ambience"); const loopScore = needsLoop ? (asset.loopCandidate ? 1 : 0) : .6;
  const recentIds = context.recentAssetIds || []; const repetitionPenalty = (cue.assetType === "sfx" || cue.type === "sfx" || asset.assetType === "sfx") && recentIds.includes(asset.assetId) ? -.18 : 0;
  const favoriteBonus = asset.favorite ? .04 : 0;
  const base = tagScore * .3 + categoryScore * .16 + moodScore * .1 + environmentScore * .13 + intensityScore * .1 + durationScore * .09 + loopScore * .12;
  const overallScore = conflicts ? 0 : clamp(base + repetitionPenalty + favoriteBonus);
  const confidence = overallScore >= .78 ? "high" : overallScore >= .52 ? "medium" : "low";
  const reasons = [exact.length ? `Exact tags: ${exact.join(", ")}.` : "No exact required-tag match.", categoryScore ? "Category is compatible." : "Category is not confirmed.", cue.environment && environmentScore === 1 ? "Environment matches." : null, needsLoop ? (asset.loopCandidate ? "Suitable loop candidate." : "Loop requested but not detected.") : null, repetitionPenalty ? "Penalized to avoid nearby repetition." : null, favoriteBonus ? "Small favorite bonus." : null, conflicts ? "Required semantic tags conflict; automatic selection is forbidden." : null].filter(Boolean);
  return { assetId: asset.assetId, tagScore, categoryScore, moodScore, environmentScore, intensityScore, durationScore, loopScore, repetitionPenalty, favoriteBonus, overallScore, confidence, semanticConflict: conflicts, reasons };
}

export function matchCue(cue, assets, context = {}) {
  return (assets || []).map((asset) => ({ asset, score: scoreAssetMatch(asset, cue, context) })).filter((item) => item.score).sort((a, b) => b.score.overallScore - a.score.overallScore);
}

export function applyCueMatch(cue, candidate, { mode = "assisted" } = {}) {
  if (cue.assetSelection?.locked) return cue;
  if (!candidate?.score || candidate.score.semanticConflict) return cue;
  const automatic = mode === "full-auto" && candidate.score.confidence === "high";
  if (!automatic && mode !== "manual") return { ...cue, matchSuggestions: [candidate], matchStatus: candidate.score.confidence === "low" ? "suggested" : "confirmation-required" };
  return { ...cue, assetSelection: { assetId: candidate.asset.assetId, locked: mode === "manual", automatic, score: candidate.score }, missingAsset: false };
}

export function clearAutomaticMatches(cues = []) { return cues.map((cue) => cue.assetSelection?.automatic && !cue.assetSelection.locked ? { ...cue, assetSelection: null } : cue); }
export function trackAssetUsage(asset, { chapterId, sceneId, cueId, usedAt = now() }) { const usage = asset.usage || {}; return { ...asset, usage: { chapters: unique([...(usage.chapters || []), chapterId]), scenes: unique([...(usage.scenes || []), sceneId]), cues: unique([...(usage.cues || []), cueId]), usageCount: Number(usage.usageCount || 0) + 1, mostRecentlyUsed: usedAt }, updatedAt: usedAt }; }
export function canDeleteAsset(asset) { const count = asset.usage?.cues?.length || 0; return { allowed: count === 0, warning: count ? `This asset is referenced by ${count} cue(s). Remove only after explicit confirmation.` : "" }; }

export function createLibraryReport(library, cues = []) {
  const assets = library.assets || []; const duplicates = assets.flatMap((asset, i) => findDuplicates(assets.slice(0, i), asset)); const matched = cues.filter((cue) => cue.assetSelection);
  return { libraryId: library.libraryId, generatedAt: now(), totalAssets: assets.length, storageUsage: assets.reduce((sum, x) => sum + (x.sizeBytes || 0), 0), invalidAssets: assets.filter((x) => x.invalid).length, missingAssets: assets.filter((x) => x.missing).length, duplicates: duplicates.length, unusedAssets: assets.filter((x) => !x.usage?.usageCount).length, cueCoverage: cues.length ? matched.length / cues.length : 1, highConfidenceMatches: matched.filter((x) => x.assetSelection?.score?.confidence === "high").length, unresolvedCues: cues.length - matched.length };
}

export class AnalysisQueue {
  constructor({ concurrency = 2, analyze, onProgress = () => {} } = {}) { this.concurrency = Math.max(1, Number(concurrency) || 1); this.analyze = analyze; this.onProgress = onProgress; this.cancelled = false; this.pending = []; }
  cancel() { this.cancelled = true; }
  async run(items) {
    this.cancelled = false; this.pending = [...items]; let completed = 0; const results = [];
    const worker = async () => { while (this.pending.length && !this.cancelled) { const item = this.pending.shift(); try { const value = await this.analyze(item); results.push({ item, status: "complete", value }); } catch (error) { results.push({ item, status: error.name === "AbortError" ? "cancelled" : "failed", error }); } completed += 1; this.onProgress({ item, completed, total: items.length, progress: completed / items.length }); } };
    await Promise.all(Array.from({ length: Math.min(this.concurrency, items.length) }, worker));
    if (this.cancelled) this.pending.forEach((item) => results.push({ item, status: "cancelled" })); this.pending = []; return results;
  }
}
