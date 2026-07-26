import test from "node:test";
import assert from "node:assert/strict";
import { analyzeEmotions, applyEmotionOverride, createEmotionReport, createEmotionStorage, createEmotionTimeline, detectEmotion, EMOTIONS } from "../src/lib/emotionEngine.js";

test("detects supported emotions, contexts and 0-100 intensity", () => {
  assert.equal(detectEmotion("I am furious! Attack the enemy now!").emotion, "angry");
  assert.equal(detectEmotion("The quiet, serene lake was peaceful.").emotion, "calm");
  const horror = detectEmotion("Blood covered the corpse and she screamed in terror!");
  assert.equal(horror.contexts.horror, true); assert.ok(horror.intensity >= 0 && horror.intensity <= 100);
  assert.deepEqual(EMOTIONS, ["neutral", "happy", "sad", "angry", "fear", "surprise", "suspense", "mystery", "excitement", "calm"]);
});

test("timeline represents every sentence without changing its source text", () => {
  const source = " She smiled happily.\nSuddenly, the shadow moved!"; const items = analyzeEmotions(source); const timeline = createEmotionTimeline(items);
  assert.equal(timeline.length, 2); assert.equal(items.map((item) => source.slice(item.start, item.end)).join(""), " She smiled happily.Suddenly, the shadow moved!");
  assert.equal(timeline[1].emotion, "surprise");
});

test("manual overrides include metadata and survive regeneration", () => {
  const generated = analyzeEmotions("The room was quiet. Then it exploded!");
  const edited = applyEmotionOverride(generated, generated[0].id, { emotion: "mystery", intensity: 91, metadata: { whisperLevel: 88 } });
  const regenerated = analyzeEmotions("The room was quiet. Then it exploded!", edited);
  assert.equal(regenerated[0].emotion, "mystery"); assert.equal(regenerated[0].metadata.whisperLevel, 88); assert.equal(regenerated[0].manualOverride, true);
});

test("report summarizes distribution, contexts, peak and overrides", () => {
  let items = analyzeEmotions("I love you, darling. Blood! Attack the enemy now!"); items = applyEmotionOverride(items, items[0].id, { intensity: 99 });
  const report = createEmotionReport(items);
  assert.equal(report.sentences, 3); assert.equal(report.manualOverrides, 1); assert.equal(report.peak.index, 0); assert.equal(report.contexts.romance, 1); assert.equal(report.contexts.battle, 1);
});

test("chapter emotion data persists with an isolated storage adapter", () => {
  const data = new Map(); const adapter = { getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, value) }; const storage = createEmotionStorage(adapter);
  const items = applyEmotionOverride(analyzeEmotions("A wonderful victory!"), analyzeEmotions("A wonderful victory!")[0].id, { intensity: 77 });
  storage.save("chapter-1", items); assert.deepEqual(storage.load("chapter-1"), items); assert.deepEqual(storage.load("missing"), []);
});
