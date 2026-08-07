import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260802030000_contextual_chapter_import.sql", "utf8");
const optimizedMigration = readFileSync("supabase/migrations/20260802040000_optimize_contextual_chapter_import.sql", "utf8");
const deployedReplacement = readFileSync("supabase/migrations/20260802050000_fix_chapter_import_ordinality.sql", "utf8");
const persistence = readFileSync("src/lib/bookImportPersistence.js", "utf8");
const studio = readFileSync("src/pages/NovelVerseStudio.jsx", "utf8");
const importView = readFileSync("src/components/BookImport.jsx", "utf8");
const statisticsMigration = readFileSync("supabase/migrations/20260802060000_fix_distinct_chapter_statistics.sql", "utf8");

test("chapter import targets only the explicitly opened novel", () => {
  assert.match(migration, /create or replace function public\.import_novel_chapters\(/);
  assert.match(persistence, /\.rpc\("import_novel_chapters", \{\s*target_novel_id: novelId, import_chapters: chapters/s);
  assert.doesNotMatch(persistence, /import_chapters_into_novel/);
  assert.match(migration, /target_novel_id bigint/);
  assert.doesNotMatch(migration, /insert into public\.novels/i);
  assert.match(migration, /on conflict \(novel_id, number\).*do nothing/is);
});

test("optimized chapter import replacement is deployed as a migration", () => {
  assert.match(deployedReplacement, /^create or replace function public\.import_novel_chapters\(/);
  assert.match(deployedReplacement, /jsonb_array_elements[\s\S]*with ordinality as c\(chapter, ordinal\)/i);
  assert.doesNotMatch(deployedReplacement, /jsonb_to_recordset[\s\S]*with ordinality/i);
  assert.doesNotMatch(optimizedMigration, /jsonb_to_recordset[\s\S]*with ordinality/i);
});

test("contextual novel routes expose manual add and queued chapter import", () => {
  assert.match(studio, /add-chapter/);
  assert.match(studio, /import-chapters/);
  assert.match(importView, /const acceptedFormats = "\.txt"/);
  assert.doesNotMatch(importView, /type="file" multiple/);
  assert.match(importView, /\.filter\(\(file\) => \/\\\.txt\$\/i\.test\(file\.name\)\)\.slice\(0, 1\)/);
  assert.match(importView, /runQueue\(queue, 0\)/);
  assert.match(importView, /Overall progress/);
  assert.match(importView, /Estimated remaining/);
  assert.match(importView, /Retry failed files/);
  assert.match(importView, /Total chapters in novel/);
});

test("every import refreshes the novel statistic from distinct chapter numbers", () => {
  assert.match(statisticsMigration, /count\(distinct chapter\.number\)/i);
  assert.match(statisticsMigration, /where chapter\.novel_id = target_novel_id/i);
  assert.match(statisticsMigration, /refresh_novel_chapter_count\(target_novel_id\)/i);
  assert.match(statisticsMigration, /update public\.novels/i);
  assert.match(importView, /result\.totalChapters/);
  assert.match(importView, /refreshedTotal \?\? currentChapters\.length/);
});
