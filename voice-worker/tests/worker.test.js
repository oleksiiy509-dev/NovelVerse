import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createApp } from '../api/app.js';
import { requireBearerToken } from '../middleware/auth.js';

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
    "console.log(JSON.stringify({ PIPER_BIN: process.env.PIPER_BIN, PIPER_MODEL: process.env.PIPER_MODEL }));",
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
      "console.log(JSON.stringify({ PIPER_BIN: process.env.PIPER_BIN, PIPER_MODEL: process.env.PIPER_MODEL, DEFAULT_PROVIDER: config.defaultProvider }));",
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
  assert.equal(body.version, '1.0.0');
  assert.ok(body.providers.some((provider) => provider.id === 'mock' && provider.available));
  assert.ok(body.uptime >= 0);
  await cleanup(ctx);
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
