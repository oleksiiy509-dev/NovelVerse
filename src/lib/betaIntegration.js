export const BETA_STORAGE_KEY = "novelverse.beta.v1";
export const BETA_STAGES = Object.freeze([
  ["analyze", "Analyze Chapter"], ["voices", "Generate Voices"],
  ["narration", "Generate Narration"], ["production", "Generate Production"],
  ["sound", "Generate Sound Design"], ["speech", "Render Speech"],
  ["mixer", "Build Mixer"], ["audiobook", "Build Audiobook"],
].map(([id, label]) => ({ id, label })));

const clone = (value) => JSON.parse(JSON.stringify(value));
const nowIso = () => new Date().toISOString();
const memoryStorage = () => { const data = new Map(); return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) }; };
const safeRead = (storage, key, fallback) => { try { return JSON.parse(storage.getItem(key)) ?? fallback; } catch { return fallback; } };

export function createBetaState() {
  return { version: 1, projects: [], archivedProjects: [], queue: [], notifications: [], errors: [], checkpoints: {}, settings: { pipeline: { autoResume: true }, narration: {}, production: {}, soundDesign: {}, mixer: {}, worker: {}, performance: { cache: true } }, firstLaunchComplete: false };
}

export class BetaRepository {
  constructor(storage = globalThis.localStorage || memoryStorage(), key = BETA_STORAGE_KEY) { this.storage = storage; this.key = key; this.state = safeRead(storage, key, createBetaState()); }
  save() { this.storage.setItem(this.key, JSON.stringify(this.state)); return this.snapshot(); }
  snapshot() { return clone(this.state); }
  upsertProject(project) { const value = { ...project, id: project.id || crypto.randomUUID(), updatedAt: nowIso(), archived: false }; const index = this.state.projects.findIndex(({ id }) => id === value.id); if (index < 0) this.state.projects.unshift(value); else this.state.projects[index] = { ...this.state.projects[index], ...value }; this.checkpoint(value.id, "autosave", value); this.save(); return clone(value); }
  checkpoint(projectId, reason, data) { const items = this.state.checkpoints[projectId] || []; items.push({ id: `${Date.now()}-${items.length}`, reason, createdAt: nowIso(), checksum: checksum(data), data: clone(data) }); this.state.checkpoints[projectId] = items.slice(-20); return items.at(-1); }
  rollback(projectId, checkpointId) { const point = (this.state.checkpoints[projectId] || []).find(({ id }) => id === checkpointId); if (!point || checksum(point.data) !== point.checksum) throw new Error("Checkpoint is missing or corrupted."); return this.upsertProject(point.data); }
  recover(projectId) { const points = [...(this.state.checkpoints[projectId] || [])].reverse(); const valid = points.find((point) => checksum(point.data) === point.checksum); if (!valid) throw new Error("No valid recovery checkpoint found."); return this.upsertProject(valid.data); }
  duplicate(projectId) { const source = this.state.projects.find(({ id }) => id === projectId); if (!source) throw new Error("Project not found."); return this.upsertProject({ ...clone(source), id: crypto.randomUUID(), name: `${source.name} (Copy)` }); }
  archive(projectId) { const project = this.state.projects.find(({ id }) => id === projectId); if (!project) return; this.state.projects = this.state.projects.filter(({ id }) => id !== projectId); this.state.archivedProjects.unshift({ ...project, archived: true }); this.save(); }
  restore(projectId) { const project = this.state.archivedProjects.find(({ id }) => id === projectId); if (!project) return; this.state.archivedProjects = this.state.archivedProjects.filter(({ id }) => id !== projectId); this.state.projects.unshift({ ...project, archived: false, updatedAt: nowIso() }); this.save(); }
  delete(projectId) { this.state.projects = this.state.projects.filter(({ id }) => id !== projectId); this.state.archivedProjects = this.state.archivedProjects.filter(({ id }) => id !== projectId); delete this.state.checkpoints[projectId]; this.save(); }
}

function checksum(value) { const text = JSON.stringify(value); let hash = 2166136261; for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619); return (hash >>> 0).toString(16); }
export function preserveManualState(previous = {}, generated = {}) { return { ...generated, manualEdits: previous.manualEdits || generated.manualEdits, voiceAssignments: previous.voiceAssignments || generated.voiceAssignments, soundAssignments: previous.soundAssignments || generated.soundAssignments, mixerEdits: previous.mixerEdits || generated.mixerEdits, scenes: (generated.scenes || []).map((scene) => previous.scenes?.find((item) => item.id === scene.id && item.locked) || scene) }; }

export class BackgroundQueue {
  constructor({ repository = new BetaRepository(), runners = {}, onUpdate = () => {}, clock = () => Date.now() } = {}) { this.repository = repository; this.runners = runners; this.onUpdate = onUpdate; this.clock = clock; this.stopped = false; }
  add({ projectId, chapterIds, wholeNovel = false }) { const job = { id: crypto.randomUUID(), projectId, chapterIds, wholeNovel, status: "queued", stageIndex: 0, progress: 0, createdAt: nowIso(), warnings: [], error: "", elapsedMs: 0, remainingMs: null }; this.repository.state.queue.push(job); this.repository.save(); this.onUpdate(clone(job)); return job; }
  stop(jobId) { const job = this.find(jobId); if (job) { job.status = "cancelled"; this.stopped = true; this.persist(job); } }
  pause(jobId) { const job = this.find(jobId); if (job?.status === "running") { job.status = "queued"; this.stopped = true; this.persist(job); } }
  find(id) { return this.repository.state.queue.find((job) => job.id === id); }
  persist(job) { this.repository.checkpoint(job.projectId, `pipeline:${job.status}`, job); this.repository.save(); this.onUpdate(clone(job)); }
  async run(jobId, context = {}) {
    const job = this.find(jobId); if (!job) throw new Error("Queue job not found."); this.stopped = false; job.status = "running"; job.startedAt ||= this.clock(); this.persist(job);
    for (; job.stageIndex < BETA_STAGES.length; job.stageIndex += 1) {
      if (this.stopped || job.status === "cancelled") return clone(job);
      const stage = BETA_STAGES[job.stageIndex]; job.currentStage = stage.id; this.persist(job);
      try { const output = await (this.runners[stage.id] || (async () => ({})))({ ...context, job: clone(job), stage, previous: job.outputs?.[stage.id] }); job.outputs = { ...job.outputs, [stage.id]: output }; }
      catch (error) { job.status = "failed"; job.error = error.message || String(error); this.repository.state.errors.unshift({ id: crypto.randomUUID(), jobId, stage: stage.id, message: job.error, createdAt: nowIso() }); this.persist(job); return clone(job); }
      job.progress = Math.round(((job.stageIndex + 1) / BETA_STAGES.length) * 100); job.elapsedMs = this.clock() - job.startedAt; job.remainingMs = job.progress ? Math.round(job.elapsedMs * (100 - job.progress) / job.progress) : null; this.repository.state.notifications.unshift({ id: crypto.randomUUID(), type: "stage-completed", message: `${stage.label} completed`, createdAt: nowIso(), read: false }); this.persist(job);
    }
    job.status = "completed"; job.currentStage = null; job.completedAt = nowIso(); this.persist(job); return clone(job);
  }
  resumeAll(context) { return Promise.all(this.repository.state.queue.filter(({ status }) => status === "running" || status === "queued").map((job) => this.run(job.id, context))); }
}

export async function collectDiagnostics({ workerUrl = "http://127.0.0.1:8787/health", database, storage, fetcher = globalThis.fetch } = {}) {
  const probe = async (task) => { try { await task(); return "online"; } catch { return "offline"; } };
  const audio = typeof globalThis.AudioContext !== "undefined" || typeof globalThis.webkitAudioContext !== "undefined";
  return { checkedAt: nowIso(), worker: await probe(async () => { const response = await fetcher(workerUrl); if (!response.ok) throw new Error(); }), piper: await probe(async () => { const response = await fetcher(`${workerUrl}/piper`); if (!response.ok) throw new Error(); }), database: await probe(async () => database?.()), storage: await probe(async () => storage?.()), audioContext: audio ? "available" : "unavailable", browserCompatible: Boolean(globalThis.Promise && globalThis.Blob), userAgent: globalThis.navigator?.userAgent || "unknown" };
}

export function performanceSnapshot(queue = [], cache = {}) { const memory = globalThis.performance?.memory; return { ramBytes: memory?.usedJSHeapSize ?? null, queueSize: queue.filter(({ status }) => ["queued", "running"].includes(status)).length, cacheHits: cache.hits || 0, cacheMisses: cache.misses || 0, renderDurationMs: cache.renderDurationMs || 0 }; }
export function buildExport(type, project, extras = {}) { const payload = type === "production-report" ? { projectId: project.id, generatedAt: nowIso(), ...extras } : type === "diagnostics-report" ? extras : { project, ...extras }; return new Blob([JSON.stringify(payload, null, 2)], { type: type === "wav" ? "audio/wav" : "application/json" }); }
