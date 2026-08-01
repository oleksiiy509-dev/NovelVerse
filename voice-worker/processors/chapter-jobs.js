import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getProvider } from '../providers/index.js';

const jobs = new Map();
const pending = [];
let active = false;

const fingerprint = (payload) => createHash('sha256').update(JSON.stringify(payload)).digest('hex');
const safeName = (value) => String(value || 'chapter').replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'chapter';

function mergeWav(buffers) {
  if (buffers.length === 1) return buffers[0];
  const first = Buffer.from(buffers[0]);
  const chunks = buffers.map((buffer) => Buffer.from(buffer).subarray(44));
  const data = Buffer.concat(chunks);
  const output = Buffer.concat([first.subarray(0, 44), data]);
  output.writeUInt32LE(output.length - 8, 4);
  output.writeUInt32LE(data.length, 40);
  return output;
}

async function inspectWav(file, size) {
  const header = Buffer.alloc(44);
  const source = await readFile(file);
  source.copy(header, 0, 0, 44);
  const byteRate = header.readUInt32LE(28) || 1;
  return { size, duration: Number(((size - 44) / byteRate).toFixed(2)) };
}

async function render(job) {
  const started = Date.now();
  const { cfg, request } = job;
  try {
    job.status = 'Preparing';
    const provider = getProvider('piper', cfg);
    if (!provider.available) throw new Error(provider.status?.reason || 'Piper is unavailable');
    const rendered = [];
    job.status = 'Rendering';
    for (let index = 0; index < request.segments.length; index += 1) {
      if (job.cancelled) throw Object.assign(new Error('Generation cancelled'), { cancelled: true });
      const segment = request.segments[index];
      const result = await provider.synthesize({ text: segment.text, language: request.language, format: 'wav', options: { emotion: String(segment.emotion || 'normal').toLowerCase(), rate: segment.rate, pitch: segment.pitch } });
      rendered.push(result.audio);
      job.completed = index + 1;
    }
    job.status = 'Merging';
    const audio = mergeWav(rendered);
    await mkdir(cfg.outputDir, { recursive: true });
    const fileName = `${safeName(request.bookTitle)}-${safeName(request.chapterTitle)}-${job.key.slice(0, 10)}.wav`;
    const file = path.join(cfg.outputDir, fileName);
    await writeFile(file, audio);
    const details = await inspectWav(file, audio.length);
    Object.assign(job, details, { status: 'Finished', file, fileName, generationTime: Date.now() - started, cached: false });
  } catch (error) {
    job.status = 'Failed';
    job.error = error.cancelled ? 'Generation cancelled' : error.message;
    job.generationTime = Date.now() - started;
  } finally {
    active = false;
    runNext();
  }
}

function runNext() {
  if (active) return;
  const job = pending.shift();
  if (!job) return;
  active = true;
  render(job);
}

export async function createChapterJob(cfg, body = {}) {
  const segments = Array.isArray(body.segments) ? body.segments.filter((item) => String(item.text || '').trim()) : [];
  if (!segments.length) throw Object.assign(new Error('segments are required'), { status: 400 });
  const request = { bookId: body.bookId, chapterId: body.chapterId, bookTitle: body.bookTitle, chapterTitle: body.chapterTitle, language: body.language || cfg.defaultLanguage, segments: segments.map(({ text, voice, emotion, rate, pitch }) => ({ text: String(text).trim(), voice, emotion, rate, pitch })) };
  const key = fingerprint(request);
  await mkdir(cfg.outputDir, { recursive: true });
  const prefix = `${safeName(request.bookTitle)}-${safeName(request.chapterTitle)}-${key.slice(0, 10)}.wav`;
  const existing = path.join(cfg.outputDir, prefix);
  try {
    const info = await stat(existing);
    const details = await inspectWav(existing, info.size);
    const job = { id: randomUUID(), key, request, status: 'Finished', completed: segments.length, total: segments.length, file: existing, fileName: prefix, generationTime: 0, cached: true, ...details };
    jobs.set(job.id, job); return publicJob(job);
  } catch { /* cache miss */ }
  const job = { id: randomUUID(), key, cfg, request, status: 'Preparing', completed: 0, total: segments.length, generationTime: 0, cached: false };
  jobs.set(job.id, job); pending.push(job); runNext(); return publicJob(job);
}

export function getChapterJob(id) { return jobs.get(id); }
export function cancelChapterJob(id) { const job = jobs.get(id); if (job && !['Finished', 'Failed'].includes(job.status)) job.cancelled = true; return job; }
export function publicJob(job) { if (!job) return null; const { cfg, request, cancelled, file, ...safe } = job; return { ...safe, audioUrl: job.status === 'Finished' ? `/chapter-jobs/${job.id}/audio` : null }; }
