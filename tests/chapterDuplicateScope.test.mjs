import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260802070000_scope_chapter_duplicates_to_novel.sql", "utf8");

test("chapter import detects duplicates by novel id and chapter number", () => {
  assert.match(migration, /where existing\.novel_id = target_novel_id\s+and existing\.number = candidate\.number/i);
  assert.match(migration, /on conflict \(novel_id, number\).*do nothing/is);
});

test("chapter import returns the physical row count for the target novel", () => {
  assert.match(migration, /select count\(\*\) into total_count\s+from public\.chapters chapter\s+where chapter\.novel_id = target_novel_id/i);
});
