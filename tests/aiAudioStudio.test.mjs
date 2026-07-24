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
  assert.equal(imported.version, 2);
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

test("timeline character ids remain stable when voice settings change", () => {
  const project = createAudioStudioProject();
  const edited = updateClip(project, "character_mira", "clip_mira_1", { volume: 0.4, voiceId: "female_young_soft" });
  assert.equal(project.tracks.find((track) => track.id === "character_mira").clips[0].characterId, "mira");
  assert.equal(edited.tracks.find((track) => track.id === "character_mira").clips[0].characterId, "mira");
});

import { createAudioStudioProjectFromChapter, fetchAudioStudioChapters, fetchAudioStudioNovels, getProjectStorageKey, hasChapterText, loadAudioStudioProject, mergeManualEdits, regenerateScene, saveAudioStudioProject, sortChaptersByNumber } from "../src/lib/aiAudioStudio.js";

function mockSupabase({ novels = [], chapters = [], error = null } = {}) {
  const api = { table: "", select() { return this; }, order() { return this; }, eq(column, value) { this.filter = { column, value }; return this; }, maybeSingle() { const data = chapters.find((c) => String(c.id) === String(this.filter?.value)); return Promise.resolve({ data: data || null, error }); }, then(resolve) { const data = this.table === "novels" ? novels : chapters.filter((c) => !this.filter || String(c.novel_id) === String(this.filter.value)); return Promise.resolve({ data, error }).then(resolve); } };
  return { from(table) { return { ...api, table }; } };
}

const realChapter = { id: "c1", novelId: "n1", title: "Rain", number: 1, content: "Rain fell.\n\n\"Go,\" Mira said.\n\n***\n\nI remembered the door." };

test("novel and chapter loading from Supabase sorts chapters by number", async () => {
  const supabase = mockSupabase({ novels: [{ id: "n1", title: "Novel" }], chapters: [{ id: "c2", novel_id: "n1", number: 2 }, { id: "c1", novel_id: "n1", number: 1 }] });
  assert.equal((await fetchAudioStudioNovels(supabase))[0].title, "Novel");
  assert.deepEqual((await fetchAudioStudioChapters(supabase, "n1")).map((c) => c.id), ["c1", "c2"]);
  assert.deepEqual(sortChaptersByNumber([{ number: 10 }, { number: 2 }]).map((c) => c.number), [2, 10]);
});

test("empty chapter handling reports unavailable text", () => {
  assert.equal(hasChapterText({ content: "<p> </p>" }), false);
  assert.equal(hasChapterText({ text: "Words" }), true);
});

test("producer project preserves source text and stable scene and clip ordering", () => {
  const project = createAudioStudioProjectFromChapter(realChapter);
  assert.deepEqual(project.scenes.map((s) => s.index), project.scenes.map((_, i) => i));
  const sourceClips = project.tracks.flatMap((t) => t.clips).filter((c) => ["narrator", "dialogue", "thought"].includes(c.clipType));
  const ordered = [...sourceClips].sort((a, b) => a.sourceOrder - b.sourceOrder);
  assert.deepEqual(ordered.map((c) => c.sourceOrder), ordered.map((_, i) => i));
  assert.ok(sourceClips.some((c) => c.sourceText === "Rain fell."));
  assert.ok(sourceClips.some((c) => c.sourceText === "\"Go,\""));
});

test("persistent character ids survive timeline generation", () => {
  const project = createAudioStudioProjectFromChapter(realChapter, { knownCharacters: [{ name: "Mira", id: "mira" }] });
  assert.ok(project.registry.characters.some((c) => c.id === "mira"));
  assert.ok(project.tracks.flatMap((t) => t.clips).some((c) => c.characterId === "mira"));
});

test("manual edits are preserved and one scene can regenerate", () => {
  const project = createAudioStudioProjectFromChapter(realChapter);
  const first = project.tracks.flatMap((t) => t.clips).find((c) => c.clipType === "narrator");
  const previous = updateClip(project, "narrator", first.id, { voiceId: "manual_voice", volume: 0.33 });
  const merged = mergeManualEdits(createAudioStudioProjectFromChapter(realChapter), previous);
  assert.equal(merged.tracks.flatMap((t) => t.clips).find((c) => c.id === first.id).voiceId, "manual_voice");
  const regenerated = regenerateScene(previous, realChapter, first.sceneId);
  assert.equal(regenerated.tracks.flatMap((t) => t.clips).find((c) => c.id === first.id).voiceId, "manual_voice");
});

test("overwrite confirmation can detect edited saved projects and persistence migration", () => {
  const storage = { data: new Map(), getItem(k) { return this.data.get(k) || null; }, setItem(k, v) { this.data.set(k, String(v)); } };
  const project = updateClip(createAudioStudioProjectFromChapter(realChapter), "narrator", "clip_evt_seg_1_1", { voiceId: "edited" });
  saveAudioStudioProject(project, storage);
  const loaded = loadAudioStudioProject("n1", "c1", storage);
  assert.equal(storage.data.has(getProjectStorageKey("n1", "c1")), true);
  assert.equal(loaded.audioStudioVersion, 2);
  assert.equal(loaded.tracks.some((t) => t.clips.some((c) => c.manuallyEdited)), true);
});
