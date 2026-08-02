import test from "node:test";
import assert from "node:assert/strict";
import { clearChapterImportDraft, loadChapterImportDraft, saveChapterImportDraft } from "../src/lib/bookImportDraft.js";
import { getImportPersistenceError } from "../src/lib/bookImportError.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("chapter import drafts save, load, and clear locally", () => {
  const storage = memoryStorage();
  const draft = { chapters: [{ title: "One", content: "Preview" }], metadata: { cover: "blob:temporary" } };
  assert.equal(saveChapterImportDraft(42, draft, storage), true);
  assert.deepEqual(loadChapterImportDraft(42, storage), { ...draft, metadata: { cover: "" } });
  assert.equal(clearChapterImportDraft(42, storage), true);
  assert.equal(loadChapterImportDraft(42, storage), null);
});

test("optional local draft failures never throw", () => {
  const unavailable = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("quota"); }, removeItem() { throw new Error("blocked"); } };
  assert.equal(saveChapterImportDraft(42, { chapters: [] }, unavailable), false);
  assert.equal(loadChapterImportDraft(42, unavailable), null);
  assert.equal(clearChapterImportDraft(42, unavailable), false);
});

test("Supabase plain-object failures retain their real diagnostics", () => {
  assert.equal(
    getImportPersistenceError({ message: "RPC failed", details: "Novel was not found", hint: "Reload the book", code: "P0002" }),
    "RPC failed Novel was not found Reload the book (P0002)",
  );
  assert.equal(getImportPersistenceError(new Error("Network unavailable")), "Network unavailable");
});
