import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { getProvider } from '../providers/index.js';
import { prepareNarratedChapterSegments, prepareNarratedSentences } from '../../src/lib/narrationRendering.js';
import { narratorVoice } from './narration.js';
import { R2AudioStore } from '../cloud/r2.js';
import { SupabaseRenderMetadata } from '../cloud/render-metadata.js';

const jobs = new Map();
const exec = promisify(execFile);
const pending = [];
const chapters = new Map();
let active = false;
let lastError = '';
const stateFiles = new Map();
const cloudServices = new Map();

function cloud(cfg) {
  if (!cloudServices.has(cfg)) cloudServices.set(cfg, { objects: new R2AudioStore(cfg), metadata: new SupabaseRenderMetadata(cfg) });
  return cloudServices.get(cfg);
}

const databaseStatus = (status) => ({ Preparing: 'queued', Queued: 'queued', Rendering: 'rendering', Merging: 'rendering', Uploading: 'uploading', Finished: 'completed', Failed: 'failed', Cancelled: 'cancelled', Retry: 'retry' }[status] || 'queued');

const fingerprint = ({ language, provider, segments }) => createHash('sha256').update(JSON.stringify({ language, provider, segments })).digest('hex');
const safeName = (value) => String(value || 'Book').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim().replace(/[. ]+$/g, '').slice(0, 80) || 'Book';
const chapterName = (number, extension) => `Chapter ${String(Math.max(1, Number(number) || 1)).padStart(4, '0')}.${extension}`;

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

const metadataFile = (cfg) => path.join(cfg.outputDir, '.audio-metadata.json');
const chapterKey = (cfg, chapterId) => `${cfg.outputDir}\0${chapterId}`;

async function persistMetadata(cfg) {
  const file = metadataFile(cfg);
  const records = [...chapters.values()].filter((job) => job.cfg?.outputDir === cfg.outputDir).map((job) => ({
    id: job.id, key: job.key, request: job.request, status: job.status, completed: job.completed, total: job.total,
    error: job.error, file: job.file, mp3File: job.mp3File, storage: job.storage, size: job.size,
    duration: job.duration, generationTime: job.generationTime, createdAt: job.createdAt,
  }));
  await mkdir(cfg.outputDir, { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify({ version: 1, records }, null, 2));
  await rename(temporary, file);
  const metadata = cloud(cfg).metadata;
  if (metadata.enabled) await Promise.all([...chapters.values()].filter((job) => job.cfg === cfg).map((job) => metadata.save({ ...job, status: databaseStatus(job.status) })));
}

async function loadMetadata(cfg) {
  const file = metadataFile(cfg);
  if (stateFiles.has(file)) return stateFiles.get(file);
  const loading = (async () => {
    try {
      const stored = JSON.parse(await readFile(file, 'utf8'));
      for (const record of stored.records || []) {
        if (!record.request?.chapterId || chapters.has(chapterKey(cfg, record.request.chapterId))) continue;
        const job = { ...record, cfg, cached: record.status === 'Finished', resumed: !['Finished', 'Failed', 'Cancelled'].includes(record.status), cancelled: false };
        chapters.set(chapterKey(cfg, record.request.chapterId), job);
        jobs.set(job.id, job);
        if (job.resumed) { job.status = 'Preparing'; pending.push(job); }
      }
      const metadata = cloud(cfg).metadata;
      if (metadata.enabled) {
        for (const record of await metadata.resumable()) {
          const key = chapterKey(cfg, record.chapter_id);
          if (chapters.has(key) || !record.request?.segments?.length) continue;
          const job = { id: record.job_id, key: fingerprint(record.request), cfg, request: record.request, status: 'Preparing', completed: record.completed_segments || 0, total: record.total_segments || record.request.segments.length, attempts: record.attempts || 0, createdAt: record.created_at, resumed: true, cached: false, cancelled: false };
          chapters.set(key, job); jobs.set(job.id, job); pending.push(job);
        }
      }
      runNext();
    } catch { /* the registry is created after the first request */ }
  })();
  stateFiles.set(file, loading);
  return loading;
}

async function uploadAudio(cfg, job) {
  const objects = cloud(cfg).objects;
  const prefix = path.join(String(job.request.bookId || 'unknown'), String(job.request.chapterId));
  if (objects.enabled) {
    const source = job.mp3File || job.file;
    const contentType = job.mp3File ? 'audio/mpeg' : 'audio/wav';
    const objectKey = `${String(job.request.bookId || 'unknown')}/${String(job.request.chapterId)}/audio.${job.mp3File ? 'mp3' : 'wav'}`;
    const uploaded = await objects.put(objectKey, await readFile(source), contentType);
    Object.assign(job, { objectKey: uploaded.key, contentType: uploaded.contentType });
    return { r2: true, objectKey: uploaded.key };
  }
  const destination = path.join(cfg.storageDir, prefix);
  await mkdir(destination, { recursive: true });
  const wav = path.join(destination, 'audio.wav');
  await copyFile(job.file, wav);
  let mp3 = null;
  if (job.mp3File) { mp3 = path.join(destination, 'audio.mp3'); await copyFile(job.mp3File, mp3); }
  return { wav, mp3, wavKey: `${prefix}/audio.wav`, mp3Key: mp3 ? `${prefix}/audio.mp3` : null };
}

async function render(job) {
  const started = Date.now();
  const { cfg, request } = job;
  try {
    job.attempts = (job.attempts || 0) + 1;
    job.status = job.attempts > 1 ? 'Retry' : 'Preparing';
    const provider = getProvider(request.provider === 'auto' ? 'narrator' : request.provider, cfg);
    const rendered = [];
    job.status = 'Rendering';
    const synthesisSegments = request.chapterTitle ? [...prepareNarratedSentences(request.chapterTitle, { voice: request.voice }), ...request.segments] : request.segments;
    for (let index = 0; index < synthesisSegments.length; index += 1) {
      if (job.cancelled) throw Object.assign(new Error('Generation cancelled'), { cancelled: true });
      const segment = synthesisSegments[index];
      const checkpointDir = path.join(cfg.outputDir, '.render-cache', job.key);
      const checkpoint = path.join(checkpointDir, `${index}.wav`);
      let audio;
      try { audio = await readFile(checkpoint); } catch {
        const result = await provider.synthesize({ text: segment.text, voice: request.voice, language: request.language, format: 'wav', options: { ...segment, voice: request.voice, consistentVoice: true, emotion: String(segment.emotion || 'normal').toLowerCase(), delivery: segment.type || 'narration' } });
        audio = result.audio;
        await mkdir(checkpointDir, { recursive: true });
        await writeFile(checkpoint, audio);
      }
      rendered.push(audio);
      job.liveChunks = rendered;
      for (const subscriber of job.subscribers || []) subscriber.write(index === 0 ? streamingWav(audio) : Buffer.from(audio).subarray(44));
      job.completed = Math.min(request.segments.length, index + (request.chapterTitle ? 0 : 1));
      await persistMetadata(cfg);
    }
    job.status = 'Merging';
    const audio = mergeWav(rendered);
    const folder = path.join(cfg.outputDir, safeName(request.bookTitle));
    try { await mkdir(folder, { recursive: true }); } catch { throw new Error('Output folder unavailable'); }
    const wavFile = path.join(folder, chapterName(request.chapterNumber, 'wav'));
    await writeFile(wavFile, audio);
    const details = await inspectWav(wavFile, audio.length);
    let mp3File = null;
    let ffmpegMissing = false;
    try {
      mp3File = path.join(folder, chapterName(request.chapterNumber, 'mp3'));
      await exec(process.env.FFMPEG_BIN || 'ffmpeg', ['-y', '-loglevel', 'error', '-i', wavFile, mp3File], { windowsHide: true });
    } catch (error) {
      mp3File = null;
      if (error.code === 'ENOENT' || error.code === 'EACCES') ffmpegMissing = true;
      else throw new Error(`FFmpeg conversion failed: ${error.message}`);
    }
    const info = await stat(wavFile);
    const manifest = path.join(folder, `.chapter-${String(request.chapterNumber).padStart(4, '0')}.json`);
    await writeFile(manifest, JSON.stringify({ key: job.key, file: wavFile, mp3File, format: 'wav', duration: details.duration }));
    Object.assign(job, { ...details, size: info.size, file: wavFile, mp3File, folder, fileName: path.basename(wavFile), mp3FileName: mp3File && path.basename(mp3File), format: 'wav', ffmpegMissing, generationTime: Date.now() - started, cached: false });
    job.status = 'Uploading';
    job.storage = await uploadAudio(cfg, job);
    job.status = 'Finished';
  } catch (error) {
    job.status = error.cancelled ? 'Cancelled' : 'Failed';
    job.error = error.cancelled ? 'Generation cancelled' : error.message;
    job.generationTime = Date.now() - started;
    lastError = job.error;
  } finally {
    for (const subscriber of job.subscribers || []) subscriber.end();
    job.subscribers?.clear();
    job.liveChunks = null;
    await persistMetadata(cfg).catch(() => {});
    active = false;
    runNext();
  }
}

export function getChapterQueueStatus() {
  return { busy: active, queued: pending.length, lastError };
}

function runNext() {
  if (active) return;
  const job = pending.shift();
  if (!job) return;
  active = true;
  render(job);
}

export async function createChapterJob(cfg, body = {}) {
  await loadMetadata(cfg);
  if (body.chapterId && !chapters.has(chapterKey(cfg, body.chapterId))) await loadCloudChapter(cfg, body.chapterId);
  const reserved = body.chapterId && chapters.get(chapterKey(cfg, body.chapterId));
  if (reserved) return { ...publicJob(reserved), joined: true };
  const segments = Array.isArray(body.segments) ? body.segments.filter((item) => String(item.text || '').trim()) : [];
  if (!segments.length) throw Object.assign(new Error('segments are required'), { status: 400 });
  const voice = narratorVoice();
  const request = { bookId: body.bookId, chapterId: body.chapterId, chapterNumber: Number(body.chapterNumber) || 1, bookTitle: body.bookTitle, chapterTitle: body.chapterTitle, language: body.language || cfg.defaultLanguage, provider: body.provider || 'narrator', voice, segments: prepareNarratedChapterSegments(segments, { voice, mode: body.narrationMode }) };
  if (!request.chapterId) throw Object.assign(new Error('chapterId is required'), { status: 400 });
  const existing = chapters.get(chapterKey(cfg, request.chapterId));
  if (existing) return { ...publicJob(existing), joined: true };
  const key = fingerprint(request);
  // Reserve the chapter synchronously before any filesystem await. Concurrent
  // requests then observe this same job rather than enqueueing another render.
  const job = { id: randomUUID(), key, cfg, request, status: 'Queued', completed: 0, total: segments.length, generationTime: 0, cached: false, createdAt: new Date().toISOString(), subscribers: new Set(), liveChunks: [] };
  jobs.set(job.id, job);
  chapters.set(chapterKey(cfg, request.chapterId), job);
  const folder = path.join(cfg.outputDir, safeName(request.bookTitle));
  try { await mkdir(folder, { recursive: true }); } catch { throw Object.assign(new Error('Output folder unavailable'), { status: 503 }); }
  const manifest = path.join(folder, `.chapter-${String(request.chapterNumber).padStart(4, '0')}.json`);
  try {
    const cached = JSON.parse(await readFile(manifest, 'utf8'));
    if (cached.key !== key) throw new Error('cache changed');
    if (cached.format !== 'wav' || path.extname(cached.file).toLowerCase() !== '.wav') throw new Error('legacy cache format');
    const info = await stat(cached.file);
    if (cached.mp3File) await stat(cached.mp3File);
    Object.assign(job, { status: 'Finished', completed: segments.length, file: cached.file, mp3File: cached.mp3File || null, folder, fileName: path.basename(cached.file), mp3FileName: cached.mp3File && path.basename(cached.mp3File), format: 'wav', cached: true, size: info.size, duration: cached.duration });
    await persistMetadata(cfg); return { ...publicJob(job), joined: false };
  } catch { /* cache miss */ }
  pending.push(job); await persistMetadata(cfg); runNext(); return { ...publicJob(job), joined: false };
}

export function getChapterJob(id) { return jobs.get(id); }
async function loadCloudChapter(cfg, chapterId) {
  const record = await cloud(cfg).metadata.get(chapterId);
  if (!record || record.status !== 'completed' || !record.object_key) return null;
  const job = {
    id: record.job_id, key: fingerprint(record.request), cfg, request: record.request,
    status: 'Finished', completed: record.total_segments, total: record.total_segments,
    attempts: record.attempts || 0, createdAt: record.created_at, generationTime: 0,
    cached: true, objectKey: record.object_key, contentType: record.content_type,
    size: record.byte_size, duration: record.duration_seconds,
  };
  jobs.set(job.id, job); chapters.set(chapterKey(cfg, chapterId), job); return job;
}

export async function getChapterAudio(cfg, chapterId) {
  await loadMetadata(cfg);
  return chapters.get(chapterKey(cfg, chapterId)) || loadCloudChapter(cfg, chapterId);
}
export async function getChapterAudioStream(cfg, job, range) {
  const objects = cloud(cfg).objects;
  if (!job?.objectKey || !objects.enabled) return null;
  return objects.get(job.objectKey, range);
}
function streamingWav(buffer) {
  const audio = Buffer.from(buffer);
  const header = Buffer.from(audio.subarray(0, 44));
  // A streaming-size header lets players consume PCM while the final length is unknown.
  header.writeUInt32LE(0xffffffff, 4);
  header.writeUInt32LE(0xffffffff - 36, 40);
  return Buffer.concat([header, audio.subarray(44)]);
}

export function subscribeChapterAudio(job) {
  if (!job || ['Failed', 'Cancelled'].includes(job.status)) return null;
  const stream = new PassThrough();
  const chunks = job.liveChunks || [];
  chunks.forEach((chunk, index) => stream.write(index === 0 ? streamingWav(chunk) : Buffer.from(chunk).subarray(44)));
  if (job.status === 'Finished') stream.end();
  else {
    job.subscribers ||= new Set();
    job.subscribers.add(stream);
    stream.once('close', () => job.subscribers?.delete(stream));
  }
  return stream;
}

export function cancelChapterJob(id) { const job = jobs.get(id); if (job && !['Finished', 'Failed', 'Cancelled'].includes(job.status)) { job.cancelled = true; if (job.status === 'Queued') { job.status = 'Cancelled'; const index = pending.indexOf(job); if (index >= 0) pending.splice(index, 1); persistMetadata(job.cfg).catch(() => {}); } } return job; }

export async function retryChapterJob(cfg, chapterId) {
  await loadMetadata(cfg);
  const job = chapters.get(chapterKey(cfg, chapterId));
  if (!job) return null;
  if (!['Failed', 'Cancelled'].includes(job.status)) return job;
  Object.assign(job, { status: 'Retry', error: null, cancelled: false, completed: 0, liveChunks: [], subscribers: new Set() });
  pending.push(job); await persistMetadata(cfg); runNext(); return job;
}

export async function deleteChapterAudio(cfg, chapterId) {
  await loadMetadata(cfg);
  const key = chapterKey(cfg, chapterId);
  const job = chapters.get(key);
  if (!job) return false;
  if (!['Finished', 'Failed', 'Cancelled'].includes(job.status)) throw Object.assign(new Error('Cannot delete audio while rendering'), { status: 409, code: 'render_in_progress' });
  if (job.objectKey && cloud(cfg).objects.enabled) await cloud(cfg).objects.delete(job.objectKey);
  if (job.storage && !job.storage.r2) await rm(path.dirname(job.storage.wav), { recursive: true, force: true });
  await rm(path.join(cfg.outputDir, '.render-cache', job.key), { recursive: true, force: true });
  await cloud(cfg).metadata.delete(chapterId);
  jobs.delete(job.id); chapters.delete(key); await persistMetadata(cfg); return true;
}
export function publicJob(job) {
  if (!job) return null;
  const { cfg, request, cancelled, file, mp3File, status, error, subscribers, liveChunks, ...safe } = job;
  const publicStatus = databaseStatus(status);
  const progress = job.total ? Math.min(100, Math.round((job.completed / job.total) * 100)) : 0;
  return {
    ...safe,
    status: publicStatus,
    progress: publicStatus === 'completed' ? 100 : progress,
    ...(publicStatus === 'failed' ? { error } : {}),
    audioUrl: publicStatus === 'completed' ? `/chapter-jobs/${job.id}/download` : null,
  };
}
