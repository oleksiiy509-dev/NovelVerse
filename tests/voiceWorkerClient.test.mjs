import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workerClient = await readFile(new URL("../src/lib/voiceWorker.js", import.meta.url), "utf8");
const reader = await readFile(new URL("../src/pages/Reader.jsx", import.meta.url), "utf8");
const studio = await readFile(new URL("../src/pages/UniversalVoiceStudio.jsx", import.meta.url), "utf8");
const chapterGeneration = await readFile(new URL("../src/components/ChapterGeneration.jsx", import.meta.url), "utf8");
const workerSecurity = await readFile(new URL("../voice-worker/middleware/security.js", import.meta.url), "utf8");

test("health checks always make a fresh worker request and normalize every provider", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ status: "Connected", providers: [{ id: "fish-speech", available: false }, { id: "kokoro", available: true }, { id: "piper", available: true }] }) };
  };
  try {
    const { getVoiceWorkerHealth } = await import(`../src/lib/voiceWorker.js?health-test=${Date.now()}`);
    const first = await getVoiceWorkerHealth();
    const second = await getVoiceWorkerHealth();
    assert.equal(calls.length, 2);
    assert.ok(calls.every(call => call.url === "http://127.0.0.1:8787/health" && call.options.cache === "no-store"));
    assert.deepEqual(first.providers.map(provider => [provider.id, provider.available]), [["fish-speech", false], ["kokoro", true], ["piper", true]]);
    assert.equal(first.selectedProvider, "kokoro");
    assert.equal(second.selectedProvider, "kokoro");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("frontend voice worker client uses local defaults and public endpoints only", () => {
  assert.match(workerClient, /defaultVoiceWorkerUrl = "http:\/\/127\.0\.0\.1:8787"/);
  assert.match(workerClient, /VITE_VOICE_WORKER_URL/);
  assert.match(workerClient, /"\/health"/);
  assert.match(workerClient, /"\/synthesize"/);
  assert.match(workerClient, /"\/preview"/);
  assert.match(workerClient, /provider = "narrator"/);
  assert.match(workerClient, /uk_UA-ukrainian_tts-medium/);
  assert.match(workerClient, /VITE_VOICE_WORKER_TOKEN/);
  assert.match(workerClient, /"generic-http": "fish-speech"/);
  assert.match(workerClient, /Authorization: `Bearer/);
  assert.match(workerClient, /chapter-jobs\/\$\{encodeURIComponent\(id\)\}\/download/);
  assert.doesNotMatch(workerClient, /SECRET/);
});

test("audio production reports a reachable provider as ONLINE", () => {
  assert.match(chapterGeneration, /result\.online \? "ONLINE"/);
  assert.match(chapterGeneration, /"Local worker connected"/);
  assert.doesNotMatch(chapterGeneration, /result\.piperAvailable && result\.capabilities\?\.outputAvailable \? "Connected"/);
});

test("chapter generation explains and logs every button enablement blocker", () => {
  assert.match(chapterGeneration, /!chapter && "No chapter is selected\."/);
  assert.match(chapterGeneration, /!chapterSegments\.length && "No narration segments are assigned to this chapter\."/);
  assert.match(chapterGeneration, /health\.label === "Offline"/);
  assert.match(chapterGeneration, /health\.label === "Error"/);
  assert.match(chapterGeneration, /console\.warn\("Generate Chapter disabled:", generationDisabledReason\)/);
  assert.match(chapterGeneration, /disabled=\{generationDisabled\}/);
  assert.match(chapterGeneration, /role="status">\{generationDisabledReason\}/);
});

test("reader chunks local Piper synthesis and exposes controls", () => {
  assert.match(reader, /splitTextForVoiceWorker\(stripReaderMarkup\(chapter\.content/);
  assert.match(reader, /playLocalVoiceFromChunk/);
  assert.match(reader, /Озвучити/);
  assert.match(reader, /Retry Piper/);
  assert.match(reader, /revokeObjectURL/);
  assert.match(reader, /Device Voice fallback remains available/);
});

test("universal voice studio displays worker and Piper status with voice list preview", () => {
  assert.match(studio, /Worker \{workerStatus\.loading/);
  assert.match(studio, /Piper \{workerStatus\.piperAvailable/);
  assert.match(studio, /Available voices/);
  assert.match(studio, /Preview Piper/);
  assert.match(studio, /synthesizeVoiceWorkerAudio/);
});

test("voice studio health check refreshes state and exposes loading and failure feedback", () => {
  assert.match(studio, /checkWorkerHealth = useCallback\(async/);
  assert.match(studio, /setWorkerStatus\(status => \(\{ \.\.\.status, loading: true \}\)\)/);
  assert.match(studio, /setWorkerStatus\(\{ \.\.\.status, loading: false \}\)/);
  assert.match(studio, /Health check failed:/);
  assert.match(studio, /onClick=\{checkWorkerHealth\}/);
  assert.match(studio, /workerStatus\.loading\?"Checking…":"Health Check"/);
});

test("voice worker exposes CORS headers for local Vite development", () => {
  assert.match(workerSecurity, /allowedCorsOrigins/);
  assert.match(workerSecurity, /access-control-allow-origin', origin/);
  assert.match(workerSecurity, /access-control-allow-methods', corsMethods/);
  assert.match(workerSecurity, /access-control-expose-headers', 'X-NovelVerse-Metadata, Content-Type'/);
});
