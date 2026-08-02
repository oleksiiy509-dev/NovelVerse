import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260802030000_contextual_chapter_import.sql", "utf8");
const studio = readFileSync("src/pages/NovelVerseStudio.jsx", "utf8");
const importView = readFileSync("src/components/BookImport.jsx", "utf8");

test("chapter import targets only the explicitly opened novel", () => {
  assert.match(migration, /target_novel_id bigint/);
  assert.doesNotMatch(migration, /insert into public\.novels/i);
  assert.match(migration, /on conflict \(novel_id, number\).*do nothing/is);
});

test("contextual novel routes expose manual add and rich chapter import", () => {
  assert.match(studio, /add-chapter/);
  assert.match(studio, /import-chapters/);
  assert.match(importView, /const acceptedFormats = "\.txt,\.fb2,\.epub,\.docx,\.pdf"/);
  assert.match(importView, /Current chapters/);
  assert.match(importView, /Incoming chapters/);
  assert.match(importView, /Duplicate chapters/);
  assert.match(importView, /New chapters/);
  assert.match(importView, /Final total/);
  assert.match(importView, /Skipped duplicates:/);
  assert.match(importView, /Total chapters:/);
});
