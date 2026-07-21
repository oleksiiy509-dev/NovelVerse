import test from "node:test";
import assert from "node:assert/strict";
import { applyTemporaryVoiceState, buildVoiceSegmentCacheIdentity, defaultVoiceVariationProfileMap, defaultVoiceVariationProfiles, evolveVoiceProfile, normalizeAudioOutputOptions, routeVoiceForLanguage, validateVoiceVariationProfile } from "../src/lib/voiceVariations.js";
import { MockVoiceTransformProcessor, PassthroughVoiceTransformProcessor, transformVoice } from "../src/lib/voiceTransformation.js";

test("profile validation enforces safe parameter limits", () => {
  assert.equal(defaultVoiceVariationProfiles.length, 12);
  assert.throws(() => validateVoiceVariationProfile({ ...defaultVoiceVariationProfileMap.child, pitch_semitones: 9 }), /pitch_semitones/);
  assert.throws(() => validateVoiceVariationProfile({ ...defaultVoiceVariationProfileMap.robot, speed: 2 }), /speed/);
});

test("character consistency identity includes stable profile fields", () => {
  const profile = defaultVoiceVariationProfileMap.young_male;
  const identity = buildVoiceSegmentCacheIdentity({ profile, temporaryState: "angry", engineVersion: "engine-a" });
  assert.deepEqual(identity, { base_provider: profile.base_provider, model: profile.base_model, voice: profile.base_voice, profile_id: "young_male", profile_version: 1, temporary_state: "angry", transformation_engine_version: "engine-a" });
});

test("temporary modifiers layer without overwriting permanent profile", () => {
  const profile = defaultVoiceVariationProfileMap.mature_female;
  const layered = applyTemporaryVoiceState(profile, ["whispering", "distant"]);
  assert.equal(profile.energy, 0.55);
  assert.ok(layered.energy < profile.energy);
  assert.equal(layered.base_voice, profile.base_voice);
  assert.equal(layered.version, profile.version);
});

test("gradual age evolution updates version", () => {
  const evolved = evolveVoiceProfile(defaultVoiceVariationProfileMap.child, { targetProfileId: "mature_male", reason: "child to adult" }, 0.5);
  assert.equal(evolved.version, 2);
  assert.ok(evolved.pitch_semitones < defaultVoiceVariationProfileMap.child.pitch_semitones);
  assert.ok(evolved.pitch_semitones > defaultVoiceVariationProfileMap.mature_male.pitch_semitones);
});

test("unsupported language uses fallback warning", () => {
  const profile = { ...defaultVoiceVariationProfileMap.narrator_neutral, languages: ["en"] };
  const routed = routeVoiceForLanguage(profile, "uk");
  assert.equal(routed.profile.id, "narrator_neutral");
  assert.match(routed.warning, /does not support/);
});

test("mock and passthrough processors avoid paid API and expose preview metadata", async () => {
  const profile = defaultVoiceVariationProfileMap.robot;
  const mock = await transformVoice({ audio: new Uint8Array([1, 2]), profile, temporaryState: "masked", outputFormat: "mp3", processor: new MockVoiceTransformProcessor() });
  assert.equal(mock.metadata.processor, "mock");
  assert.equal(mock.metadata.synthetic, true);
  const pass = await transformVoice({ audio: new Uint8Array([3]), profile, processor: new PassthroughVoiceTransformProcessor() });
  assert.equal(pass.audio[0], 3);
  assert.match(pass.metadata.warning, /disabled/);
});

test("normalization options are explicit before merging", () => {
  assert.deepEqual(normalizeAudioOutputOptions({}), { sampleRate: 44100, channels: 1, loudnessLufs: -16, silencePaddingMs: 120, outputFormat: "mp3" });
});
