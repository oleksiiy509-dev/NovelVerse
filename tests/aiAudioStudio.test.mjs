import test from "node:test";
import assert from "node:assert/strict";
import { createAudioStudioProject, deserializeAudioStudioProject, mixPreviewSummary, serializeAudioStudioProject, updateClip } from "../src/lib/aiAudioStudio.js";

test("AI Audio Studio creates the required production tracks", () => {
  const project = createAudioStudioProject();
  assert.deepEqual(project.tracks.map((track) => track.type), ["narrator", "character", "character", "ambient", "music", "sfx"]);
  assert.ok(project.tracks.every((track) => Array.isArray(track.clips)));
});

test("projects export and import as validated JSON", () => {
  const exported = serializeAudioStudioProject(createAudioStudioProject());
  const imported = deserializeAudioStudioProject(exported);
  assert.equal(imported.version, 1);
  assert.equal(imported.tracks.length, 6);
});

test("clip edits are non-destructive immutable updates", () => {
  const project = createAudioStudioProject();
  const edited = updateClip(project, "narrator", "clip_narrator_1", { volume: 0.5, fadeOut: 3 });
  assert.equal(project.tracks[0].clips[0].volume, 0.92);
  assert.equal(edited.tracks[0].clips[0].volume, 0.5);
  assert.notEqual(edited, project);
});

test("live preview summarizes active audible clips", () => {
  const project = createAudioStudioProject();
  const summary = mixPreviewSummary(project, 20);
  assert.ok(summary.some((item) => item.track === "Narrator"));
  assert.ok(summary.some((item) => item.track === "Ambient"));
  assert.ok(summary.some((item) => item.track === "Music"));
});
