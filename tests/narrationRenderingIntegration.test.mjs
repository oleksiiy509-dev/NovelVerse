import test from "node:test";
import assert from "node:assert/strict";
import { prepareNarratedChapterSegments } from "../src/lib/narrationRendering.js";
import { AudioRenderQueue, getClipRenderPayload } from "../src/lib/audioRenderingPipeline.js";

const required = ["pitch", "timbre", "speakingRate", "pauses", "energy", "emphasis", "whisper", "breathing"];

test("chapter generation analyzes text sentence by sentence with every narration parameter", () => {
  const segments = prepareNarratedChapterSegments([{ text: "The darkness hid the key. Attack now!" }], { voice: "one-narrator" });
  assert.equal(segments.length, 2);
  for (const sentence of segments) {
    for (const key of required) assert.notEqual(sentence[key], undefined, key);
    assert.equal(sentence.voice, "one-narrator");
    assert.equal(sentence.speaker, "Narrator");
    assert.ok(sentence.narrationEngine.segmentId);
  }
  assert.notDeepEqual(segments[0].timbre, segments[1].timbre);
  assert.notEqual(segments[0].energy, segments[1].energy);
});

test("audio rendering automatically applies analysis and locks every clip to one narrator", async () => {
  const project = { id: "dynamic", language: "en", tracks: [{ id: "speech", type: "narrator", clips: [
    { id: "one", sourceOrder: 1, sourceText: "The haunted darkness screamed!", voiceId: "fixed" },
    { id: "two", sourceOrder: 2, sourceText: "Attack the enemy now!", voiceId: "other" },
  ] }] };
  const calls = [];
  const queue = new AudioRenderQueue({ project, synthesize: async (request) => { calls.push(request); return { blob: new Blob([request.text]) }; } });
  assert.equal((await queue.render()).status, "completed");
  assert.equal(calls.length, 2);
  assert.deepEqual(new Set(calls.map((call) => call.voice)), new Set(["fixed"]));
  for (const call of calls) for (const key of required) assert.notEqual(call.options[key], undefined, key);
  assert.notEqual(calls[0].options.energy, calls[1].options.energy);
  assert.equal(calls.every((call) => call.options.characterId === "narrator"), true);
  assert.equal(getClipRenderPayload(project.tracks[0].clips[0], project).narrationEngine.version, 3);
});
