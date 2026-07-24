import test from "node:test";
import assert from "node:assert/strict";
import { analyzeChapterStructure, createAiProducerProject, estimateClipDuration, generateProductionTimeline, recommendSoundEffects } from "../src/lib/aiProducerEngine.js";
import { createAudioStudioProjectFromChapter } from "../src/lib/aiAudioStudio.js";

const chapter = {
  id: "ch-1",
  novelId: "novel-1",
  title: "Storm Gate",
  content: `Night rain hammered the castle gate. Mira held her breath and remembered the summer before the war.

"Run!" Mira shouted as thunder rolled above the street.

***

At dawn, Kael opened the old door. His heart beat faster in the silent room.

"We wait," Kael whispered.`,
};

test("AI Producer analyzes chapter structure into scenes and segment types", () => {
  const scenes = analyzeChapterStructure(chapter.content, { novelId: chapter.novelId });
  assert.equal(scenes.length, 2);
  assert.ok(scenes[0].segments.some((segment) => segment.type === "dialogue"));
  assert.ok(scenes[0].segments.some((segment) => segment.structureTags.includes("flashback")));
  assert.ok(scenes[1].segments.some((segment) => segment.structureTags.includes("suspense")));
});

test("AI Producer generates editable production timeline metadata and recommendations", () => {
  const timeline = generateProductionTimeline(chapter, { novelId: chapter.novelId });
  assert.ok(timeline.duration > 0);
  assert.ok(timeline.events.some((event) => event.trackType === "narrator"));
  assert.ok(timeline.events.some((event) => event.trackType === "characters"));
  assert.ok(timeline.events.some((event) => event.type === "ambience"));
  assert.ok(timeline.scenes.every((scene) => scene.metadata.location && scene.metadata.timeOfDay && scene.metadata.mood && scene.recommendations.ambience));
  assert.ok(timeline.scenes.some((scene) => scene.recommendations.musicIntensity > 0.3));
});

test("AI Producer builds AI Audio Studio compatible tracks without synthesizing audio", () => {
  const project = createAiProducerProject(chapter, { novelId: chapter.novelId });
  assert.equal(project.synthesisPolicy, "manual_only");
  assert.equal(project.editable, true);
  assert.deepEqual(project.tracks.filter((track) => ["narrator", "ambient", "music", "sfx"].includes(track.type)).map((track) => track.type), ["narrator", "ambient", "music", "sfx"]);
  assert.ok(project.tracks.some((track) => track.type === "character"));
  assert.ok(project.tracks.flatMap((track) => track.clips).every((clip) => clip.synthesisStatus === "not_synthesized" && clip.editable === true));
});

test("AI Audio Studio imports producer projects as validated projects", () => {
  const project = createAudioStudioProjectFromChapter(chapter, { novelId: chapter.novelId });
  assert.equal(project.audioStudioVersion, 2);
  assert.ok(project.metadata.length >= 2);
  assert.ok(project.tracks.every((track) => Array.isArray(track.clips)));
});

test("duration and sound-effect recommendation helpers are deterministic", () => {
  assert.equal(estimateClipDuration("one two three four", { type: "narration" }), 2.06);
  assert.deepEqual(recommendSoundEffects("The door opened as thunder shook the room."), ["thunder hit", "door creak"]);
});
