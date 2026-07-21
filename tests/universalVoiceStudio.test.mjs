import test from "node:test";
import assert from "node:assert/strict";
import { exportVoicePreset, importVoicePreset, inferUniversalProfile, resolveCharacterVoice, universalVoiceProfiles, voiceProviderAdapters } from "../src/lib/universalVoiceStudio.js";

test("Universal Voice Studio includes required provider-neutral profiles", () => {
  const ids = universalVoiceProfiles.map((profile) => profile.id);
  assert.deepEqual(ids, ["narrator", "young_male", "mature_male", "elderly_male", "young_female", "mature_female", "elderly_female", "child", "villain", "monster", "spirit", "robot", "custom"]);
  for (const profile of universalVoiceProfiles) {
    assert.ok(profile.provider);
    assert.ok(profile.model);
    assert.ok(profile.voice);
    assert.equal(typeof profile.pitchModifier, "number");
    assert.equal(typeof profile.speedModifier, "number");
    assert.equal(typeof profile.energyModifier, "number");
    assert.ok(Array.isArray(profile.emotionDefaults));
    assert.ok(profile.fallbackProvider);
  }
});

test("characters resolve automatic or custom profiles consistently", () => {
  const character = { id: "c1", gender: "female", age_group: "elderly", character_role: "supporting" };
  assert.equal(inferUniversalProfile(character), "elderly_female");
  assert.equal(resolveCharacterVoice({ character }).id, "elderly_female");
  assert.equal(resolveCharacterVoice({ character, assignment: { assignmentMode: "custom", profileId: "robot" } }).id, "robot");
});

test("voice evolution gradually changes parameters without provider coupling", () => {
  const resolved = resolveCharacterVoice({ character: { gender: "male", age_group: "young" }, assignment: { evolution: { pitchPerChapter: -0.01, speedPerChapter: 0.02, energyPerChapter: 0.03 } }, storyProgress: 5 });
  assert.equal(resolved.provider, "openai");
  assert.equal(resolved.pitchModifier, 1);
  assert.equal(resolved.speedModifier, 1.1400000000000001);
  assert.equal(resolved.energyModifier, 0.81);
  assert.ok(voiceProviderAdapters.some((adapter) => adapter.id === resolved.fallbackProvider));
});

test("presets can be exported and imported", () => {
  const json = exportVoicePreset(universalVoiceProfiles, { c1: { assignmentMode: "custom", profileId: "robot" } });
  const parsed = importVoicePreset(json);
  assert.equal(parsed.version, 1);
  assert.equal(parsed.assignments.c1.profileId, "robot");
});
