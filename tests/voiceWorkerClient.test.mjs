import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workerClient = await readFile(new URL("../src/lib/voiceWorker.js", import.meta.url), "utf8");
const reader = await readFile(new URL("../src/pages/Reader.jsx", import.meta.url), "utf8");
const studio = await readFile(new URL("../src/pages/UniversalVoiceStudio.jsx", import.meta.url), "utf8");
const workerSecurity = await readFile(new URL("../voice-worker/middleware/security.js", import.meta.url), "utf8");

test("frontend voice worker client uses local defaults and public endpoints only", () => {
  assert.match(workerClient, /defaultVoiceWorkerUrl = "http:\/\/127\.0\.0\.1:8787"/);
  assert.match(workerClient, /VITE_VOICE_WORKER_URL/);
  assert.match(workerClient, /"\/health"/);
  assert.match(workerClient, /"\/synthesize"/);
  assert.match(workerClient, /"\/preview"/);
  assert.match(workerClient, /provider = "piper"/);
  assert.match(workerClient, /uk_UA-ukrainian_tts-medium/);
  assert.doesNotMatch(workerClient, /TOKEN|SECRET|Authorization|Bearer/);
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

test("voice worker exposes CORS headers for local Vite development", () => {
  assert.match(workerSecurity, /access-control-allow-origin', '\*'/);
  assert.match(workerSecurity, /access-control-allow-methods', 'GET,POST,OPTIONS'/);
  assert.match(workerSecurity, /access-control-expose-headers', 'x-novelverse-metadata,content-type'/);
});
