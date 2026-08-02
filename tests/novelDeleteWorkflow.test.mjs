import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("novel deletes cascade to dependent chapters", () => {
  const migration = readFileSync("supabase/migrations/20260802000000_cascade_novel_chapter_deletes.sql", "utf8");

  assert.match(migration, /drop constraint if exists chapters_novel_id_fkey/i);
  assert.match(migration, /foreign key \(novel_id\) references public\.novels\(id\) on delete cascade/i);
});

test("single and bulk novel deletes require destructive-action confirmation", () => {
  const page = readFileSync("src/pages/AdminNovels.jsx", "utf8");

  assert.match(page, /Permanently delete novel .*all of its chapters\?/);
  assert.match(page, /Permanently delete .*selected novel.*all of their chapters\?/);
  assert.match(page, /This action cannot be undone\./);
});
