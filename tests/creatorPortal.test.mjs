import test from "node:test";
import assert from "node:assert/strict";
import { cleanupStorage, createBackup, createNotification, monitorHealth, restoreBackup, schedulePublication, transitionBook } from "../src/lib/creatorPortal.js";

test("production workflow tracks status history", () => {
  const result = transitionBook({ id: 1, status: "Draft" }, "In Review", "2026-07-26T10:00:00Z");
  assert.equal(result.status, "In Review");
  assert.deepEqual(result.publicationHistory[0], { status: "In Review", at: "2026-07-26T10:00:00Z" });
  assert.throws(() => transitionBook(result, "Rendering"), /Unknown publication/);
});

test("scheduler requires complete future schedule", () => {
  const result = schedulePublication({ id: 1 }, { date: "2026-08-01", time: "09:30", timezone: "UTC" }, new Date("2026-07-26T00:00:00Z"));
  assert.equal(result.status, "Scheduled");
  assert.equal(result.schedule.timezone, "UTC");
  assert.throws(() => schedulePublication({}, { date: "2020-01-01", time: "09:00", timezone: "UTC" }, new Date("2026-01-01")), /future/);
});

test("notification events cover production warnings", () => {
  for (const type of ["render_completed", "export_failed", "publication_finished", "worker_offline", "storage_warning"]) {
    assert.equal(createNotification(type, "event", "2026-07-26T00:00:00Z").read, false);
  }
});

test("backup and restore create an isolated snapshot", () => {
  const source = { books: [{ title: "Original" }] };
  const backup = createBackup(source, "Release backup", "2026-07-26T00:00:00Z");
  source.books[0].title = "Changed";
  assert.equal(restoreBackup(backup).books[0].title, "Original");
});

test("storage cleanup only removes cleanable assets", () => {
  const result = cleanupStorage([{ id: "cache", used: 4, cleanable: true }, { id: "audio", used: 9, cleanable: false }], ["cache", "audio"]);
  assert.deepEqual(result.map((item) => item.used), [0, 9]);
});

test("monitoring detects capacity and worker failures", () => {
  assert.equal(monitorHealth({ cpu: 20, ram: 30, storage: 40, workersOnline: 2, workersTotal: 2 }).status, "Healthy");
  assert.deepEqual(monitorHealth({ cpu: 95, ram: 30, storage: 90, workersOnline: 1, workersTotal: 2 }).issues, ["CPU critical", "Storage almost full", "Worker offline"]);
});
