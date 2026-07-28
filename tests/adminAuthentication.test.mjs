import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { requireAdmin } from "../src/lib/admin.js";

const migration = await readFile(new URL("../supabase/migrations/20260728093000_admin_bootstrap.sql", import.meta.url), "utf8");

function client({ user = { id: "user-1" }, allowed = false, roleError = null } = {}) {
  return {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    rpc: async (name) => {
      assert.equal(name, "bootstrap_first_admin");
      return { data: allowed, error: roleError };
    },
  };
}

test("admin access uses the server role/bootstrap RPC", async () => {
  assert.equal((await requireAdmin(client({ allowed: true }))).allowed, true);
  assert.equal((await requireAdmin(client({ allowed: false }))).allowed, false);
});

test("role lookup errors fail closed", async () => {
  const error = new Error("migration missing");
  const result = await requireAdmin(client({ allowed: true, roleError: error }));
  assert.equal(result.allowed, false);
  assert.equal(result.error, error);
});

test("migration uses a server-owned role table and serialized bootstrap", () => {
  assert.match(migration, /create table if not exists public\.user_roles/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /auth\.uid\(\)/);
  assert.doesNotMatch(migration.match(/create or replace function public\.is_admin\(\)[\s\S]*?\$\$;/)?.[0] || "", /app_metadata|user_metadata/);
  assert.match(migration, /grant execute on function public\.bootstrap_first_admin\(\) to authenticated/);
});
