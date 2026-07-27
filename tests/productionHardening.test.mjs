import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { adminRoutes, applicationRoutes, matchesApplicationRoute, readerRoutes } from "../src/lib/routes.js";
import { shouldFallbackToDeviceVoice, splitTextForVoiceWorker } from "../src/lib/voiceWorker.js";
import { DiagnosticLogger } from "../src/lib/diagnosticLogger.js";
import { AUDIOBOOK_STAGE_GRAPH } from "../src/lib/audiobookPipeline.js";

const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const downloadsSource = await readFile(new URL("../src/pages/Downloads.jsx", import.meta.url), "utf8");
const betaSource = await readFile(new URL("../src/pages/BetaDashboard.jsx", import.meta.url), "utf8");
const editNovelSource = await readFile(new URL("../src/pages/EditNovel.jsx", import.meta.url), "utf8");
const vercelConfig = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));

test("every declared reader and admin route is mounted exactly once", () => {
  assert.equal(new Set(applicationRoutes).size, applicationRoutes.length);
  for (const route of [...readerRoutes, ...adminRoutes]) assert.match(appSource, new RegExp(`path=[\"']${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\"']`), route);
  assert.ok(matchesApplicationRoute("/reader/chapter-1"));
  assert.ok(matchesApplicationRoute("/subscription"));
  assert.ok(matchesApplicationRoute("/admin/subscriptions"));
  assert.ok(matchesApplicationRoute("/admin/languages"));
  assert.ok(matchesApplicationRoute("/admin/legacy"));
  assert.ok(matchesApplicationRoute("/admin/novels/42/characters"));
  assert.equal(matchesApplicationRoute("/admin/not-real"), false);
});

test("audited controls cannot navigate to missing records or remain inert", () => {
  assert.match(downloadsSource, /disabled=\{!item\.chapters\?\.\[0\]\?\.chapter_id\}/);
  assert.doesNotMatch(downloadsSource, /reader\/\$\{item\.chapters\[0\]\?\.chapter_id\}/);
  assert.match(betaSource, /Opened \$\{project\.name\}/);
  assert.doesNotMatch(betaSource, /<button>Open<\/button>/);
});

test("admin edit requests expose loading, error, and retry states", () => {
  assert.match(editNovelSource, /aria-busy=\{loading\}/);
  assert.match(editNovelSource, /role="alert"/);
  assert.match(editNovelSource, /onClick=\{retry\}/);
});

test("release audiobook graph reaches a final export through render and mixer", () => {
  assert.deepEqual(AUDIOBOOK_STAGE_GRAPH.map(({ id }) => id), [
    "chapter-analysis", "character-analysis", "narration-planning",
    "production-planning", "sound-design", "voice-rendering",
    "mixer-preparation", "final-mix", "export",
  ]);
  const completed = new Set();
  for (const stage of AUDIOBOOK_STAGE_GRAPH) {
    assert.ok(stage.dependencies.every((dependency) => completed.has(dependency)), `${stage.id} dependency order`);
    completed.add(stage.id);
  }
});

test("deployment applies baseline security and immutable asset headers", () => {
  const globalHeaders = vercelConfig.headers.find(({ source }) => source === "/(.*)")?.headers || [];
  const names = new Set(globalHeaders.map(({ key }) => key.toLowerCase()));
  assert.ok(names.has("x-content-type-options"));
  assert.ok(names.has("referrer-policy"));
  assert.ok(names.has("permissions-policy"));
  const assetCache = vercelConfig.headers.find(({ source }) => source === "/assets/(.*)")?.headers
    .find(({ key }) => key.toLowerCase() === "cache-control")?.value;
  assert.match(assetCache, /immutable/);
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
