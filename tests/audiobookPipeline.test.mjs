import test from "node:test";
import assert from "node:assert/strict";
import { AUDIOBOOK_STAGE_GRAPH, AudiobookPipeline, PIPELINE_STATUSES } from "../src/lib/audiobookPipeline.js";

function memoryStorage() { const values = new Map(); return { values, getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) }; }
function handlers(calls, overrides = {}) { return Object.fromEntries(AUDIOBOOK_STAGE_GRAPH.map(({ id }) => [id, overrides[id] || (async ({ dependencies, source, updateProgress }) => { calls.push(id); updateProgress(50); return { id, value: source.text, dependencies: Object.keys(dependencies) }; })])); }

test("full pipeline executes every stage and produces a report", async () => {
  const calls = []; const pipeline = new AudiobookPipeline({ handlers: handlers(calls), storage: memoryStorage() });
  const state = await pipeline.start({ text: "Chapter one" });
  assert.equal(state.status, PIPELINE_STATUSES.COMPLETED);
  assert.deepEqual(calls, AUDIOBOOK_STAGE_GRAPH.map((stage) => stage.id));
  assert.equal(state.stages.every((stage) => stage.progress === 100), true);
  assert.equal(state.report.completedStages.length, 9);
});

test("partial rebuild reruns a configured stage and only its descendants", async () => {
  const calls = []; const pipeline = new AudiobookPipeline({ handlers: handlers(calls), storage: memoryStorage() });
  await pipeline.start({ text: "Same" }); calls.length = 0;
  await pipeline.start({ text: "Same" }, { stageConfig: { "sound-design": { style: "cinematic" } } });
  assert.deepEqual(calls, ["sound-design", "mixer-preparation", "final-mix", "export"]);
});

test("cancelled pipeline stops safely", async () => {
  const calls = []; let release;
  const slow = () => new Promise((resolve) => { release = resolve; });
  const pipeline = new AudiobookPipeline({ handlers: handlers(calls, { "chapter-analysis": slow }), storage: memoryStorage() });
  const running = pipeline.start({ text: "Cancel" }); await new Promise((resolve) => setTimeout(resolve, 0)); pipeline.cancel(); release({});
  const state = await running; assert.equal(state.status, PIPELINE_STATUSES.CANCELLED); assert.equal(state.stages[0].status, PIPELINE_STATUSES.CANCELLED);
});

test("failed stage can recover without rerunning completed work", async () => {
  const calls = []; let fail = true;
  const pipeline = new AudiobookPipeline({ handlers: handlers(calls, { "sound-design": async () => { calls.push("sound-design"); if (fail) throw new Error("asset service offline"); return { recovered: true }; } }), storage: memoryStorage() });
  let state = await pipeline.start({ text: "Recover" }); assert.equal(state.status, PIPELINE_STATUSES.FAILED); fail = false; calls.length = 0;
  state = await pipeline.restartFailed({ text: "Recover" }); assert.equal(state.status, PIPELINE_STATUSES.COMPLETED); assert.equal(calls[0], "sound-design"); assert.equal(calls.includes("chapter-analysis"), false);
});

test("cache is reused by a new pipeline instance", async () => {
  const storage = memoryStorage(); const firstCalls = [];
  await new AudiobookPipeline({ id: "cache", handlers: handlers(firstCalls), storage }).start({ text: "Cached" });
  const secondCalls = []; const second = new AudiobookPipeline({ id: "cache", handlers: handlers(secondCalls), storage }); const state = await second.start({ text: "Cached" });
  assert.deepEqual(secondCalls, []); assert.equal(state.report.skippedStages.length, 9);
});

test("source dependency changes invalidate the affected graph", async () => {
  const calls = []; const pipeline = new AudiobookPipeline({ handlers: handlers(calls), storage: memoryStorage() });
  await pipeline.start({ text: "Old" }); calls.length = 0; await pipeline.start({ text: "New" });
  assert.deepEqual(calls, AUDIOBOOK_STAGE_GRAPH.map((stage) => stage.id));
});
