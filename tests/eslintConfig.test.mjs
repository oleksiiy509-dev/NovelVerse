import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("React Refresh is configured once inside the application rules object", async () => {
  const config = await readFile(new URL("../eslint.config.js", import.meta.url), "utf8");
  const refreshRule = "'react-refresh/only-export-components'";

  assert.equal(config.split(refreshRule).length - 1, 1);
  assert.match(config, /rules:\s*\{[\s\S]*?'react-refresh\/only-export-components':\s*'warn',[\s\S]*?\}/);
});
