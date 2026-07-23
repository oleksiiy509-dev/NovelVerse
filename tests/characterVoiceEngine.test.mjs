import assert from "node:assert/strict";
import test from "node:test";
import { buildPersistentCharacterRegistry, detectCharacterNames, getCharacterVoiceRegistryKey, resolveCharacterVoiceForSegment, updateCharacterProfile } from "../src/lib/characterVoiceEngine.js";

global.localStorage = {
  data: new Map(),
  getItem(key) { return this.data.get(key) ?? null; },
  setItem(key, value) { this.data.set(key, String(value)); },
  removeItem(key) { this.data.delete(key); },
};

test("detects attributed character names and creates unknown defaults", () => {
  const found = detectCharacterNames('"We leave now," said Alice. Bob answered, "Wait." Alice smiled.');
  assert.ok(found.some((c) => c.name === "Alice"));
  assert.ok(found.some((c) => c.name === "Bob"));
  assert.equal(found.find((c) => c.name === "Alice").gender, "unknown");
  assert.equal(found.find((c) => c.name === "Alice").ageCategory, "unknown");
});

test("persists registry in localStorage and keeps narrator profile", () => {
  const registry = buildPersistentCharacterRegistry({ novelId: "novel-1", content: 'Alice said hello. Alice waved.' });
  assert.ok(global.localStorage.getItem(getCharacterVoiceRegistryKey("novel-1")));
  assert.equal(registry.characters[0].id, "narrator");
});

test("manual reassignment is used for dialogue while narration stays narrator", () => {
  buildPersistentCharacterRegistry({ novelId: "novel-2", content: 'Alice said hello. Alice waved.' });
  const updated = updateCharacterProfile("novel-2", "alice", { preferredVoice: "female_young_soft", gender: "female", ageCategory: "young" });
  assert.equal(resolveCharacterVoiceForSegment({ segment_type: "dialogue", speaker_name: "Alice" }, updated).preferredVoice, "female_young_soft");
  assert.equal(resolveCharacterVoiceForSegment({ segment_type: "narration", speaker_name: "Alice" }, updated).preferredVoice, "narrator_neutral");
});
