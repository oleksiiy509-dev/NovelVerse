import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { R2AudioStore } from '../cloud/r2.js';
import { SupabaseRenderMetadata } from '../cloud/render-metadata.js';

async function mockCloud(handler) {
  const server = createServer(handler).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

test('R2 adapter signs uploads and supports ranged streaming', async () => {
  const audio = Buffer.from('cloud-audio');
  let stored;
  const cloud = await mockCloud((req, res) => {
    assert.match(req.headers.authorization, /^AWS4-HMAC-SHA256 /);
    if (req.method === 'PUT') {
      const chunks = []; req.on('data', (chunk) => chunks.push(chunk));
      return req.on('end', () => { stored = Buffer.concat(chunks); res.writeHead(200).end(); });
    }
    assert.equal(req.headers.range, 'bytes=2-5');
    res.writeHead(206, { 'content-type': 'audio/mpeg', 'content-range': `bytes 2-5/${stored.length}` }).end(stored.subarray(2, 6));
  });
  try {
    const store = new R2AudioStore({ r2Endpoint: cloud.url, r2Bucket: 'audio', r2AccessKeyId: 'key', r2SecretAccessKey: 'secret' });
    await store.put('book/chapter/audio.mp3', audio, 'audio/mpeg');
    const response = await store.get('book/chapter/audio.mp3', 'bytes=2-5');
    assert.equal(response.status, 206);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), audio.subarray(2, 6));
  } finally { await cloud.close(); }
});

test('Supabase adapter persists metadata only and recovers interrupted jobs', async () => {
  let saved;
  const cloud = await mockCloud((req, res) => {
    assert.equal(req.headers.apikey, 'service-key');
    if (req.method === 'POST') {
      let body = ''; req.on('data', (chunk) => { body += chunk; });
      return req.on('end', () => { saved = JSON.parse(body); res.writeHead(204).end(); });
    }
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify([{ ...saved, created_at: new Date().toISOString() }]));
  });
  try {
    const metadata = new SupabaseRenderMetadata({ supabaseUrl: cloud.url, supabaseServiceRoleKey: 'service-key' });
    await metadata.save({ id: '11111111-1111-4111-8111-111111111111', status: 'rendering', request: { chapterId: 'chapter-1', provider: 'fish-speech', segments: [{ text: 'Hello' }] }, completed: 1, total: 2 });
    assert.equal(saved.chapter_id, 'chapter-1');
    assert.equal(saved.status, 'rendering');
    assert.equal('audio' in saved, false);
    assert.equal((await metadata.resumable())[0].request.segments[0].text, 'Hello');
  } finally { await cloud.close(); }
});
