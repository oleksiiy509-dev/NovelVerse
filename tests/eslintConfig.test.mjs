import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("React Refresh is enforced without warnings inside the application rules object", async () => {
  const config = await readFile(new URL("../eslint.config.js", import.meta.url), "utf8");
  const refreshRule = "'react-refresh/only-export-components'";

  assert.equal(config.split(refreshRule).length - 1, 1);
  assert.match(config, /rules:\s*\{[\s\S]*?'react-refresh\/only-export-components':\s*\['error',\s*\{ allowConstantExport: true \}\],[\s\S]*?\}/);
});

test("lint rejects warnings and gives tooling Node globals", async () => {
  const config = await readFile(new URL("../eslint.config.js", import.meta.url), "utf8");
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

  assert.match(packageJson.scripts.lint, /--max-warnings 0$/);
  assert.match(config, /name: 'novelverse\/tooling'[\s\S]*?globals: globals\.node/);
});

test("the application Flat Config has no rule keys at the top level", async () => {
  const config = await readFile(new URL("../eslint.config.js", import.meta.url), "utf8");
  const applicationConfig = config.slice(config.indexOf("name: 'novelverse/application'"));
  const rulesIndex = applicationConfig.indexOf("rules:");
  const refreshRuleIndex = applicationConfig.indexOf("'react-refresh/only-export-components'");

  assert.ok(rulesIndex >= 0, "expected an application rules object");
  assert.ok(refreshRuleIndex > rulesIndex, "expected the React Refresh rule inside rules");
  assert.equal(applicationConfig.slice(0, rulesIndex).includes("react-refresh/only-export-components"), false);
  assert.equal(applicationConfig.split("rules:").length - 1, 1);
});
