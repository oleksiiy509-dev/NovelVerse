import test from "node:test";
import assert from "node:assert/strict";
import { getBookStatistics, validateBookChapters } from "../src/lib/bookImport.js";

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
