import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migrationFiles = [
  "supabase/migrations/202607210004_voice_director_phase3.sql",
  "supabase/migrations/202607210005_audio_renderer_phase4.sql",
  "supabase/migrations/202607210006_ai_brain_phase5.sql",
  "supabase/migrations/202607210007_real_tts_phase6.sql",
  "supabase/migrations/202607210008_tts_phase7_compatibility.sql",
];

const referencedPrimaryKeyTypes = new Map([
  ["public.chapters", "bigint"],
  ["public.novels", "bigint"],
  ["auth.users", "uuid"],
  ["public.chapter_director_plans", "uuid"],
  ["public.director_scenes", "uuid"],
  ["public.chapter_voice_segments", "uuid"],
  ["public.audio_render_jobs", "uuid"],
  ["public.character_profiles", "uuid"],
]);

function tableBlocks(sql) {
  const blocks = [];
  const pattern = /create\s+table\s+if\s+not\s+exists\s+([\w.]+)\s*\(/gi;
  let match;
  while ((match = pattern.exec(sql))) {
    let depth = 1;
    let index = pattern.lastIndex;
    while (index < sql.length && depth > 0) {
      const char = sql[index++];
      if (char === "(") depth += 1;
      if (char === ")") depth -= 1;
    }
    blocks.push({ table: match[1], body: sql.slice(pattern.lastIndex, index - 1) });
  }
  return blocks;
}

function columnDefinitions(body) {
  const definitions = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index <= body.length; index += 1) {
    const char = body[index];
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if ((char === "," && depth === 0) || index === body.length) {
      definitions.push(body.slice(start, index).trim().replace(/\s+/g, " "));
      start = index + 1;
    }
  }
  return definitions.filter(Boolean);
}

function referencedColumns(sql) {
  const references = [];
  for (const { table, body } of tableBlocks(sql)) {
    for (const definition of columnDefinitions(body)) {
      const match = definition.match(/^(\w+)\s+([\w]+).*\breferences\s+([\w.]+)\s*\(id\)/i);
      if (match) references.push({ table, column: match[1], type: match[2].toLowerCase(), referencedTable: match[3] });
    }
  }
  return references;
}

test("unapplied migrations use production-compatible foreign key column types", () => {
  const mismatches = [];
  for (const file of migrationFiles) {
    const sql = readFileSync(file, "utf8");
    for (const reference of referencedColumns(sql)) {
      const expectedType = referencedPrimaryKeyTypes.get(reference.referencedTable);
      assert.ok(expectedType, `Add expected primary key type for ${reference.referencedTable}`);
      if (reference.type !== expectedType) mismatches.push({ file, expectedType, ...reference });
    }
  }
  assert.deepEqual(mismatches, []);
});

for (const file of migrationFiles) {
  test(`${file} keeps auth user foreign keys as uuid`, () => {
    const userReferences = referencedColumns(readFileSync(file, "utf8")).filter((reference) => reference.referencedTable === "auth.users");
    for (const reference of userReferences) assert.equal(reference.type, "uuid", `${file}: ${reference.table}.${reference.column}`);
  });
}
