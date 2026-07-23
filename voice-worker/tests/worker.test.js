import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../api/app.js';

async function fixture(overrides = {}) {
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'nv-worker-'));
  const server = createApp({ token: 'secret', defaultProvider: 'mock', cacheDir, logLevel: 'silent', rateLimitMax: 1000, ...overrides }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { cacheDir, close: () => new Promise((resolve) => server.close(resolve)), request: (url, options) => fetch(`${base}${url}`, options) };
}
async function cleanup(ctx) { await ctx.close(); await rm(ctx.cacheDir, { recursive: true, force: true }); }
function auth(body) { return { method: 'POST', headers: { authorization: 'Bearer secret', 'content-type': 'application/json' }, body: JSON.stringify(body) }; }

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

test('voice list requires authentication', async () => {
  const ctx = await fixture();
  assert.equal((await ctx.request('/voices')).status, 401);
  const res = await ctx.request('/voices', { headers: { authorization: 'Bearer secret' } });
  assert.equal(res.status, 200);
  assert.ok((await res.json()).providers.find((provider) => provider.id === 'mock'));
  await cleanup(ctx);
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
  const ctx = await fixture();
  const res = await ctx.request('/synthesize', auth({ text: 'Hello', provider: 'piper' }));
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, 'provider_unavailable');
  await cleanup(ctx);
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
