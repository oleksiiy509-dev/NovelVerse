import test from "node:test";
import assert from "node:assert/strict";
import { AudioRenderQueue, buildChapterPlaybackManifest, createRenderJob, getClipRenderPayload, loadRenderJob, orderedSpeechClips, saveRenderJob, stableAudioCacheHash } from "../src/lib/audioRenderingPipeline.js";

const project = { id: "p1", novelId: "n1", chapterId: "c1", tracks: [{ id: "n", type: "narrator", name: "Narrator", clips: [
  { id: "a", sourceOrder: 2, sourceText: "Second", voiceId: "persisted", speaker: "Narrator", characterId: "narrator", pauseBefore: 10, pauseAfter: 20, renderState: "not_rendered" },
  { id: "b", sourceOrder: 1, sourceText: "First", voiceId: "persisted", speaker: "Mira", characterId: "char_mira", emotion: "sad", renderState: "not_rendered" },
] }] };
const memoryStorage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

test("stable audio cache hash and invalidation use speech settings only", () => {
  const p = getClipRenderPayload(project.tracks[0].clips[0], project);
  assert.equal(stableAudioCacheHash(p), stableAudioCacheHash({ ...p }));
  assert.notEqual(stableAudioCacheHash(p), stableAudioCacheHash({ ...p, sourceText: "Changed" }));
  assert.notEqual(stableAudioCacheHash(p), stableAudioCacheHash({ ...p, rate: 1.1 }));
});

test("sequential queue ordering, cache hit reuse, duplicate prevention, and retry behavior", async () => {
  const calls = [];
  let failedOnce = false;
  const queue = new AudioRenderQueue({ project, retryBaseDelay: 1, maxRetryCount: 1, synthesize: async ({ text }) => { calls.push(text); if (text === "First" && !failedOnce) { failedOnce = true; throw Object.assign(new Error("rate"), { status: 429 }); } return { blob: new Blob([text]), contentType: "audio/wav" }; } });
  const dup = await Promise.all([queue.renderClip(project.tracks[0].clips[0]), queue.renderClip(project.tracks[0].clips[0])]);
  assert.equal(dup.filter((r) => r.reason === "duplicate request prevented").length, 1);
  calls.length = 0;
  await queue.render();
  assert.deepEqual(calls, ["First", "First"]);
  const hit = await queue.renderClip(project.tracks[0].clips[0]);
  assert.equal(hit.cached, true);
});

test("pause resume cancellation and worker auth errors are represented in job state", async () => {
  const queue = new AudioRenderQueue({ project, retryBaseDelay: 1, synthesize: async () => { await new Promise((r) => setTimeout(r, 5)); return { blob: new Blob(["ok"]) }; } });
  queue.pause();
  const run = queue.render();
  setTimeout(() => queue.resume(), 10);
  const job = await run;
  assert.equal(job.status, "completed");
  const cancelled = new AudioRenderQueue({ project, synthesize: async ({ signal }) => { await new Promise((_, reject) => { signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))); }); } });
  const cancelRun = cancelled.render();
  setTimeout(() => cancelled.cancel(), 1);
  assert.equal((await cancelRun).status, "cancelled");
  const auth = new AudioRenderQueue({ project, maxRetryCount: 0, synthesize: async () => { throw Object.assign(new Error("no"), { status: 401 }); } });
  const failed = await auth.render();
  assert.equal(failed.status, "failed");
});

test("resume after reload skips completed clips and recovers malformed saved render jobs", async () => {
  const storage = memoryStorage();
  saveRenderJob({ ...createRenderJob({ projectId: "p1", novelId: "n1", chapterId: "c1", totalClips: 2 }), completedClipIds: ["b"], totalClips: 2 }, storage);
  assert.equal(loadRenderJob({ projectId: "p1", novelId: "n1", chapterId: "c1" }, storage).progressPercent, 50);
  storage.setItem("novelverse.audioRenderJobs.v1:p1:n1:c1", "{");
  assert.match(loadRenderJob({ projectId: "p1", novelId: "n1", chapterId: "c1" }, storage).error, /Recovered/);
  const renderedProject = { ...project, tracks: [{ ...project.tracks[0], clips: project.tracks[0].clips.map((c) => c.id === "b" ? { ...c, renderState: "rendered", audioUrl: "blob:x" } : c) }] };
  const calls = [];
  await new AudioRenderQueue({ project: renderedProject, storage, synthesize: async ({ text }) => { calls.push(text); return { blob: new Blob([text]) }; } }).render();
  assert.deepEqual(calls, ["Second"]);
});

test("chapter manifest ordering includes silence and persistent character voice use", () => {
  assert.deepEqual(orderedSpeechClips(project).map((c) => c.id), ["b", "a"]);
  const manifest = buildChapterPlaybackManifest(project);
  assert.deepEqual(manifest.items.filter((i) => i.type === "speech").map((i) => i.clipId), ["b", "a"]);
  assert.ok(manifest.items.some((i) => i.type === "silence" && i.duration === 10));
  assert.equal(getClipRenderPayload(project.tracks[0].clips[1], project).voiceId, "persisted");
});
