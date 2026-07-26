import test from "node:test";
import assert from "node:assert/strict";
import { applyVoicePreset, assignVoice, createVoiceReport, exportVoicePreset, importVoicePreset, inferUniversalProfile, migrateVoiceStudioState, normalizeVoiceProfile, resolveCharacterVoice, universalVoiceProfiles, validateVoiceStudio, versionVoiceProfile, voiceProviderAdapters, voicePresets } from "../src/lib/universalVoiceStudio.js";

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
  assert.equal(parsed.version, 2);
  assert.equal(parsed.assignments.c1.profileId, "robot");
});

test("bulk assignment preserves existing cast and supports locks", () => {
  const assigned = assignVoice({ old: { profileId: "narrator" } }, ["c1", "c2"], "robot", { locked: true });
  assert.equal(assigned.old.profileId, "narrator");
  assert.equal(assigned.c1.profileId, "robot");
  assert.equal(assigned.c2.locked, true);
});

test("all production presets configure a normalized profile", () => {
  assert.deepEqual(Object.keys(voicePresets), ["Audiobook", "Cinematic", "Horror", "Fantasy", "Calm", "Action", "Neutral"]);
  const cinematic = applyVoicePreset({ id: "hero", name: "Hero" }, "Cinematic");
  assert.equal(cinematic.preset, "Cinematic");
  assert.equal(cinematic.narrationStyle, "cinematic");
});

test("validation catches missing, duplicate, provider, language, and settings conflicts", () => {
  const issues = validateVoiceStudio({ narratorId: "missing", profiles: [{ id: "a", name: "A", role: "narrator", provider: "unknown", language: "xx", rate: 8 }, { id: "b", role: "narrator" }], assignments: { c1: { profileId: "gone" } } });
  for (const code of ["missing_voice", "duplicate_narrator", "unsupported_provider", "invalid_language", "incompatible_settings"]) assert.ok(issues.some(issue => issue.code === code), code);
});

test("v1 persistence migrates, profiles version, and reports unused voices", () => {
  const migrated = migrateVoiceStudioState({ version: 1, profiles: [{ id: "narrator", label: "Narrator", provider: "browser", voice: "system-default" }], assignments: {} });
  assert.equal(migrated.version, 2);
  assert.equal(migrated.profiles[0].voiceId, "system-default");
  const changed = versionVoiceProfile(normalizeVoiceProfile(migrated.profiles[0]), { rate: 1.2 });
  assert.equal(changed.profile.version, 2);
  assert.equal(changed.historyEntry.version, 1);
  const report = createVoiceReport({ ...migrated, characters: [] });
  assert.equal(report.unusedVoices.length, 0);
});
