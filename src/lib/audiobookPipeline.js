export const PIPELINE_VERSION = 1;
export const PIPELINE_STATUSES = Object.freeze({
  WAITING: "Waiting", RUNNING: "Running", COMPLETED: "Completed", FAILED: "Failed", CANCELLED: "Cancelled", PAUSED: "Paused",
});

export const AUDIOBOOK_STAGE_GRAPH = Object.freeze([
  { id: "chapter-analysis", label: "Chapter Analysis", dependencies: [] },
  { id: "character-analysis", label: "Character Analysis", dependencies: ["chapter-analysis"] },
  { id: "narration-planning", label: "Narration Planning", dependencies: ["chapter-analysis", "character-analysis"] },
  { id: "production-planning", label: "Production Planning", dependencies: ["narration-planning"] },
  { id: "sound-design", label: "Sound Design", dependencies: ["production-planning"] },
  { id: "voice-rendering", label: "Voice Rendering", dependencies: ["narration-planning", "character-analysis"] },
  { id: "mixer-preparation", label: "Mixer Preparation", dependencies: ["production-planning", "sound-design", "voice-rendering"] },
  { id: "final-mix", label: "Final Mix", dependencies: ["mixer-preparation"] },
  { id: "export", label: "Export", dependencies: ["final-mix"] },
]);

const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};
export function pipelineFingerprint(value) {
  const text = canonical(value); let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createPipelineStorage(storage = globalThis.localStorage) {
  const memory = new Map();
  const target = storage || { getItem: (key) => memory.get(key) || null, setItem: (key, value) => memory.set(key, value), removeItem: (key) => memory.delete(key) };
  return {
    read(key) { const value = target.getItem(key); return value ? JSON.parse(value) : null; },
    write(key, value) { target.setItem(key, JSON.stringify(value)); },
    remove(key) { target.removeItem(key); },
  };
}

const blankStage = (stage) => ({ ...stage, status: PIPELINE_STATUSES.WAITING, progress: 0, fingerprint: "", output: null, error: "", durationMs: 0, cached: false });
const protectedProjectState = (project = {}) => ({
  manualVoiceEdits: project.tracks?.flatMap((track) => track.clips || []).filter((clip) => clip.manuallyEdited).map((clip) => ({ ...clip })) || [],
  manualMixerEdits: project.mixerProject?.tracks?.filter((track) => track.manuallyEdited || track.manualOverride).map((track) => ({ ...track })) || [],
  manualAssetAssignments: project.tracks?.flatMap((track) => track.clips || []).filter((clip) => clip.manualAssetAssignment || clip.assetId && clip.manuallyEdited).map((clip) => ({ id: clip.id, assetId: clip.assetId })) || [],
  lockedScenes: (project.scenes || []).filter((scene) => scene.locked || scene.manuallyLocked).map((scene) => ({ ...scene })),
  lockedClips: project.tracks?.flatMap((track) => track.clips || []).filter((clip) => clip.locked || clip.manuallyLocked).map((clip) => ({ ...clip })) || [],
});

export class AudiobookPipeline {
  constructor({ id = "default", handlers = {}, storage, onUpdate = () => {}, now = () => Date.now() } = {}) {
    this.id = id; this.handlers = handlers; this.storage = createPipelineStorage(storage); this.onUpdate = onUpdate; this.now = now;
    this.key = `novelverse.audiobookPipeline.v${PIPELINE_VERSION}:${id}`;
    this.state = this.storage.read(this.key) || { version: PIPELINE_VERSION, id, status: PIPELINE_STATUSES.WAITING, stages: AUDIOBOOK_STAGE_GRAPH.map(blankStage), report: null, sourceFingerprint: "" };
    this.paused = false; this.cancelled = false; this.resumeWaiters = [];
  }
  snapshot() { return JSON.parse(JSON.stringify(this.state)); }
  emit() { this.storage.write(this.key, this.state); this.onUpdate(this.snapshot()); }
  stage(id) { return this.state.stages.find((stage) => stage.id === id); }
  descendants(id) { const found = new Set([id]); let changed = true; while (changed) { changed = false; for (const stage of AUDIOBOOK_STAGE_GRAPH) if (!found.has(stage.id) && stage.dependencies.some((dependency) => found.has(dependency))) { found.add(stage.id); changed = true; } } return found; }
  invalidate(stageId) { for (const id of this.descendants(stageId)) Object.assign(this.stage(id), blankStage(AUDIOBOOK_STAGE_GRAPH.find((stage) => stage.id === id))); this.emit(); }
  pause() { if (this.state.status !== PIPELINE_STATUSES.RUNNING) return; this.paused = true; this.state.status = PIPELINE_STATUSES.PAUSED; this.emit(); }
  resume() { this.paused = false; if (this.state.status === PIPELINE_STATUSES.PAUSED) this.state.status = PIPELINE_STATUSES.RUNNING; this.resumeWaiters.splice(0).forEach((resolve) => resolve()); this.emit(); }
  cancel() { this.cancelled = true; this.paused = false; this.resumeWaiters.splice(0).forEach((resolve) => resolve()); this.state.status = PIPELINE_STATUSES.CANCELLED; const running = this.state.stages.find((stage) => stage.status === PIPELINE_STATUSES.RUNNING); if (running) running.status = PIPELINE_STATUSES.CANCELLED; this.emit(); }
  async waitIfPaused() { if (this.paused) await new Promise((resolve) => this.resumeWaiters.push(resolve)); }
  async start(source, options = {}) {
    this.cancelled = false; const startedAt = this.now(); const sourceFingerprint = pipelineFingerprint(source); const report = { startedAt: new Date(startedAt).toISOString(), executionTimeMs: 0, completedStages: [], skippedStages: [], regeneratedStages: [], warnings: [], errors: [] };
    this.state.status = PIPELINE_STATUSES.RUNNING;
    if (this.state.sourceFingerprint && this.state.sourceFingerprint !== sourceFingerprint) this.invalidate("chapter-analysis");
    this.state.sourceFingerprint = sourceFingerprint; this.emit();
    for (const definition of AUDIOBOOK_STAGE_GRAPH) {
      await this.waitIfPaused(); if (this.cancelled) break;
      const stage = this.stage(definition.id); const dependencies = Object.fromEntries(definition.dependencies.map((id) => [id, this.stage(id).output]));
      const dependencyFingerprints = Object.fromEntries(definition.dependencies.map((id) => [id, this.stage(id).fingerprint]));
      const fingerprint = pipelineFingerprint({ version: PIPELINE_VERSION, source: definition.id === "chapter-analysis" ? source : undefined, dependencies, dependencyFingerprints, config: options.stageConfig?.[definition.id] });
      const cacheKey = `${this.key}:cache:${definition.id}:${fingerprint}`; const cached = this.storage.read(cacheKey);
      if (!options.force && stage.status === PIPELINE_STATUSES.COMPLETED && stage.fingerprint === fingerprint) { report.skippedStages.push(definition.id); continue; }
      if (!options.force && cached) { Object.assign(stage, { status: PIPELINE_STATUSES.COMPLETED, progress: 100, fingerprint, output: cached.output, durationMs: 0, cached: true, error: "" }); report.skippedStages.push(definition.id); this.emit(); continue; }
      const handler = this.handlers[definition.id]; const stageStartedAt = this.now(); const previousFingerprint = stage.fingerprint; Object.assign(stage, { status: PIPELINE_STATUSES.RUNNING, progress: 0, error: "", cached: false }); this.emit();
      try {
        if (!handler) throw new Error(`No handler registered for ${definition.label}.`);
        const output = await handler({ source, dependencies, previousOutput: stage.output, protectedState: protectedProjectState(options.project), signal: { get aborted() { return false; } }, report, updateProgress: (progress) => { stage.progress = Math.max(0, Math.min(100, Number(progress) || 0)); this.emit(); } });
        if (this.cancelled) { stage.status = PIPELINE_STATUSES.CANCELLED; break; }
        Object.assign(stage, { status: PIPELINE_STATUSES.COMPLETED, progress: 100, fingerprint, output, durationMs: this.now() - stageStartedAt }); this.storage.write(cacheKey, { output, createdAt: new Date().toISOString() }); report.completedStages.push(definition.id); if (previousFingerprint && previousFingerprint !== fingerprint) report.regeneratedStages.push(definition.id); this.emit();
      } catch (error) { Object.assign(stage, { status: PIPELINE_STATUSES.FAILED, error: error.message || String(error), durationMs: this.now() - stageStartedAt }); this.state.status = PIPELINE_STATUSES.FAILED; report.errors.push({ stage: definition.id, message: stage.error }); break; }
    }
    if (!this.cancelled && !this.state.stages.some((stage) => stage.status === PIPELINE_STATUSES.FAILED)) this.state.status = PIPELINE_STATUSES.COMPLETED;
    report.executionTimeMs = this.now() - startedAt; report.finishedAt = new Date(this.now()).toISOString(); this.state.report = report; this.emit(); return this.snapshot();
  }
  restartFailed(source, options = {}) { const failed = this.state.stages.find((stage) => stage.status === PIPELINE_STATUSES.FAILED); if (failed) this.invalidate(failed.id); return this.start(source, options); }
  restart(source, options = {}) { this.state.stages = AUDIOBOOK_STAGE_GRAPH.map(blankStage); return this.start(source, { ...options, force: true }); }
}
