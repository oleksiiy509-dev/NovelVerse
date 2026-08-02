import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260802040000_optimize_contextual_chapter_import.sql", "utf8");

test("chapter import stages candidates, detects existing numbers once, and inserts batches", () => {
  assert.match(migration, /create temporary table[\s\S]*chapter_import_candidates/i);
  assert.equal((migration.match(/from public\.chapters chapter/g) || []).length, 1);
  assert.match(migration, /where not already_exists[\s\S]*limit 200/i);
  assert.match(migration, /insert into public\.chapters[\s\S]*where candidate\.number = any\(batch_numbers\)/i);
  assert.match(migration, /on conflict \(novel_id, number\).*do nothing/is);
});

test("chapter import reports added, duplicate, and elapsed-time statistics", () => {
  assert.match(migration, /'added', added_count/);
  assert.match(migration, /'duplicates', supplied_count - added_count/);
  assert.match(migration, /'elapsedTimeMs'/);
});
