import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createApp } from '../api/app.js';
import { requireBearerToken } from '../middleware/auth.js';
import { normalizeNarrationText, planNarration, prepareNarrationRequest } from '../processors/narration.js';

async function fixture(overrides = {}) {
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'nv-worker-'));
  const server = createApp({ token: 'secret', defaultProvider: 'mock', cacheDir, logLevel: 'silent', rateLimitMax: 1000, ...overrides }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { cacheDir, close: () => new Promise((resolve) => server.close(resolve)), request: (url, options) => fetch(`${base}${url}`, options) };
}
async function cleanup(ctx) { await ctx.close(); await rm(ctx.cacheDir, { recursive: true, force: true }); }
function auth(body) { return { method: 'POST', headers: { authorization: 'Bearer secret', 'content-type': 'application/json' }, body: JSON.stringify(body) }; }


const workerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.dirname(workerRoot);
const envPath = path.join(workerRoot, '.env');
const appUrl = pathToFileURL(path.join(workerRoot, 'api/app.js')).href;

async function withTemporaryWorkerEnv(contents, callback) {
  let previous;
  try { previous = await readFile(envPath, 'utf8'); } catch { previous = null; }
  await writeFile(envPath, contents);
  try { await callback(); } finally {
    if (previous === null) await rm(envPath, { force: true });
    else await writeFile(envPath, previous);
  }
}


async function withoutPiperEnv(callback) {
  const previous = { PIPER_BIN: process.env.PIPER_BIN, PIPER_MODEL: process.env.PIPER_MODEL, PIPER_VOICE: process.env.PIPER_VOICE };
  delete process.env.PIPER_BIN;
  delete process.env.PIPER_MODEL;
  delete process.env.PIPER_VOICE;
  try { await callback(); } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function runEnvProbe(cwd, extraEnv = {}) {
  const script = [
    `await import('${appUrl}');`,
    'console.log(JSON.stringify({ PIPER_BIN: process.env.PIPER_BIN, PIPER_MODEL: process.env.PIPER_MODEL }));',
  ].join(' ');
  const env = { ...process.env, ...extraEnv };
  for (const key of ['PIPER_BIN', 'PIPER_MODEL', 'PIPER_VOICE']) {
    if (!(key in extraEnv)) delete env[key];
  }
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd,
    encoding: 'utf8',
    env,
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
}


test('loads Piper paths from voice-worker/.env when started in voice-worker directory', async () => {
  await withTemporaryWorkerEnv('PIPER_BIN=/tmp/worker-dir-piper\nPIPER_MODEL=/tmp/worker-dir-model.onnx\nPIPER_VOICE=test_voice\n', async () => {
    const env = runEnvProbe(workerRoot);
    assert.equal(env.PIPER_BIN, '/tmp/worker-dir-piper');
    assert.equal(env.PIPER_MODEL, '/tmp/worker-dir-model.onnx');
  });
});

test('loads Piper paths from voice-worker/.env when started from repository root and preserves existing env', async () => {
  await withTemporaryWorkerEnv('PIPER_BIN=/tmp/repo-root-piper\nPIPER_MODEL=/tmp/repo-root-model.onnx\nPIPER_VOICE=test_voice\n', async () => {
    const env = runEnvProbe(repoRoot, { PIPER_BIN: '/tmp/existing-piper' });
    assert.equal(env.PIPER_BIN, '/tmp/existing-piper');
    assert.equal(env.PIPER_MODEL, '/tmp/repo-root-model.onnx');
  });
});


test('loads voice-worker .env before direct config imports from a Windows-style launch', async () => {
  const windowsBin = String.raw`C:\NovelVerse\voice-worker\piper\piper.exe`;
  const windowsModel = String.raw`C:\NovelVerse\voice-worker\piper\voices\uk_UA-lada-medium.onnx`;
  await withTemporaryWorkerEnv(`PIPER_BIN=${windowsBin}\r\nPIPER_MODEL=${windowsModel}\r\nDEFAULT_PROVIDER=piper\r\n`, async () => {
    const configUrl = pathToFileURL(path.join(workerRoot, 'utils/config.js')).href;
    const script = [
      `const { config } = await import('${configUrl}');`,
      'console.log(JSON.stringify({ PIPER_BIN: process.env.PIPER_BIN, PIPER_MODEL: process.env.PIPER_MODEL, DEFAULT_PROVIDER: config.defaultProvider }));',
    ].join(' ');
    const env = { ...process.env };
    for (const key of ['PIPER_BIN', 'PIPER_MODEL', 'PIPER_VOICE', 'DEFAULT_PROVIDER']) delete env[key];
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
      cwd: repoRoot,
      encoding: 'utf8',
      env,
    });
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
    assert.equal(parsed.PIPER_BIN, windowsBin);
    assert.equal(parsed.PIPER_MODEL, windowsModel);
    assert.equal(parsed.DEFAULT_PROVIDER, 'piper');
  });
});

test('health returns provider status and runtime details', async () => {
  const ctx = await fixture();
  const res = await ctx.request('/health');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.workerConnected, true);
  assert.equal(body.version, '1.0.0');
  assert.ok(body.providers.some((provider) => provider.id === 'mock' && provider.available));
  assert.ok(body.uptime >= 0);
  await cleanup(ctx);
});

test('Narrator 2.0 normalizes prose and plans titles, dialogue, emphasis, and breathing pauses', () => {
  assert.equal(normalizeNarrationText('Wait...  what ?\r\n\r\n“GO!”'), 'Wait… what?\n\n“GO!”');
  const plan = planNarration('A quiet sentence.\n\n“Run!”', { chapterTitle: 'Chapter One' });
  assert.equal(plan[0].type, 'chapter-title');
  assert.equal(plan[0].pauseAfterMs, 1250);
  assert.equal(plan.at(-1).type, 'dialogue');
  assert.equal(plan.at(-1).emphasis, 'strong');
  assert.ok(plan.at(-1).pauseAfterMs >= 800);
});

test('Narrator 2.0 forces one configured voice for every request', () => {
  const previous = process.env.NARRATOR_VOICE;
  process.env.NARRATOR_VOICE = 'premium-local-narrator';
  const request = prepareNarrationRequest({ text: 'Hello.', voice: 'character-voice' });
  assert.equal(request.voice, 'premium-local-narrator');
  assert.equal(request.options.consistentVoice, true);
  if (previous === undefined) delete process.env.NARRATOR_VOICE; else process.env.NARRATOR_VOICE = previous;
});

test('local Piper chapter generation keeps readable WAV and MP3 files and reuses an unchanged chapter', async () => {
  const previous = { PIPER_BIN: process.env.PIPER_BIN, PIPER_MODEL: process.env.PIPER_MODEL, FFMPEG_BIN: process.env.FFMPEG_BIN };
  const root = await mkdtemp(path.join(os.tmpdir(), 'nv-chapter-'));
  const outputDir = path.join(root, 'voice-output');
  const piper = path.join(root, 'piper');
  const model = path.join(root, 'voice.onnx');
  const ffmpeg = path.join(root, 'ffmpeg');
  await writeFile(model, 'model');
  await writeFile(piper, `#!/usr/bin/env node
const fs = require('node:fs'); const args = process.argv.slice(2); const out = args[args.indexOf('--output_file') + 1];
const wav = Buffer.alloc(16044); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(16000, 40); fs.writeFileSync(out, wav);
`);
  await writeFile(ffmpeg, '#!/bin/sh\n[ "$1" = "-version" ] && exit 0\ncp "$5" "$6"\n');
  await Promise.all([chmod(piper, 0o755), chmod(ffmpeg, 0o755)]);
  process.env.PIPER_BIN = piper; process.env.PIPER_MODEL = model; process.env.FFMPEG_BIN = ffmpeg;
  const ctx = await fixture({ outputDir });
  try {
    const health = await (await ctx.request('/health')).json();
    assert.equal(health.status, 'ONLINE');
    assert.deepEqual(health.capabilities, { ffmpeg: true, outputAvailable: true });
    const payload = { bookId: 'book-1', chapterId: 'chapter-1', chapterNumber: 1, bookTitle: 'A: Book?', language: 'uk', segments: [{ text: 'Offline narration.' }] };
    const created = await ctx.request('/chapter-jobs', auth(payload));
    const createdText = await created.text();
    assert.equal(created.status, 202, createdText);
    let job = JSON.parse(createdText);
    for (let attempt = 0; attempt < 50 && job.status !== 'Finished'; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      job = await (await ctx.request(`/chapter-jobs/${job.id}/status`, { headers: { authorization: 'Bearer secret' } })).json();
    }
    assert.equal(job.status, 'Finished', job.error);
    assert.equal(job.fileName, 'Chapter 0001.wav');
    assert.equal(job.mp3FileName, 'Chapter 0001.mp3');
    assert.equal(job.format, 'wav');
    assert.ok(job.duration > 0); assert.ok(job.size > 44); assert.ok(job.generationTime >= 0);
    assert.equal(job.audioUrl, `/chapter-jobs/${job.id}/download`);
    const audio = await ctx.request(job.audioUrl, { headers: { authorization: 'Bearer secret' } });
    assert.equal(audio.status, 200);
    assert.match(audio.headers.get('content-type'), /audio\/wav/);
    assert.ok((await audio.arrayBuffer()).byteLength > 44);
    assert.equal((await stat(path.join(outputDir, 'A Book', 'Chapter 0001.mp3'))).isFile(), true);
    assert.equal((await stat(path.join(outputDir, 'A Book', 'Chapter 0001.wav'))).isFile(), true);
    const cached = await (await ctx.request('/chapter-jobs', auth({ ...payload, chapterTitle: 'Renamed without audio changes' }))).json();
    assert.equal(cached.status, 'Finished'); assert.equal(cached.cached, true); assert.equal(cached.generationTime, 0);
  } finally {
    await cleanup(ctx); await rm(root, { recursive: true, force: true });
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});


test('providers endpoint returns public provider status', async () => {
  await withoutPiperEnv(async () => {
  const ctx = await fixture();
  const res = await ctx.request('/providers');
  assert.equal(res.status, 200);
  const body = await res.json();
  const piper = body.providers.find((provider) => provider.id === 'piper');
  assert.equal(body.ok, true);
  assert.equal(piper.available, false);
  assert.equal(piper.status.modelConfigured, false);
  assert.ok(!('synthesize' in piper));
  await cleanup(ctx);
  });
});


test('health marks Piper available when configured Windows-style paths exist', async () => {
  const previous = {
    PIPER_BIN: process.env.PIPER_BIN,
    PIPER_MODEL: process.env.PIPER_MODEL,
    PIPER_VOICE: process.env.PIPER_VOICE,
    DEFAULT_LANGUAGE: process.env.DEFAULT_LANGUAGE,
  };
  const root = await mkdtemp(path.join(os.tmpdir(), 'nv-piper-'));
  const bin = path.join(root, 'piper.exe');
  const model = path.join(root, 'voices', 'uk_UA-lada-medium.onnx');
  await mkdir(path.dirname(model), { recursive: true });
  await writeFile(bin, 'test piper executable');
  await writeFile(model, 'test piper model');
  process.env.PIPER_BIN = `"${bin}"`;
  process.env.PIPER_MODEL = `"${model}"`;
  process.env.PIPER_VOICE = 'uk_UA-lada-medium';
  process.env.DEFAULT_LANGUAGE = 'uk';

  const ctx = await fixture();
  const res = await ctx.request('/health');
  assert.equal(res.status, 200);
  const body = await res.json();
  const piper = body.providers.find((provider) => provider.id === 'piper');
  assert.equal(piper.available, true);
  assert.ok(body.availableVoices.some((voice) => voice.id === 'uk_UA-lada-medium'));

  await cleanup(ctx);
  await rm(root, { recursive: true, force: true });
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

test('health marks Piper available for relative paths resolved from voice-worker root', async () => {
  const previous = {
    PIPER_BIN: process.env.PIPER_BIN,
    PIPER_MODEL: process.env.PIPER_MODEL,
    PIPER_VOICE: process.env.PIPER_VOICE,
  };
  const bin = path.join(workerRoot, 'test-piper-bin');
  const model = path.join(workerRoot, 'test-piper-model.onnx');
  await writeFile(bin, 'test piper executable');
  await writeFile(model, 'test piper model');
  process.env.PIPER_BIN = 'test-piper-bin';
  process.env.PIPER_MODEL = 'test-piper-model.onnx';
  process.env.PIPER_VOICE = 'relative-test-voice';

  const ctx = await fixture();
  const res = await ctx.request('/health');
  assert.equal(res.status, 200);
  const body = await res.json();
  const piper = body.providers.find((provider) => provider.id === 'piper');
  assert.equal(piper.available, true);
  assert.ok(body.availableVoices.some((voice) => voice.id === 'relative-test-voice'));
  assert.ok(!('debug' in body));

  await cleanup(ctx);
  await rm(bin, { force: true });
  await rm(model, { force: true });
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

test('health auto-detects bundled Piper when environment paths are omitted', async () => {
  const executable = path.join(workerRoot, 'piper', process.platform === 'win32' ? 'piper.exe' : 'piper');
  const model = path.join(workerRoot, 'piper', 'voices', 'uk_UA-ukrainian_tts-medium.onnx');
  const createdExecutable = process.platform !== 'win32';
  if (createdExecutable) await writeFile(executable, '#!/bin/sh\nexit 0\n');
  await withoutPiperEnv(async () => {
    const ctx = await fixture();
    try {
      const health = await (await ctx.request('/health')).json();
      const piper = health.providers.find((provider) => provider.id === 'piper');
      assert.equal(piper.available, true);
      assert.equal(health.providerAvailable, true);
      assert.equal(health.status, 'ONLINE');
    } finally { await cleanup(ctx); }
  });
  if (createdExecutable) await rm(executable, { force: true });
  assert.equal((await stat(model)).isFile(), true);
});

test('CORS allows localhost development origin', async () => {
  const ctx = await fixture();
  const res = await ctx.request('/providers', { headers: { origin: 'http://localhost:5173' } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.match(res.headers.get('vary'), /Origin/);
  await cleanup(ctx);
});

test('CORS allows 127.0.0.1 development origin', async () => {
  const ctx = await fixture();
  const res = await ctx.request('/health', { headers: { origin: 'http://127.0.0.1:5174' } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5174');
  assert.match(res.headers.get('vary'), /Origin/);
  await cleanup(ctx);
});

test('CORS blocks unknown origin by omitting allow-origin header', async () => {
  const ctx = await fixture();
  const res = await ctx.request('/health', { headers: { origin: 'http://example.com' } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), null);
  assert.match(res.headers.get('vary'), /Origin/);
  await cleanup(ctx);
});

test('CORS OPTIONS preflight returns 204 for allowed origin', async () => {
  const ctx = await fixture();
  const res = await ctx.request('/synthesize', {
    method: 'OPTIONS',
    headers: {
      origin: 'http://localhost:5174',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'Content-Type, Authorization, X-NovelVerse-Token',
    },
  });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5174');
  assert.equal(res.headers.get('access-control-allow-methods'), 'GET, POST, OPTIONS');
  assert.equal(res.headers.get('access-control-allow-headers'), 'Content-Type, Authorization, X-NovelVerse-Token');
  assert.match(res.headers.get('vary'), /Origin/);
  await cleanup(ctx);
});

test('health includes CORS headers for allowed development origin', async () => {
  const ctx = await fixture();
  const res = await ctx.request('/health', { headers: { origin: 'http://localhost:5173' } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.equal(res.headers.get('access-control-allow-methods'), 'GET, POST, OPTIONS');
  assert.equal(res.headers.get('access-control-allow-headers'), 'Content-Type, Authorization, X-NovelVerse-Token');
  assert.equal(res.headers.get('access-control-allow-credentials'), null);
  assert.match(res.headers.get('vary'), /Origin/);
  await cleanup(ctx);
});

test('voice list requires authentication', async () => {
  const ctx = await fixture();
  assert.equal((await ctx.request('/voices')).status, 401);
  const res = await ctx.request('/voices', { headers: { authorization: 'Bearer secret' } });
  assert.equal(res.status, 200);
  assert.ok((await res.json()).providers.find((provider) => provider.id === 'mock'));
  await cleanup(ctx);
});


test('localhost POST synthesize allows missing token when TOKEN is empty for local development', async () => {
  const ctx = await fixture({ token: '' });
  const res = await ctx.request('/synthesize', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'Hello local dev.', provider: 'mock', format: 'wav' }) });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /audio\/wav/);
  await cleanup(ctx);
});

test('localhost POST synthesize accepts bearer token when TOKEN is configured', async () => {
  const ctx = await fixture({ token: 'secret' });
  const res = await ctx.request('/synthesize', auth({ text: 'Hello token.', provider: 'mock', format: 'wav' }));
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /audio\/wav/);
  await cleanup(ctx);
});

test('remote POST synthesize without token returns clear JSON unauthorized error', async () => {
  const middleware = requireBearerToken({ token: 'change-me' });
  let statusCode = 200;
  let payload;
  const req = { path: '/synthesize', headers: { host: 'voice.example.com' }, socket: { remoteAddress: '203.0.113.10' } };
  const res = { status(code) { statusCode = code; return this; }, json(body) { payload = body; return this; } };
  middleware(req, res, () => assert.fail('remote request without token should not continue'));
  assert.equal(statusCode, 401);
  assert.deepEqual(payload, { ok: false, error: 'unauthorized', message: 'Voice Worker authentication required. Send Authorization: Bearer <TOKEN>.' });
});

test('preview generates audio and metadata', async () => {
  const ctx = await fixture();
  const res = await ctx.request('/preview', auth({ text: 'Hello world. Ignore this.', format: 'wav' }));
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /audio\/wav/);
  const metadata = JSON.parse(Buffer.from(res.headers.get('x-novelverse-metadata'), 'base64').toString());
  assert.equal(metadata.provider, 'mock');
  assert.equal(metadata.cacheHit, false);
  await cleanup(ctx);
});

test('running local HTTP provider is ONLINE and supports preview and chapter generation', async () => {
  const previous = { FISH_SPEECH_URL: process.env.FISH_SPEECH_URL, FISH_SPEECH_HEALTH_URL: process.env.FISH_SPEECH_HEALTH_URL, KOKORO_URL: process.env.KOKORO_URL, PIPER_BIN: process.env.PIPER_BIN, PIPER_MODEL: process.env.PIPER_MODEL };
  const wav = Buffer.alloc(16044);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(16000, 40);
  const fishRequests = [];
  const providerServer = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') return res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
    if (req.method === 'POST' && req.url === '/v1/tts') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      return req.on('end', () => {
        fishRequests.push(JSON.parse(body));
        res.writeHead(200, { 'content-type': 'audio/wav' }).end(wav);
      });
    }
    res.writeHead(404).end();
  }).listen(0, '127.0.0.1');
  await new Promise((resolve) => providerServer.once('listening', resolve));
  const providerBase = `http://127.0.0.1:${providerServer.address().port}`;
  process.env.FISH_SPEECH_URL = `${providerBase}/v1/tts`;
  process.env.FISH_SPEECH_HEALTH_URL = `${providerBase}/health`;
  delete process.env.KOKORO_URL; delete process.env.PIPER_BIN; delete process.env.PIPER_MODEL;
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'nv-http-chapter-'));
  const ctx = await fixture({ outputDir });
  try {
    const health = await (await ctx.request('/health')).json();
    assert.equal(health.status, 'ONLINE');
    assert.equal(health.online, true);
    assert.equal(health.providers.find(({ id }) => id === 'fish-speech').available, true);
    const preview = await ctx.request('/preview', auth({ text: 'Provider preview.', provider: 'fish-speech', format: 'wav' }));
    assert.equal(preview.status, 200);
    assert.equal((await preview.arrayBuffer()).byteLength, wav.length);
    assert.equal(fishRequests[0].reference_id, null);
    assert.deepEqual(fishRequests[0].references, []);
    let job = await (await ctx.request('/chapter-jobs', auth({ bookId: 'book-http', chapterId: 'chapter-http', chapterNumber: 1, bookTitle: 'HTTP Provider', provider: 'fish-speech', segments: [{ text: 'Generate this chapter.' }] }))).json();
    for (let attempt = 0; attempt < 50 && job.status !== 'Finished'; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      job = await (await ctx.request(`/chapter-jobs/${job.id}/status`, { headers: { authorization: 'Bearer secret' } })).json();
    }
    assert.equal(job.status, 'Finished', job.error);
    assert.ok(job.size > 44);
  } finally {
    await cleanup(ctx);
    await new Promise((resolve) => providerServer.close(resolve));
    await rm(outputDir, { recursive: true, force: true });
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test('configured but unreachable local HTTP provider remains OFFLINE', async () => {
  const previous = { FISH_SPEECH_URL: process.env.FISH_SPEECH_URL, FISH_SPEECH_HEALTH_URL: process.env.FISH_SPEECH_HEALTH_URL, KOKORO_URL: process.env.KOKORO_URL };
  process.env.FISH_SPEECH_URL = 'http://127.0.0.1:1/v1/tts';
  process.env.FISH_SPEECH_HEALTH_URL = 'http://127.0.0.1:1/health';
  delete process.env.KOKORO_URL;
  await withoutPiperEnv(async () => {
    const ctx = await fixture();
    const health = await (await ctx.request('/health')).json();
    assert.equal(health.status, 'Worker connected, no voice provider available');
    assert.equal(health.online, true);
    assert.equal(health.providerAvailable, false);
    assert.equal(health.providers.find(({ id }) => id === 'fish-speech').available, false);
    await cleanup(ctx);
  });
  for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});

test('health verifies a configured generic HTTP Fish Speech endpoint', async () => {
  const previous = { GENERIC_TTS_URL: process.env.GENERIC_TTS_URL, GENERIC_TTS_HEALTH_URL: process.env.GENERIC_TTS_HEALTH_URL, FISH_SPEECH_URL: process.env.FISH_SPEECH_URL, KOKORO_URL: process.env.KOKORO_URL };
  const providerServer = createServer((req, res) => res.writeHead(req.url === '/health' ? 200 : 404).end());
  providerServer.listen(0, '127.0.0.1');
  await new Promise((resolve) => providerServer.once('listening', resolve));
  const base = `http://127.0.0.1:${providerServer.address().port}`;
  process.env.GENERIC_TTS_URL = `${base}/v1/tts`;
  process.env.GENERIC_TTS_HEALTH_URL = `${base}/health`;
  delete process.env.FISH_SPEECH_URL; delete process.env.KOKORO_URL;
  await withoutPiperEnv(async () => {
    const ctx = await fixture();
    try {
      const health = await (await ctx.request('/health')).json();
      assert.equal(health.providers.find(({ id }) => id === 'generic-http').available, true);
      assert.equal(health.providerAvailable, true);
      assert.equal(health.status, 'ONLINE');
    } finally { await cleanup(ctx); }
  });
  await new Promise((resolve) => providerServer.close(resolve));
  for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});

test('health does not report an unreachable generic HTTP provider as available', async () => {
  const previous = { GENERIC_TTS_URL: process.env.GENERIC_TTS_URL, GENERIC_TTS_HEALTH_URL: process.env.GENERIC_TTS_HEALTH_URL, FISH_SPEECH_URL: process.env.FISH_SPEECH_URL, KOKORO_URL: process.env.KOKORO_URL };
  process.env.GENERIC_TTS_URL = 'http://127.0.0.1:1/v1/tts';
  process.env.GENERIC_TTS_HEALTH_URL = 'http://127.0.0.1:1/health';
  delete process.env.FISH_SPEECH_URL; delete process.env.KOKORO_URL;
  await withoutPiperEnv(async () => {
    const ctx = await fixture();
    try {
      const health = await (await ctx.request('/health')).json();
      assert.equal(health.providers.find(({ id }) => id === 'generic-http').available, false);
      assert.equal(health.providerAvailable, false);
      assert.equal(health.status, 'Worker connected, no voice provider available');
    } finally { await cleanup(ctx); }
  });
  for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});

test('unavailable provider returns 503', async () => {
  await withoutPiperEnv(async () => {
  const ctx = await fixture();
  const res = await ctx.request('/synthesize', auth({ text: 'Hello', provider: 'piper' }));
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, 'provider_unavailable');
  await cleanup(ctx);
  });
});

test('cache reuses generated preview audio', async () => {
  const ctx = await fixture();
  const payload = { text: 'Cache me.', format: 'mp3' };
  await ctx.request('/preview', auth(payload));
  const second = await ctx.request('/preview', auth(payload));
  assert.equal(second.status, 200);
  const metadata = JSON.parse(Buffer.from(second.headers.get('x-novelverse-metadata'), 'base64').toString());
  assert.equal(metadata.cacheHit, true);
  await cleanup(ctx);
});
