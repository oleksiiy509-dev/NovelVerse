import assert from "node:assert/strict";
import test from "node:test";
import { analyzeChapters } from "../src/lib/voiceDirectorLocal.js";
import { firstChapterWithSegments, loadVoiceDirector, saveVoiceDirector } from "../src/lib/voiceDirectorStorage.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("Analyze Chapter -> save narration segments -> Audio Production enables the matching chapter", () => {
  const storage = memoryStorage();
  const book = { id: "book-1", chapters: [
    { id: "chapter-1", title: "Empty first chapter" },
    { id: "chapter-2", title: "Arrival", content: "The train reached the silent platform." },
  ] };

  const analyzed = analyzeChapters([book.chapters[1]]);
  saveVoiceDirector(book.id, analyzed, storage, new EventTarget());

  const productionDirector = loadVoiceDirector(book.id, storage);
  const selectedChapter = firstChapterWithSegments(book.chapters, productionDirector.segments);
  const chapterSegments = productionDirector.segments.filter((segment) => String(segment.chapterId) === String(selectedChapter.id));

  assert.equal(selectedChapter.id, "chapter-2");
  assert.equal(chapterSegments[0].text, "The train reached the silent platform.");
  assert.equal(chapterSegments.length > 0, true, "Generate Chapter has narration and can be enabled");
});

test("saving in Voice Direction immediately notifies an open Audio Production subscriber", () => {
  const storage = memoryStorage();
  const events = new EventTarget();
  let refreshes = 0;
  events.addEventListener("novelverse:voice-director-saved", () => { refreshes += 1; });
  saveVoiceDirector("book-1", analyzeChapters([{ id: "chapter-1", title: "One", content: "Ready." }]), storage, events);
  assert.equal(refreshes, 1);
});
