import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { duplicateChapter, mapSupabaseBookRecord, reorderChapters, validateBook } from "../src/lib/bookManagementCore.js";
import { distinctChaptersByNumber } from "../src/lib/chapterQueries.js";

test("counts one chapter per distinct number and ignores duplicate import rows", () => {
  const chapters = distinctChaptersByNumber([
    { id: 1, novel_id: 10, number: 1 },
    { id: 2, novel_id: 10, number: 1 },
    { id: 3, novel_id: 10, number: 2 },
  ]);
  assert.deepEqual(chapters.map(({ id }) => id), [1, 3]);
});

test("reorders chapters and maintains sequential positions", () => {
  const result = reorderChapters([{ id: "a" }, { id: "b" }, { id: "c" }], 2, 0);
  assert.deepEqual(result.map(({ id, order }) => [id, order]), [["c", 1], ["a", 2], ["b", 3]]);
});

test("duplicates content while resetting generated audio", () => {
  const result = duplicateChapter({ id: "one", title: "Arrival", content: "<p>Hello</p>", audioStatus: "Ready", audioUrl: "/one.mp3" });
  assert.notEqual(result.id, "one");
  assert.equal(result.title, "Arrival (copy)");
  assert.equal(result.content, "<p>Hello</p>");
  assert.equal(result.audioStatus, "Missing");
});

test("validates publishing metadata and scheduled release", () => {
  assert.deepEqual(validateBook({ title: "", author: "", status: "Scheduled", scheduledAt: "" }), { title: "Title is required", author: "Author is required", scheduledAt: "Choose a publication date" });
  assert.deepEqual(validateBook({ title: "Book", author: "Writer", description: "Synopsis", genres: ["Fantasy"], coverUrl: "/cover.jpg", chapters: [{ audioStatus: "Ready", audioUrl: "/chapter.wav" }], status: "Published" }), {});
  assert.equal(validateBook({ title: "Book", author: "Writer", status: "Published" }).audio, undefined);
});

test("maps and orders Supabase records into editor fields", () => {
  const result = mapSupabaseBookRecord({
    id: "book", title: "Book", author: "Writer", age_rating: "16+", cover_url: "/cover.jpg", banner_url: "/banner.jpg",
    chapters: [
      { id: "second", title: "Second", position: 2, audio_status: "Ready", audio_url: "/second.mp3" },
      { id: "first", title: "First", position: 1, audio_status: "Missing" },
    ],
    book_languages: [{ id: "uk", language: "Ukrainian", status: "Review" }],
  }, { language: "English", genres: [], tags: [] });

  assert.equal(result.ageRating, "16+");
  assert.equal(result.coverUrl, "/cover.jpg");
  assert.deepEqual(result.chapters.map(({ id, order }) => [id, order]), [["first", 1], ["second", 2]]);
  assert.equal(result.chapters[1].audioUrl, "/second.mp3");
  assert.deepEqual(result.versions, [{ id: "uk", language: "Ukrainian", status: "Review" }]);
});

test("falls back to the novel language when no language relationship exists", () => {
  const result = mapSupabaseBookRecord({ id: "book", language: "English" }, {});
  assert.deepEqual(result.versions, [{ id: "novel-language-book", language: "English", status: "Complete" }]);
});

test("detects English, Ukrainian, and Russian chapter headings", async () => {
  const { splitIntoChapters } = await import("../src/lib/admin.js");
  const chapters = splitIntoChapters("Глава 1 — Начало\nПервый текст\n\nРозділ 2. Далі\nДругий текст\n\nChapter 3: End\nLast text");
  assert.deepEqual(chapters.map(({ title }) => title), ["Глава 1 — Начало", "Розділ 2. Далі", "Chapter 3: End"]);
});

test("maps managed audiobook voices for all production languages", async () => {
  const { MANAGED_VOICE_MAP } = await import("../src/lib/managedLanguage.js");
  assert.deepEqual(Object.fromEntries(Object.entries(MANAGED_VOICE_MAP).map(([name, voice]) => [name, voice.language])), {
    English: "en", Ukrainian: "uk", Russian: "ru",
  });
});

test("managed Supabase audio uses the server-configured provider instead of forcing Piper", () => {
  const workflow = readFileSync("src/lib/bookWorkflow.js", "utf8");
  assert.match(workflow, /callChapterAudioGeneration\(chapter\.id, voice\.language, "default"\)/);
  assert.doesNotMatch(workflow, /callChapterAudioGeneration\(chapter\.id, voice\.language, voice\.voice\)/);
});

test("managed saves replace client UUIDs with production bigint ids", () => {
  const management = readFileSync("src/components/BookManagement.jsx", "utf8");
  const persistence = readFileSync("src/lib/bookManagement.js", "utf8");
  assert.match(management, /disabled=\{generating\.includes\(item\.id\) \|\| !chapterIsPersisted\}/);
  assert.match(management, /persistedChapterIds\.includes\(item\.id\)/);
  assert.match(persistence, /isClientUuid\(book\.id\)/);
  assert.match(persistence, /insert\(\{ \.\.\.chapter, id: undefined \}\)/);
  assert.match(persistence, /book\.chapters\[index\]\.id = result\.data\.id/);
});

test("managed books use the canonical novels table and chapter relationship", () => {
  const management = readFileSync("src/lib/bookManagement.js", "utf8");
  const workflow = readFileSync("src/lib/bookWorkflow.js", "utf8");
  const migrations = [
    readFileSync("supabase/migrations/20260728080000_book_management_v1.sql", "utf8"),
    readFileSync("supabase/migrations/20260728090000_public_audiobook_catalog.sql", "utf8"),
  ].join("\n");

  assert.doesNotMatch(`${management}\n${workflow}\n${migrations}`, /public\.books|from\(["']books["']\)/);
  assert.match(management, /from\("novels"\)/);
  assert.match(management, /novel_id: book\.id/);
  assert.doesNotMatch(management, /book_languages/);
  assert.doesNotMatch(migrations, /create table if not exists public\.book_languages/);
  assert.doesNotMatch(migrations, /create table if not exists public\.books/);
});

test("the managed books empty state depends on the books list", () => {
  const management = readFileSync("src/components/BookManagement.jsx", "utf8");
  assert.ok(management.includes("const selected = books.find((book) => String(book.id) === String(selectedId)) || books[0]"));
  assert.match(management, /books\.length === 0 \? <div className="cms-empty"><b>No books yet<\/b>/);
});

test("reading progress availability is cached after a missing-table response", () => {
  const networkStatus = readFileSync("src/hooks/useNetworkStatus.js", "utf8");
  assert.match(networkStatus, /let readingProgressAvailable = true/);
  assert.match(networkStatus, /!readingProgressAvailable/);
  assert.match(networkStatus, /status === 404\) \{ readingProgressAvailable = false; return; \}/);
});
