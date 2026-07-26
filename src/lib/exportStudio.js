export const EXPORT_VERSION = 1;
export const EXPORT_FORMATS = Object.freeze(["wav", "project-package", "json-project", "production-report", "narration-report", "sound-design-report", "voice-assignment-report", "asset-usage-report"]);
export const EXPORT_STATUSES = Object.freeze(["queued", "rendering", "encoding", "packaging", "completed", "failed", "cancelled"]);
export const DEFAULT_EXPORT_OPTIONS = Object.freeze({ sampleRate: 48000, channels: 2, bitDepth: 24, normalize: true, trimSilence: false, fadeInOut: true, chapterSplitting: true, combineChapters: false });

const copy = (value) => JSON.parse(JSON.stringify(value));
const nowIso = () => new Date().toISOString();
const reportKey = (format) => format.replace("-report", "Plan").replace("voice-assignment", "voiceAssignments").replace("asset-usage", "assetAssignments").replace("sound-design", "soundDesign");

export function validateExport(project = {}, environment = {}) {
  const diagnostics = [];
  const add = (code, severity, message) => diagnostics.push({ code, severity, message });
  const assets = project.assets || [];
  const missing = assets.filter((asset) => !asset.url && !asset.data && asset.missing !== false);
  if (missing.length) add("missing-assets", "error", `${missing.length} assigned asset${missing.length === 1 ? " is" : "s are"} unavailable.`);
  const unresolved = (project.voiceAssignments || []).filter((voice) => !voice.voiceId && !voice.profileId);
  if (unresolved.length) add("unresolved-voices", "error", `${unresolved.length} character voice assignment${unresolved.length === 1 ? " is" : "s are"} unresolved.`);
  if (environment.workerOnline === false) add("worker-offline", "warning", "The local rendering worker is offline.");
  if (environment.piperAvailable === false) add("piper-unavailable", "warning", "Piper is unavailable; cached clips can still be packaged.");
  if (!(project.chapters || []).length) add("no-chapters", "error", "The project has no chapters to export.");
  if (!project.mixerProject) add("missing-mixer", "warning", "No mixer project was found; default levels will be used.");
  return { valid: !diagnostics.some(({ severity }) => severity === "error"), diagnostics, warnings: diagnostics.filter(({ severity }) => severity === "warning") };
}

export function createProjectPackage(project, options = {}) {
  return { format: "novelverse-project", version: EXPORT_VERSION, createdAt: nowIso(), metadata: copy(project.metadata || { id: project.id, title: project.title }), chapters: copy(project.chapters || []), mixerProject: copy(project.mixerProject || {}), voiceProfiles: copy(project.voiceProfiles || []), reports: { production: copy(project.productionPlan || {}), narration: copy(project.narrationPlan || {}), soundDesign: copy(project.soundDesignPlan || {}), voiceAssignments: copy(project.voiceAssignments || []), assetUsage: copy(project.assetAssignments || project.assets || []) }, settings: { ...DEFAULT_EXPORT_OPTIONS, ...copy(options) } };
}

export function createWav(samples = new Int16Array(), options = {}) {
  const settings = { ...DEFAULT_EXPORT_OPTIONS, ...options }; const bytesPerSample = settings.bitDepth / 8; const frames = samples.length; const dataSize = frames * bytesPerSample; const buffer = new ArrayBuffer(44 + dataSize); const view = new DataView(buffer);
  const text = (offset, value) => [...value].forEach((letter, index) => view.setUint8(offset + index, letter.charCodeAt(0)));
  text(0, "RIFF"); view.setUint32(4, 36 + dataSize, true); text(8, "WAVE"); text(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, settings.channels, true); view.setUint32(24, settings.sampleRate, true); view.setUint32(28, settings.sampleRate * settings.channels * bytesPerSample, true); view.setUint16(32, settings.channels * bytesPerSample, true); view.setUint16(34, settings.bitDepth, true); text(36, "data"); view.setUint32(40, dataSize, true);
  for (let i = 0; i < frames; i += 1) { const sample = Math.max(-1, Math.min(1, Number(samples[i]) / 32768)); const offset = 44 + i * bytesPerSample; if (settings.bitDepth === 16) view.setInt16(offset, sample * 32767, true); else if (settings.bitDepth === 24) { const value = Math.round(sample * 8388607); view.setUint8(offset, value & 255); view.setUint8(offset + 1, (value >> 8) & 255); view.setUint8(offset + 2, (value >> 16) & 255); } else view.setInt32(offset, sample * 2147483647, true); }
  return new Uint8Array(buffer);
}

export function buildExport(format, project, options = {}) {
  if (!EXPORT_FORMATS.includes(format)) throw new Error(`Unsupported export format: ${format}`);
  if (format === "wav") return { data: createWav(project.samples, options), mime: "audio/wav", extension: "wav" };
  const content = format === "project-package" ? createProjectPackage(project, options) : format === "json-project" ? copy(project) : { format, generatedAt: nowIso(), project: copy(project.metadata || { id: project.id, title: project.title }), data: copy(project[reportKey(format)] || {}) };
  return { data: JSON.stringify(content, null, 2), mime: "application/json", extension: format === "project-package" ? "novelverse" : "json" };
}

export class ExportQueue {
  constructor({ storage, onUpdate = () => {}, clock = () => Date.now() } = {}) { this.storage = storage; this.onUpdate = onUpdate; this.clock = clock; this.jobs = storage ? JSON.parse(storage.getItem("novelverse.export.history.v1") || "[]") : []; this.controls = new Map(); }
  snapshot() { return copy(this.jobs); }
  save() { this.storage?.setItem("novelverse.export.history.v1", JSON.stringify(this.jobs)); this.onUpdate(this.snapshot()); }
  add({ format, project, options = {}, environment = {} }) { const validation = validateExport(project, environment); if (!validation.valid) throw Object.assign(new Error("Export validation failed."), { validation }); const job = { id: `export-${this.clock()}-${this.jobs.length}`, projectId: project.id, title: project.title || "Untitled", format, options: { ...DEFAULT_EXPORT_OPTIONS, ...options }, status: "queued", currentStage: "Queued", progress: 0, elapsedMs: 0, estimatedRemainingMs: null, renderedClips: 0, remainingClips: (project.clips || []).length, warnings: validation.warnings, createdAt: nowIso(), result: null, error: "" }; this.jobs.push(job); this.save(); return job; }
  async run(id, project, renderer = async ({ format, project: source, options }) => buildExport(format, source, options)) { const job = this.jobs.find((item) => item.id === id); if (!job || ["completed", "cancelled"].includes(job.status)) return job; const control = { paused: false, cancelled: false, waiters: [] }; this.controls.set(id, control); const started = this.clock(); const stages = ["rendering", "encoding", "packaging"];
    try { for (let index = 0; index < stages.length; index += 1) { if (control.cancelled) break; if (control.paused) await new Promise((resolve) => control.waiters.push(resolve)); if (control.cancelled) break; job.status = stages[index]; job.currentStage = stages[index][0].toUpperCase() + stages[index].slice(1); job.progress = index * 30 + 10; job.elapsedMs = this.clock() - started; job.estimatedRemainingMs = Math.max(0, job.elapsedMs / Math.max(job.progress, 1) * (100 - job.progress)); if (stages[index] === "rendering") { job.renderedClips = (project.clips || []).length; job.remainingClips = 0; } this.save(); await Promise.resolve(); }
      if (!control.cancelled) { job.result = await renderer({ format: job.format, project, options: job.options }); if (control.cancelled) return job; job.status = "completed"; job.currentStage = "Completed"; job.progress = 100; job.elapsedMs = this.clock() - started; job.estimatedRemainingMs = 0; job.completedAt = nowIso(); }
    } catch (error) { job.status = "failed"; job.currentStage = "Failed"; job.error = error.message || String(error); } this.controls.delete(id); this.save(); return job; }
  pause(id) { const job = this.jobs.find((item) => item.id === id); const control = this.controls.get(id); if (job && control && ["rendering", "encoding", "packaging"].includes(job.status)) { control.paused = true; job.paused = true; job.currentStage = "Paused"; this.save(); } return job; }
  resume(id) { const job = this.jobs.find((item) => item.id === id); const control = this.controls.get(id); if (control?.paused) { control.paused = false; job.paused = false; control.waiters.splice(0).forEach((resolve) => resolve()); this.save(); } return job; }
  cancel(id) { const job = this.jobs.find((item) => item.id === id); const control = this.controls.get(id); if (job && !["completed", "cancelled"].includes(job.status)) { if (control) { control.cancelled = true; control.paused = false; control.waiters.splice(0).forEach((resolve) => resolve()); } job.status = "cancelled"; job.currentStage = "Cancelled"; job.cancelledAt = nowIso(); this.save(); } return job; }
  retry(id, project, renderer) { const failed = this.jobs.find((item) => item.id === id); if (!failed || failed.status !== "failed") return failed; failed.status = "queued"; failed.error = ""; failed.progress = 0; this.save(); return this.run(id, project, renderer); }
}
