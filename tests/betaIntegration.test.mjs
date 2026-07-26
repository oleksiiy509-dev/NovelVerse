import test from "node:test";
import assert from "node:assert/strict";
import { BackgroundQueue, BetaRepository, BETA_STAGES, buildExport, collectDiagnostics, exportBetaSettings, importBetaSettings, performanceSnapshot, preserveManualState, resetBetaSettings } from "../src/lib/betaIntegration.js";
import { DiagnosticLogger } from "../src/lib/diagnosticLogger.js";

function storage() { const values = new Map(); return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) }; }
function setup(runners = {}) { const repository = new BetaRepository(storage(), "test"); return { repository, queue: new BackgroundQueue({ repository, runners }) }; }

test("complete one-click pipeline executes all eight stages", async () => {
  const called = []; const runners = Object.fromEntries(BETA_STAGES.map(({ id }) => [id, async () => { called.push(id); return { id }; }]));
  const { repository, queue } = setup(runners); const project = repository.upsertProject({ id: "p1", name: "Book" }); const result = await queue.run(queue.add({ projectId: project.id, chapterIds: ["c1"] }).id);
  assert.equal(result.status, "completed"); assert.equal(result.progress, 100); assert.deepEqual(called, BETA_STAGES.map(({ id }) => id)); assert.equal(repository.state.notifications.length, 8);
});

test("queue resumes after a persisted browser restart", async () => {
  const store = storage(); const firstRepo = new BetaRepository(store, "resume"); firstRepo.upsertProject({ id: "p1", name: "Book" }); const first = new BackgroundQueue({ repository: firstRepo }); const job = first.add({ projectId: "p1", chapterIds: ["c1"] }); job.stageIndex = 4; job.progress = 50; firstRepo.save();
  const secondRepo = new BetaRepository(store, "resume"); await new BackgroundQueue({ repository: secondRepo }).resumeAll(); assert.equal(secondRepo.state.queue[0].status, "completed");
});

test("autosave creates a valid checkpoint and recovery rolls corrupted project back", () => {
  const repository = new BetaRepository(storage(), "recovery"); repository.upsertProject({ id: "p1", name: "Safe", manualEdits: { clip: "kept" } }); repository.state.projects[0].name = "Corrupted";
  const recovered = repository.recover("p1"); assert.equal(recovered.name, "Safe"); assert.equal(recovered.manualEdits.clip, "kept");
});

test("rollback restores a chosen checkpoint", () => {
  const repository = new BetaRepository(storage(), "rollback"); repository.upsertProject({ id: "p1", name: "Version 1" }); const point = repository.state.checkpoints.p1[0]; repository.upsertProject({ id: "p1", name: "Version 2" }); assert.equal(repository.rollback("p1", point.id).name, "Version 1");
});

test("diagnostics reports worker, Piper, database, storage, and compatibility", async () => {
  const result = await collectDiagnostics({ fetcher: async () => ({ ok: true }), database: async () => true, storage: async () => true }); assert.equal(result.worker, "online"); assert.equal(result.piper, "online"); assert.equal(result.database, "online"); assert.equal(result.storage, "online"); assert.equal(result.browserCompatible, true);
});

test("batch processing retains selected chapters and can stop", async () => {
  const { repository, queue } = setup({ analyze: async ({ job }) => { queue.stop(job.id); return {}; } }); repository.upsertProject({ id: "p1", name: "Book" }); const job = queue.add({ projectId: "p1", chapterIds: ["c2", "c4"] }); const result = await queue.run(job.id); assert.deepEqual(result.chapterIds, ["c2", "c4"]); assert.equal(result.status, "cancelled");
});

test("exports build project, production, diagnostics, and WAV blobs", async () => {
  for (const type of ["project-package", "production-report", "diagnostics-report", "wav"]) assert.ok((await buildExport(type, { id: "p1" }, {}).text()).length > 0);
});

test("project manager duplicates, archives, restores, and deletes", () => {
  const repository = new BetaRepository(storage(), "projects"); repository.upsertProject({ id: "p1", name: "Book" }); const copy = repository.duplicate("p1"); repository.archive(copy.id); assert.equal(repository.state.archivedProjects.length, 1); repository.restore(copy.id); assert.equal(repository.state.projects.length, 2); repository.delete(copy.id); assert.deepEqual(repository.state.projects.map(({ id }) => id), ["p1"]);
});

test("manual assignments, mixer edits, and locked scenes survive regeneration", () => {
  const result = preserveManualState({ manualEdits: [1], voiceAssignments: { hero: "v1" }, soundAssignments: { rain: "a1" }, mixerEdits: { gain: 2 }, scenes: [{ id: "s1", locked: true, text: "manual" }] }, { scenes: [{ id: "s1", text: "generated" }] }); assert.equal(result.scenes[0].text, "manual"); assert.equal(result.voiceAssignments.hero, "v1"); assert.equal(result.mixerEdits.gain, 2);
});

test("failure is persisted in the Error Center and performance reports queue size", async () => {
  const { repository, queue } = setup({ analyze: async () => { throw new Error("Worker offline"); } }); repository.upsertProject({ id: "p1", name: "Book" }); const result = await queue.run(queue.add({ projectId: "p1", wholeNovel: true }).id); assert.equal(result.status, "failed"); assert.equal(repository.state.errors[0].message, "Worker offline"); assert.equal(performanceSnapshot(repository.state.queue).queueSize, 0);
});

test("settings round-trip through a versioned export and reject invalid files", async () => {
  const settings = resetBetaSettings(); settings.pipeline.autoResume = false;
  assert.deepEqual(importBetaSettings(await exportBetaSettings(settings).text()), settings);
  assert.throws(() => importBetaSettings('{"schemaVersion":2}'), /invalid settings/i);
});

test("diagnostic logs redact private fields and stay memory bounded", () => {
  const logger = new DiagnosticLogger(2);
  logger.info("worker", "one", { token: "private", nested: { password: "private" } });
  logger.warn("storage", "two"); logger.error("pipeline", "three");
  const report = logger.export();
  assert.equal(report.entries.length, 2);
  assert.equal(JSON.stringify(report).includes("private"), false);
});

test("starting the same pipeline job twice shares one execution", async () => {
  let calls = 0; const runners = Object.fromEntries(BETA_STAGES.map(({ id }) => [id, async () => { calls += 1; await new Promise((resolve) => setTimeout(resolve, 1)); }]));
  const { repository, queue } = setup(runners); repository.upsertProject({ id: "p1", name: "Book" }); const job = queue.add({ projectId: "p1" });
  const first = queue.run(job.id); const second = queue.run(job.id); await Promise.all([first, second]);
  assert.equal(calls, BETA_STAGES.length);
});
