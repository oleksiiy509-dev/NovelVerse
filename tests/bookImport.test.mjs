import test from "node:test";
import assert from "node:assert/strict";
import { getBookStatistics, validateBookChapters } from "../src/lib/bookImport.js";
import { chapterNumber, planChapterMerge } from "../src/lib/bookImportMerge.js";

test("calculates import statistics", () => {
  const result = getBookStatistics([
    { content: "one two three" },
    { content: "four five" },
  ]);
  assert.deepEqual(result, { chapters: 2, words: 5, readingMinutes: 1 });
});

test("warns about invalid imported chapters", () => {
  const warnings = validateBookChapters([
    { title: "Opening", content: "" },
    { title: "opening", content: "one two three" },
  ], 2);
  assert.equal(warnings.length, 3);
  assert.match(warnings.join("\n"), /empty/);
  assert.match(warnings.join("\n"), /Duplicate/);
  assert.match(warnings.join("\n"), /word limit/);
});

test("extracts chapter numbers from imported headings", () => {
  assert.equal(chapterNumber({ title: "Chapter 1001 — Return" }, 0), 1001);
  assert.equal(chapterNumber({ title: "Глава 42" }, 0), 42);
  assert.equal(chapterNumber({ title: "Untitled" }, 6), 7);
});

test("merge plan skips database and in-file duplicates while preserving numeric order", () => {
  const result = planChapterMerge([
    { title: "Chapter 1002", content: "b" },
    { title: "Chapter 1001", content: "a" },
    { title: "Chapter 1001 duplicate", content: "duplicate" },
    { title: "Chapter 1000", content: "already imported" },
  ], [1000]);
  assert.deepEqual(result.additions.map((chapter) => chapter.number), [1001, 1002]);
  assert.equal(result.skipped, 2);
});
