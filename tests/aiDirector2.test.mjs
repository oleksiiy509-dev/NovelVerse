import test from "node:test";
import assert from "node:assert/strict";
import { detectPerformanceTraits, directTextPerformance, getCinematicPause, loadAiDirector2Settings, narrationPresets, saveAiDirector2Settings } from "../src/lib/voiceDirector/aiDirector2.js";

test("AI Director 2.0 detects narration, dialogue, thoughts and expressive punctuation", () => {
  assert.equal(detectPerformanceTraits('"Run!" she shouted.').dialogue, true);
  assert.equal(detectPerformanceTraits('"Run!" she shouted!').shouting, true);
  assert.equal(detectPerformanceTraits('He wondered if it was safe?').thoughts, true);
  assert.equal(detectPerformanceTraits('He wondered if it was safe?').questions, true);
  assert.equal(detectPerformanceTraits('The road was empty.').narration, true);
  assert.equal(detectPerformanceTraits('She whispered, "hide."').whisper, true);
});

test("AI Director 2.0 presets choose rate pitch volume and pauses", () => {
  assert.deepEqual(Object.keys(narrationPresets), ["audiobook", "dramatic", "calm", "horror", "action"]);
  const horror = directTextPerformance('The shadow whispered, "Who is there?"', { settings: { preset: "horror" } });
  const action = directTextPerformance('RUN NOW!!', { settings: { preset: "action" } });
  assert.ok(horror.rate < action.rate);
  assert.ok(action.volume >= horror.volume);
  assert.ok(horror.pauseAfterMs > 0);
});

test("AI Director 2.0 applies cinematic pauses and per-character overrides from localStorage settings", () => {
  const storage = new Map();
  const adapter = { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) };
  saveAiDirector2Settings({ preset: "calm", characterOverrides: { Mira: { rate: 1.2, pitch: 1.1, volume: 0.8, pauseScale: 1.4 } } }, adapter);
  const settings = loadAiDirector2Settings(adapter);
  const perf = directTextPerformance('"Are you coming?"', { settings, speakerName: "Mira" });
  assert.ok(perf.rate > narrationPresets.calm.rate);
  assert.ok(perf.pitch > narrationPresets.calm.pitch);
  assert.ok(perf.volume < narrationPresets.calm.volume);
  assert.ok(getCinematicPause("***", { sceneBreak: true }) >= 1600);
});
