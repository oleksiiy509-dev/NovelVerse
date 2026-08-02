import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("novel deletes cascade to dependent chapters", () => {
  const migration = readFileSync("supabase/migrations/20260802000000_cascade_novel_chapter_deletes.sql", "utf8");

  assert.match(migration, /drop constraint if exists chapters_novel_id_fkey/i);
  assert.match(migration, /foreign key \(novel_id\) references public\.novels\(id\) on delete cascade/i);
});

test("transactional novel deletion upgrades every novel and chapter dependency", () => {
  const migration = readFileSync("supabase/migrations/20260802020000_transactional_novel_delete.sql", "utf8");

  assert.match(migration, /^begin;/m);
  assert.match(migration, /confrelid in \('public\.novels'::regclass, 'public\.chapters'::regclass\)/i);
  assert.match(migration, /chapter_audio, chapter_voice_segments, chapter_director_plans/i);
  assert.match(migration, /audio_render_jobs, audio_render_segments/i);
  assert.match(migration, /comments,\n-- bookmarks/i);
  assert.match(migration, /create or replace function public\.delete_novels\(novel_ids bigint\[\]\)/i);
  assert.match(migration, /delete from public\.novels\s+where id = any\(novel_ids\)/i);
  assert.match(migration, /commit;/i);
});

test("all persisted book delete paths use the transactional RPC", () => {
  const deletion = readFileSync("src/lib/novelDeletion.js", "utf8");
  const admin = readFileSync("src/pages/AdminNovels.jsx", "utf8");
  const studio = readFileSync("src/lib/studioBooks.js", "utf8");
  const management = readFileSync("src/lib/bookManagement.js", "utf8");

  assert.match(deletion, /supabase\.rpc\("delete_novels", \{ novel_ids: novelIds \}\)/);
  assert.match(admin, /deleteNovels\(\[novel\.id\]\)/);
  assert.match(admin, /deleteNovels\(selected\)/);
  assert.match(studio, /await deleteNovels\(ids\)/);
  assert.match(management, /await deleteNovels\(\[id\]\)/);
});

test("single and bulk novel deletes require destructive-action confirmation", () => {
  const page = readFileSync("src/pages/AdminNovels.jsx", "utf8");

  assert.match(page, /Permanently delete novel .*all of its chapters\?/);
  assert.match(page, /Permanently delete .*selected novel.*all of their chapters\?/);
  assert.match(page, /This action cannot be undone\./);
});
