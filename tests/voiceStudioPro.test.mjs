import test from "node:test";
import assert from "node:assert/strict";
import { normalizeStudioProfile, readStudioProfiles, saveStudioProfile, voiceStudioSynthesisOptions } from "../src/lib/voiceStudioPro.js";

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test("Voice Studio PRO clamps local profile controls", () => {
  const profile = normalizeStudioProfile({ name: " Test ", speed: 9, pitch: -1, energy: 2, pauseLength: 9999 });
  assert.equal(profile.name, "Test");
  assert.deepEqual(voiceStudioSynthesisOptions(profile), { rate: 1.5, pitch: 0.5, energy: 1, pauseLengthMs: 1200 });
});

test("Voice Studio PRO saves and replaces profiles locally", () => {
  const storage = memoryStorage();
  saveStudioProfile({ id: "hero", name: "Hero", speed: 1 }, storage);
  saveStudioProfile({ id: "hero", name: "Hero revised", speed: 1.2 }, storage);
  assert.deepEqual(readStudioProfiles(storage).map(({ name }) => name), ["Hero revised"]);
});
