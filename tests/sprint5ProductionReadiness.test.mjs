import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { isAdminUser } from "../src/lib/admin.js";
import { canUsePublishingStudio } from "../src/lib/publishingStudio.js";

const migration = await readFile(new URL("../supabase/migrations/202607270001_production_readiness.sql", import.meta.url), "utf8");
const reader = await readFile(new URL("../src/pages/Reader.jsx", import.meta.url), "utf8");

test("admin authorization ignores client-editable profile fields", () => {
  const forged = { email: "admin@example.com", role: "admin", user_metadata: { role: "admin", is_admin: true } };
  assert.equal(isAdminUser(forged), false);
  assert.equal(canUsePublishingStudio(forged), false);
  assert.equal(isAdminUser({ app_metadata: { role: "admin" } }), true);
  assert.equal(canUsePublishingStudio({ app_metadata: { is_admin: true } }), true);
});

test("database privilege checks use only trusted app metadata", () => {
  const functionBody = migration.match(/create or replace function public\.is_admin\(\)[\s\S]*?\$\$;/)?.[0] || "";
  assert.match(functionBody, /app_metadata/);
  assert.doesNotMatch(functionBody, /user_metadata/);
  assert.match(migration, /alter table public\.subscription_config enable row level security/);
  assert.match(migration, /reading_progress_user_novel_idx/);
  assert.match(migration, /set search_path = ''/);
});

test("reader progress mutations use resilient queue-aware persistence", () => {
  assert.match(reader, /syncReadingProgress\(supabase, user/);
  assert.doesNotMatch(reader, /if \(user\) supabase\.from\("reading_progress"\)\.upsert/);
  assert.match(reader, /Reading progress persistence failed/);
});
