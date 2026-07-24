import assert from "node:assert/strict";
import test from "node:test";
import { attributeDialogueSegments, buildPersistentCharacterRegistry, characterVoiceSchema, detectCharacterNames, getCharacterVoiceRegistryKey, loadCharacterRegistry, mergeCharacterAliases, resolveCharacterVoiceForSegment, updateCharacterProfile } from "../src/lib/characterVoiceEngine.js";

global.localStorage = { data: new Map(), getItem(key) { return this.data.get(key) ?? null; }, setItem(key, value) { this.data.set(key, String(value)); }, removeItem(key) { this.data.delete(key); }, clear() { this.data.clear(); } };

test("migrates v1 profiles to v2 schema", () => {
  localStorage.clear();
  localStorage.setItem(getCharacterVoiceRegistryKey("migrate"), JSON.stringify({ version: "character-voice-engine-v1", characters: [{ id: "alice", name: "Alice", gender: "female", ageCategory: "young", preferredVoice: "female_young_soft", narrationOverrides: { rate: 1.1 }, manuallyAssigned: true }] }));
  const registry = loadCharacterRegistry("migrate");
  const alice = registry.characters.find((c) => c.id === "alice");
  assert.equal(registry.version, characterVoiceSchema.version);
  assert.equal(alice.ageCategory, "young-adult");
  assert.equal(alice.voiceId, "female_young_soft");
  assert.equal(alice.manualLock, true);
  assert.equal(alice.rate, 1.1);
});

test("detects gender, age, and role from dialogue context", () => {
  const found = detectCharacterNames('The young woman Alice said, "We leave now!" She waved. Alice smiled. Bob answered, "Wait." The boy Bob was afraid. Bob replied.');
  const alice = found.find((c) => c.name === "Alice");
  const bob = found.find((c) => c.name === "Bob");
  assert.equal(alice.gender, "female");
  assert.ok(["young-adult", "child"].includes(alice.ageCategory));
  assert.ok(["protagonist", "supporting"].includes(alice.role));
  assert.equal(bob.ageCategory, "child");
});

test("persists assignment across chapters and keeps narrator profile", () => {
  localStorage.clear();
  const one = buildPersistentCharacterRegistry({ novelId: "novel-1", content: 'Alice said hello. Alice waved.' });
  const two = buildPersistentCharacterRegistry({ novelId: "novel-1", content: 'Alicia smiled. Alice replied.', existingRegistry: one });
  assert.equal(two.characters[0].id, "narrator");
  assert.equal(two.characters.filter((c) => c.id === "alice").length, 1);
});

test("alias merging prevents duplicates", () => {
  localStorage.clear();
  buildPersistentCharacterRegistry({ novelId: "aliases", content: 'Alice said hello. Alice waved. Alicia said hi. Alicia smiled.' });
  let registry = loadCharacterRegistry("aliases");
  registry = updateCharacterProfile("aliases", "alice", { aliases: ["Alice", "Alicia"] });
  registry = mergeCharacterAliases("aliases", "alice", "alicia");
  assert.equal(registry.characters.filter((c) => c.name === "Alicia").length, 0);
  assert.ok(registry.characters.find((c) => c.id === "alice").aliases.includes("Alicia"));
});

test("manual lock preserves profile during automatic inference", () => {
  localStorage.clear();
  buildPersistentCharacterRegistry({ novelId: "lock", content: 'Alice said hello. Alice waved.' });
  updateCharacterProfile("lock", "alice", { gender: "male", ageCategory: "elderly", voiceId: "male_elderly" });
  const registry = buildPersistentCharacterRegistry({ novelId: "lock", content: 'Alice said, "Yes." She is a young woman. Alice smiled.' });
  const alice = registry.characters.find((c) => c.id === "alice");
  assert.equal(alice.gender, "male");
  assert.equal(alice.voiceId, "male_elderly");
});

test("dialogue attribution falls back to narrator when uncertain", () => {
  const registry = buildPersistentCharacterRegistry({ novelId: "fallback", content: 'Alice said hello. Alice waved.' });
  assert.equal(resolveCharacterVoiceForSegment({ segment_type: "dialogue", speaker_name: "Unknown Person" }, registry).id, "narrator");
  const segments = attributeDialogueSegments('"Who goes there?" The door opened.', registry);
  assert.equal(segments[0].characterId, "narrator");
  assert.equal(segments[0].emotion, "neutral");
});

test("per-utterance emotion does not mutate base profile", () => {
  const registry = buildPersistentCharacterRegistry({ novelId: "emotion", content: 'Alice said hello. Alice waved.' });
  const before = registry.characters.find((c) => c.id === "alice").defaultEmotion;
  const segments = attributeDialogueSegments('Alice shouted "Run!!"', registry);
  assert.equal(segments.find((s) => s.type === "dialogue")?.emotion, "shout");
  assert.equal(loadCharacterRegistry("emotion").characters.find((c) => c.id === "alice").defaultEmotion, before);
});
