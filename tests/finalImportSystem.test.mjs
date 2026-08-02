import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260802010000_final_import_merge_system.sql", "utf8");

test("final import is serialized by title and author and skips duplicate chapter numbers", () => {
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /regexp_replace\(btrim\(import_title\)/);
  assert.match(migration, /regexp_replace\(btrim\(import_author\)/);
  assert.match(migration, /on conflict \(novel_id, number\).*do nothing/is);
});

test("merge moves only missing chapter numbers and deletes the source in one RPC transaction", () => {
  assert.match(migration, /create or replace function public\.merge_novels/);
  assert.match(migration, /delete from public\.chapters s.*s\.number/is);
  assert.match(migration, /update public\.chapters set novel_id = target_novel_id/);
  assert.match(migration, /delete from public\.novels where id = source_novel_id/);
});

test("all direct novel foreign keys are migrated to cascade", () => {
  assert.match(migration, /confrelid = 'public\.novels'::regclass/);
  assert.match(migration, /on delete cascade/i);
});
