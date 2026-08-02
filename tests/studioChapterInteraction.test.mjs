import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const studioBook = readFileSync("src/components/StudioBook.jsx", "utf8");

test("Studio chapter rows open the selected chapter in the Reader", () => {
  assert.match(studioBook, /chapters\.map\(\(chapter\).*onClick=\{\(\) => navigate\(`\/reader\/\$\{chapter\.id\}`\)\}/);
});

test("Studio chapter imports remain available", () => {
  assert.match(studioBook, /mode === "import"/);
  assert.match(studioBook, /<BookImport novel=\{novel\}/);
  assert.match(studioBook, /navigate\(`\$\{base\}\/import-chapters`\)/);
});
