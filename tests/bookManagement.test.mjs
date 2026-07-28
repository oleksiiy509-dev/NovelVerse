import test from "node:test";
import assert from "node:assert/strict";
import { duplicateChapter, reorderChapters, validateBook } from "../src/lib/bookManagementCore.js";

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
  assert.deepEqual(validateBook({ title: "Book", author: "Writer", status: "Published" }), {});
});
