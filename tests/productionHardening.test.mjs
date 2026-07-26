import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { adminRoutes, applicationRoutes, matchesApplicationRoute, readerRoutes } from "../src/lib/routes.js";
import { shouldFallbackToDeviceVoice, splitTextForVoiceWorker } from "../src/lib/voiceWorker.js";
import { DiagnosticLogger } from "../src/lib/diagnosticLogger.js";

const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

test("every declared reader and admin route is mounted exactly once", () => {
  assert.equal(new Set(applicationRoutes).size, applicationRoutes.length);
  for (const route of [...readerRoutes, ...adminRoutes]) assert.match(appSource, new RegExp(`path=[\"']${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\"']`), route);
  assert.ok(matchesApplicationRoute("/reader/chapter-1"));
  assert.ok(matchesApplicationRoute("/admin/novels/42/characters"));
  assert.equal(matchesApplicationRoute("/admin/not-real"), false);
});

test("route-level loading and recovery UI remain installed", () => {
  assert.match(appSource, /PageLoadingSkeleton/);
  assert.match(appSource, /resetKey=\{location\.pathname\}/);
  assert.match(appSource, /path="\*"/);
});

test("Piper failures have deterministic device voice fallback policy", () => {
  assert.equal(shouldFallbackToDeviceVoice(Object.assign(new Error("offline"), { status: 503 })), true);
  assert.equal(shouldFallbackToDeviceVoice(Object.assign(new Error("bad request"), { status: 400 })), false);
  assert.ok(splitTextForVoiceWorker("One. Two. Three.", 10).every((chunk) => chunk.length <= 10));
});

test("diagnostic exports redact credentials and bound memory", () => {
  const logger = new DiagnosticLogger(2);
  logger.info("test", "first", { token: "private" });
  logger.warn("test", "second");
  logger.error("test", "third");
  assert.equal(logger.export().entries.length, 2);
  const redacted = new DiagnosticLogger().info("test", "safe", { cookie: "x", session: "y", api_key: "z" });
  assert.deepEqual(redacted.context, { cookie: "[redacted]", session: "[redacted]", api_key: "[redacted]" });
});
