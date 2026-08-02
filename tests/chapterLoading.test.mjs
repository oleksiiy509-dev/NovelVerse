import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchChapterMetadataPages } from "../src/lib/chapterQueries.js";

function pagedSupabase(rows) {
  const ranges = [];
  const query = {
    select() { return query; },
    order() { return query; },
    eq() { return query; },
    async range(from, to) {
      ranges.push([from, to]);
      return { data: rows.slice(from, to + 1), error: null };
    },
  };
  return { client: { from: () => query }, ranges };
}

test("chapter metadata pagination loads books with more than the API row cap", async () => {
  const source = Array.from({ length: 6574 }, (_, index) => ({
    id: index + 1,
    novel_id: 42,
    number: index + 1,
    title: `Chapter ${index + 1}`,
  }));
  const { client, ranges } = pagedSupabase(source);

  const chapters = await fetchChapterMetadataPages(client, (query) => query.eq("novel_id", 42));

  assert.equal(chapters.length, 6574);
  assert.deepEqual(chapters.at(-1), source.at(-1));
  assert.deepEqual(ranges[0], [0, 499]);
  assert.deepEqual(ranges.at(-1), [6500, 6999]);
});

test("chapter list screens use the paged metadata loader", () => {
  for (const file of ["src/pages/Novel.jsx", "src/pages/Reader.jsx", "src/components/StudioBook.jsx", "src/lib/aiAudioStudio.js"]) {
    assert.match(readFileSync(file, "utf8"), /fetchChapterMetadataPages/);
  }
});

test("chapter loading has no forbidden 1000-row hard limit", () => {
  const source = ["src/lib/chapterQueries.js", "src/pages/Novel.jsx", "src/pages/Reader.jsx", "src/components/StudioBook.jsx", "src/lib/aiAudioStudio.js"]
    .map((file) => readFileSync(file, "utf8"));
  const forbidden = /range\s*\(\s*0\s*,\s*999\s*\)|limit\s*\(\s*1000\s*\)|slice\s*\(\s*0\s*,\s*1000\s*\)|pageSize\s*[=:]\s*1000/;
  assert.doesNotMatch(source.join("\n"), forbidden);
});
