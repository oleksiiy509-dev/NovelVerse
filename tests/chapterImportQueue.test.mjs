import test from "node:test";
import assert from "node:assert/strict";
import { createQueueFiles, DEFAULT_IMPORT_BATCH_SIZE, importPreview, MAX_IMPORT_BATCH_SIZE, normalizeBatchSize, prepareQueuedChapters, queueTotals } from "../src/lib/chapterImportQueue.js";
import { readFileSync } from "node:fs";

test("queue batches default to and never exceed 100 chapters", () => {
  assert.equal(DEFAULT_IMPORT_BATCH_SIZE, 100);
  assert.equal(MAX_IMPORT_BATCH_SIZE, 100);
  assert.match(readFileSync("src/lib/bookImportPersistence.js", "utf8"), /chapters\.length > MAX_IMPORT_BATCH_SIZE/);
  assert.equal(normalizeBatchSize(1000), 100);
  assert.equal(normalizeBatchSize(25), 25);
  assert.equal(normalizeBatchSize(0), 1);
});

test("queued chapter preparation skips existing and in-file duplicate numbers", () => {
  const result = prepareQueuedChapters([{ title: "Chapter 1", content: "duplicate" }, { title: "Chapter 2", content: "new" }, { title: "Chapter 2 again", number: 2, content: "duplicate" }], [1]);
  assert.deepEqual(result.additions.map((chapter) => chapter.number), [2]);
  assert.equal(result.skipped, 2);
});

test("file queue retains selection order and reports final statistics", () => {
  const files = createQueueFiles([{ name: "Part1.txt" }, { name: "Part2.fb2" }]);
  assert.deepEqual(files.map((file) => file.name), ["Part1.txt", "Part2.fb2"]);
  const totals = queueTotals([{ ...files[0], status: "completed", detected: 10, added: 8, skipped: 2 }, { ...files[1], status: "failed", detected: 5, added: 2, failed: 3 }]);
  assert.deepEqual(totals, { detected: 15, added: 10, skipped: 2, failed: 3, completed: 1, failedFiles: 1 });
});

test("file queue uses natural part ordering and previews the final chapter total", () => {
  const files = createQueueFiles([{ name: "Part10.txt" }, { name: "Part2.txt" }, { name: "Part1.txt" }]);
  assert.deepEqual(files.map((file) => file.name), ["Part1.txt", "Part2.txt", "Part10.txt"]);
  files[0].detected = 10;
  files[0].skipped = 2;
  assert.deepEqual(importPreview(files, 7), { current: 7, detected: 10, duplicates: 2, additions: 8, finalTotal: 15 });
});
