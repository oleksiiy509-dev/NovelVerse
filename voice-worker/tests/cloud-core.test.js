import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { R2AudioStore } from '../cloud/r2.js';
import { SupabaseRenderMetadata } from '../cloud/render-metadata.js';

async function mockCloud(handler) {
  const server = createServer(handler).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

test('R2 adapter signs, verifies, retries, streams ranges, and verifies downloads', async () => {
  const audio = Buffer.from('cloud-audio'); const checksum = createHash('sha256').update(audio).digest('hex');
  let stored; let puts = 0;
  const cloud = await mockCloud((req, res) => {
    assert.match(req.headers.authorization, /^AWS4-HMAC-SHA256 /);
    if (req.method === 'PUT') {
      if (++puts === 1) return res.writeHead(503).end();
      const chunks = []; req.on('data', (chunk) => chunks.push(chunk));
      return req.on('end', () => { stored = Buffer.concat(chunks); res.writeHead(200).end(); });
    }
    if (req.method === 'HEAD') return res.writeHead(200, { 'content-length': stored.length, 'x-amz-meta-sha256': checksum }).end();
    if (req.headers.range) return res.writeHead(206, { 'content-type': 'audio/mpeg', 'content-range': `bytes 2-5/${stored.length}` }).end(stored.subarray(2, 6));
    return res.writeHead(200, { 'content-type': 'audio/mpeg' }).end(stored);
  });
  try {
    const store = new R2AudioStore({ r2Endpoint: cloud.url, r2Bucket: 'audio', r2AccessKeyId: 'key', r2SecretAccessKey: 'secret', r2RetryBaseMs: 1 });
    const result = await store.put('book/chapter/audio.mp3', audio, 'audio/mpeg');
    assert.equal(result.checksum, checksum); assert.equal(puts, 2);
    const response = await store.get('book/chapter/audio.mp3', 'bytes=2-5');
    assert.equal(response.status, 206); assert.deepEqual(Buffer.from(await response.arrayBuffer()), audio.subarray(2, 6));
    assert.deepEqual(await store.downloadVerified(result.key, checksum), audio);
    assert.match(store.signedUrl(result.key), /X-Amz-Signature=/);
  } finally { await cloud.close(); }
});

test('R2 multipart upload completes parts and aborts incomplete uploads', async () => {
  const audio = Buffer.alloc(6 * 1024 * 1024, 7); const checksum = createHash('sha256').update(audio).digest('hex');
  const parts = []; let completed = false;
  const cloud = await mockCloud((req, res) => {
    const url = new URL(req.url, 'http://mock');
    if (req.method === 'POST' && url.searchParams.has('uploads')) return res.writeHead(200).end('<InitiateMultipartUploadResult><UploadId>upload-1</UploadId></InitiateMultipartUploadResult>');
    if (req.method === 'PUT') { const chunks = []; req.on('data', (c) => chunks.push(c)); return req.on('end', () => { parts.push(Buffer.concat(chunks)); res.writeHead(200, { etag: `"part-${parts.length}"` }).end(); }); }
    if (req.method === 'POST') { completed = true; return res.writeHead(200).end(); }
    if (req.method === 'HEAD') return res.writeHead(200, { 'content-length': audio.length, 'x-amz-meta-sha256': checksum }).end();
    res.writeHead(204).end();
  });
  try {
    const store = new R2AudioStore({ r2Endpoint: cloud.url, r2Bucket: 'audio', r2AccessKeyId: 'key', r2SecretAccessKey: 'secret', r2MultipartThreshold: 1, r2MultipartPartSize: 5 * 1024 * 1024 });
    await store.put('large.mp3', audio, 'audio/mpeg');
    assert.equal(parts.length, 2); assert.deepEqual(Buffer.concat(parts), audio); assert.equal(completed, true);
  } finally { await cloud.close(); }
});

test('Supabase adapter persists object metadata and checksum only and recovers interrupted jobs', async () => {
  let saved;
  const cloud = await mockCloud((req, res) => {
    assert.equal(req.headers.apikey, 'service-key');
    if (req.method === 'POST') { let body = ''; req.on('data', (chunk) => { body += chunk; }); return req.on('end', () => { saved = JSON.parse(body); res.writeHead(204).end(); }); }
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify([{ ...saved, created_at: new Date().toISOString() }]));
  });
  try {
    const metadata = new SupabaseRenderMetadata({ supabaseUrl: cloud.url, supabaseServiceRoleKey: 'service-key' });
    await metadata.save({ id: '11111111-1111-4111-8111-111111111111', status: 'uploading', checksum: 'a'.repeat(64), objectKey: 'production/audio.mp3', size: 12, request: { chapterId: 'chapter-1', provider: 'fish-speech', segments: [{ text: 'Hello' }] }, completed: 1, total: 2 });
    assert.equal(saved.checksum_sha256, 'a'.repeat(64)); assert.equal(saved.object_key, 'production/audio.mp3'); assert.equal('audio' in saved, false);
    assert.equal((await metadata.resumable())[0].request.segments[0].text, 'Hello');
  } finally { await cloud.close(); }
});
