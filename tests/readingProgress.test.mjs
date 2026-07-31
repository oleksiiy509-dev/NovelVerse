import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { toReadingProgressRow } from "../src/lib/readingProgress.js";

const migration = await readFile(
  new URL("../supabase/migrations/20260731120000_reading_progress.sql", import.meta.url),
  "utf8",
);

test("reading progress migration defines UUID relationships and indexes", () => {
  assert.match(migration, /id uuid primary key default gen_random_uuid\(\)/);
  assert.match(migration, /user_id uuid not null references auth\.users\(id\) on delete cascade/);
  assert.match(migration, /novel_id uuid not null references public\.novels\(id\) on delete cascade/);
  assert.match(migration, /chapter_id uuid not null references public\.chapters\(id\) on delete cascade/);
  assert.match(migration, /create unique index if not exists reading_progress_user_novel_idx/);
  assert.match(migration, /reading_progress_user_updated_idx/);
  assert.match(migration, /reading_progress_novel_idx/);
  assert.match(migration, /reading_progress_chapter_idx/);
});

test("reading progress policies isolate authenticated users", () => {
  assert.match(migration, /alter table public\.reading_progress enable row level security/);
  assert.match(migration, /for select[\s\S]*?using \(auth\.uid\(\) = user_id\)/);
  assert.match(migration, /for insert[\s\S]*?with check \(auth\.uid\(\) = user_id\)/);
  assert.match(migration, /for update[\s\S]*?using \(auth\.uid\(\) = user_id\)[\s\S]*?with check \(auth\.uid\(\) = user_id\)/);
  assert.doesNotMatch(migration, /for delete/);
});

test("Reader payloads map to the production columns only", () => {
  assert.deepEqual(
    toReadingProgressRow({
      user_id: "user-id",
      novel_id: "novel-id",
      chapter_id: "chapter-id",
      progress: 42,
      scroll_y: 1234,
      audio_progress: 80,
      updated_at: "2026-07-31T12:00:00.000Z",
    }),
    {
      user_id: "user-id",
      novel_id: "novel-id",
      chapter_id: "chapter-id",
      progress_percent: 42,
      scroll_position: 1234,
      updated_at: "2026-07-31T12:00:00.000Z",
    },
  );
});
